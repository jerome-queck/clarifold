import type {
  AuthenticationState,
  ChatGptLogin,
  ModelRuntime,
  SessionProposal,
  TeachingRequest
} from "../shared/model-runtime";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";

type ProtocolId = number;

interface ProtocolMessage {
  id?: ProtocolId;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface AppServerTransport {
  write(line: string): void;
  onLine(listener: (line: string) => void): void;
  onClose(listener: (error?: Error) => void): void;
  close(): void;
}

class CodexProcessTransport implements AppServerTransport {
  private readonly process: ChildProcessWithoutNullStreams;
  private lineListener: ((line: string) => void) | null = null;
  private closeListener: ((error?: Error) => void) | null = null;
  private stderr = "";
  private closed = false;

  constructor(command: string, cwd: string) {
    this.process = spawn(command, ["app-server", "--stdio"], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"]
    });
    createInterface({ input: this.process.stdout }).on("line", (line) => this.lineListener?.(line));
    this.process.stderr.on("data", (chunk: Buffer) => {
      this.stderr = `${this.stderr}${chunk.toString()}`.slice(-4_000);
    });
    this.process.once("error", (error) => this.closeListener?.(error));
    this.process.once("exit", (code, signal) => {
      this.closed = true;
      const detail = this.stderr.trim();
      if (detail) console.error("Codex app-server diagnostics:", detail);
      this.closeListener?.(new Error(
        `Codex app-server stopped${code === null ? ` with signal ${signal}` : ` with code ${code}`}.`
      ));
    });
  }

  write(line: string): void {
    if (this.closed || !this.process.stdin.writable) throw new Error("Codex app-server is not writable.");
    this.process.stdin.write(line);
  }

  onLine(listener: (line: string) => void): void {
    this.lineListener = listener;
  }

  onClose(listener: (error?: Error) => void): void {
    this.closeListener = listener;
  }

  close(): void {
    if (this.closed) return;
    this.process.stdin.end();
    const terminationTimer = setTimeout(() => {
      if (!this.closed) this.process.kill("SIGTERM");
    }, 1_000);
    terminationTimer.unref();
  }
}

class AppServerClient {
  private nextId = 1;
  private readonly pending = new Map<ProtocolId, {
    resolve(value: unknown): void;
    reject(error: Error): void;
  }>();
  private readonly notificationListeners = new Set<(message: ProtocolMessage) => void>();
  private readonly failureListeners = new Set<(error: Error) => void>();
  private failureError: Error | null = null;

  constructor(private readonly transport: AppServerTransport) {
    transport.onLine((line) => this.receive(line));
    transport.onClose((error) => this.rejectPending(error ?? new Error("Codex app-server stopped.")));
  }

  async initialize(): Promise<void> {
    const response = await this.request("initialize", {
      clientInfo: { name: "quick_study", title: "Quick Study", version: "0.1.0" },
      capabilities: null
    });
    if (!isInitializeResponse(response)) {
      throw new Error("Codex app-server uses an incompatible initialize response.");
    }
    this.notify("initialized", {});
  }

  request(method: string, params?: unknown, timeoutMs = 10_000): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex app-server timed out while handling ${method}.`));
      }, timeoutMs);
      timer.unref();
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); }
      });
      this.send({ id, method, params });
    });
  }

  notify(method: string, params: unknown): void {
    this.send({ method, params });
  }

  close(): void {
    this.transport.close();
  }

  onNotification(listener: (message: ProtocolMessage) => void): () => void {
    this.notificationListeners.add(listener);
    return () => this.notificationListeners.delete(listener);
  }

  onFailure(listener: (error: Error) => void): () => void {
    this.failureListeners.add(listener);
    if (this.failureError) listener(this.failureError);
    return () => this.failureListeners.delete(listener);
  }

  private send(message: ProtocolMessage): void {
    this.transport.write(`${JSON.stringify(message)}\n`);
  }

  private receive(line: string): void {
    let message: ProtocolMessage;
    try {
      message = JSON.parse(line) as ProtocolMessage;
    } catch {
      this.rejectPending(new Error("Codex app-server sent malformed JSON."));
      return;
    }
    if (message.id === undefined) {
      for (const listener of this.notificationListeners) listener(message);
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(`Codex app-server error ${message.error.code}: ${message.error.message}`));
    } else {
      pending.resolve(message.result);
    }
  }

  private rejectPending(error: Error): void {
    if (this.failureError) return;
    this.failureError = error;
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    for (const listener of this.failureListeners) listener(error);
  }
}

export class CodexAppServerRuntime implements ModelRuntime {
  private readonly turns = new Map<string, {
    threadId: string;
    content: string;
    onDelta?: (delta: string) => void;
    resolve(content: string): void;
    reject(error: Error): void;
    timeout: ReturnType<typeof setTimeout>;
  }>();
  private readonly earlyTurnNotifications = new Map<string, ProtocolMessage[]>();
  private runtimeFailure: Error | null = null;
  private readonly teachingStartSignals = new Map<string, {
    promise: Promise<void>;
    resolve(): void;
  }>();

  private constructor(
    private readonly client: AppServerClient,
    private readonly cwd: string,
    private readonly turnTimeoutMs: number
  ) {
    client.onNotification((message) => this.receiveNotification(message));
    client.onFailure((error) => {
      this.runtimeFailure = error;
      this.failActiveTurns(error);
    });
  }

  static async connect(
    transport: AppServerTransport,
    cwd: string,
    options: { turnTimeoutMs?: number } = {}
  ): Promise<CodexAppServerRuntime> {
    const client = new AppServerClient(transport);
    await client.initialize();
    return new CodexAppServerRuntime(client, cwd, options.turnTimeoutMs ?? 120_000);
  }

  static launch(cwd: string, command = process.env.QUICK_STUDY_CODEX_PATH ?? "codex"): Promise<CodexAppServerRuntime> {
    return CodexAppServerRuntime.connect(new CodexProcessTransport(command, cwd), cwd);
  }

  async getAuthentication(): Promise<AuthenticationState> {
    const response = await this.client.request("account/read", { refreshToken: false }) as {
      account: null | { type: "apiKey" } | { type: "chatgpt"; email: string | null };
    };
    if (!response.account) return { status: "signedOut" };
    if (response.account.type === "apiKey") {
      return { status: "signedIn", method: "apiKey", accountLabel: null };
    }
    return {
      status: "signedIn",
      method: "chatgpt",
      accountLabel: response.account.email
    };
  }

  async startChatGptLogin(): Promise<ChatGptLogin> {
    const response = await this.client.request("account/login/start", {
      type: "chatgpt",
      codexStreamlinedLogin: true,
      useHostedLoginSuccessPage: true,
      appBrand: "codex"
    }) as { type: "chatgpt"; loginId: string; authUrl: string };
    if (response.type !== "chatgpt") throw new Error("Codex returned an unexpected login response.");
    return { loginId: response.loginId, authUrl: response.authUrl };
  }

  async loginWithApiKey(apiKey: string): Promise<void> {
    await this.client.request("account/login/start", { type: "apiKey", apiKey });
  }

  async proposeSession(mathematics: string): Promise<SessionProposal> {
    const content = await this.runTurn(
      [
        "Interpret this mathematics intake for an adaptive learning session.",
        "Return only the requested JSON. Make the proposal concise and editable.",
        "Pause for confirmation only when ambiguity or likely cost makes a wrong start materially wasteful.",
        "Mathematics intake:",
        mathematics
      ].join("\n\n"),
      SESSION_PROPOSAL_SCHEMA
    );
    return parseSessionProposal(content);
  }

  async streamTeaching(request: TeachingRequest): Promise<void> {
    let resolveStart!: () => void;
    const start = new Promise<void>((resolve) => {
      resolveStart = resolve;
    });
    this.teachingStartSignals.set(request.sessionId, { promise: start, resolve: resolveStart });
    try {
      await this.runTurn(
        [
          "Create one learner-facing Teaching Card, not a chat transcript.",
          `Learning Goal: ${request.learningGoal}`,
          `Scope: ${request.scope}`,
          `Initial teaching direction: ${request.initialTeachingDirection}`,
          "Mathematics:",
          request.mathematics,
          "Explain the mathematical strategy clearly, surface assumptions, and do not claim verification that did not occur."
        ].join("\n\n"),
        undefined,
        request.onDelta,
        request.sessionId
      );
    } catch (error) {
      resolveStart();
      throw error;
    } finally {
      this.teachingStartSignals.delete(request.sessionId);
    }
  }

  async cancelTeaching(sessionId: string): Promise<void> {
    if (!this.activeTeachingTurns.has(sessionId)) {
      await this.teachingStartSignals.get(sessionId)?.promise;
    }
    const active = this.activeTeachingTurns.get(sessionId);
    if (!active) return;
    await this.client.request("turn/interrupt", active);
  }

  async shutdown(): Promise<void> {
    this.client.close();
  }

  private async runTurn(
    prompt: string,
    outputSchema?: unknown,
    onDelta?: (delta: string) => void,
    sessionId?: string
  ): Promise<string> {
    const threadResponse = await this.client.request("thread/start", {
      cwd: this.cwd,
      approvalPolicy: "never",
      sandbox: "read-only",
      ephemeral: true,
      baseInstructions: "You are the bounded teaching runtime for Quick Study. Do not use tools, execute commands, or modify files. Produce only learner-facing mathematical teaching output."
    }) as { thread: { id: string } };
    const turnResponse = await this.client.request("turn/start", {
      threadId: threadResponse.thread.id,
      input: [{ type: "text", text: prompt, text_elements: [] }],
      ...(outputSchema ? { outputSchema } : {})
    }) as { turn: { id: string } };
    if (this.runtimeFailure) {
      throw new Error(`Codex runtime became unavailable. ${this.runtimeFailure.message}`);
    }

    return new Promise<string>((resolve, reject) => {
      this.turns.set(turnResponse.turn.id, {
        threadId: threadResponse.thread.id,
        content: "",
        onDelta,
        resolve,
        reject,
        timeout: createUnrefTimer(() => this.expireTurn(turnResponse.turn.id), this.turnTimeoutMs)
      });
      if (sessionId) this.activeTeachingTurns.set(sessionId, {
        threadId: threadResponse.thread.id,
        turnId: turnResponse.turn.id
      });
      if (sessionId) this.teachingStartSignals.get(sessionId)?.resolve();
      for (const notification of this.earlyTurnNotifications.get(turnResponse.turn.id) ?? []) {
        this.receiveNotification(notification);
      }
      this.earlyTurnNotifications.delete(turnResponse.turn.id);
    });
  }

  private readonly activeTeachingTurns = new Map<string, { threadId: string; turnId: string }>();

  private receiveNotification(message: ProtocolMessage): void {
    if (message.method === "item/agentMessage/delta") {
      const params = message.params as { turnId: string; delta: string };
      const turn = this.turns.get(params.turnId);
      if (!turn) {
        this.bufferEarlyTurnNotification(params.turnId, message);
        return;
      }
      turn.content += params.delta;
      turn.onDelta?.(params.delta);
      return;
    }
    if (message.method !== "turn/completed") return;
    const params = message.params as {
      turn: { id: string; status: "completed" | "interrupted" | "failed"; error: null | { message?: string } };
    };
    const turn = this.turns.get(params.turn.id);
    if (!turn) {
      this.bufferEarlyTurnNotification(params.turn.id, message);
      return;
    }
    this.turns.delete(params.turn.id);
    clearTimeout(turn.timeout);
    for (const [sessionId, active] of this.activeTeachingTurns) {
      if (active.turnId === params.turn.id) this.activeTeachingTurns.delete(sessionId);
    }
    if (params.turn.status === "completed") {
      turn.resolve(turn.content);
    } else if (params.turn.status === "interrupted") {
      turn.reject(new Error("Codex teaching was interrupted."));
    } else {
      turn.reject(new Error(params.turn.error?.message ?? "Codex could not complete this turn."));
    }
  }

  private bufferEarlyTurnNotification(turnId: string, message: ProtocolMessage): void {
    const buffered = this.earlyTurnNotifications.get(turnId) ?? [];
    buffered.push(message);
    this.earlyTurnNotifications.set(turnId, buffered.slice(-100));
  }

  private expireTurn(turnId: string): void {
    const turn = this.turns.get(turnId);
    if (!turn) return;
    this.turns.delete(turnId);
    this.removeActiveTeachingTurn(turnId);
    void this.client.request("turn/interrupt", { threadId: turn.threadId, turnId }).catch(() => undefined);
    turn.reject(new Error("Codex teaching timed out. Retry when the runtime is available."));
  }

  private failActiveTurns(error: Error): void {
    for (const [turnId, turn] of this.turns) {
      clearTimeout(turn.timeout);
      turn.reject(new Error(`Codex runtime became unavailable. ${error.message}`));
      this.removeActiveTeachingTurn(turnId);
    }
    this.turns.clear();
  }

  private removeActiveTeachingTurn(turnId: string): void {
    for (const [sessionId, active] of this.activeTeachingTurns) {
      if (active.turnId === turnId) this.activeTeachingTurns.delete(sessionId);
    }
  }
}

function isInitializeResponse(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const response = value as Record<string, unknown>;
  return typeof response.userAgent === "string"
    && typeof response.codexHome === "string"
    && typeof response.platformFamily === "string"
    && typeof response.platformOs === "string";
}

function createUnrefTimer(callback: () => void, timeoutMs: number): ReturnType<typeof setTimeout> {
  const timer = setTimeout(callback, timeoutMs);
  timer.unref();
  return timer;
}

const SESSION_PROPOSAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "learningGoal",
    "scope",
    "initialTeachingDirection",
    "requiresConfirmation",
    "confirmationReason"
  ],
  properties: {
    learningGoal: { type: "string" },
    scope: { type: "string" },
    initialTeachingDirection: { type: "string" },
    requiresConfirmation: { type: "boolean" },
    confirmationReason: { type: ["string", "null"] }
  }
} as const;

function parseSessionProposal(content: string): SessionProposal {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error("Codex returned a malformed Session Proposal. Retry to request a fresh proposal.");
  }
  if (!value || typeof value !== "object") {
    throw new Error("Codex returned a malformed Session Proposal. Retry to request a fresh proposal.");
  }
  const proposal = value as Record<string, unknown>;
  if (
    typeof proposal.learningGoal !== "string"
    || typeof proposal.scope !== "string"
    || typeof proposal.initialTeachingDirection !== "string"
    || typeof proposal.requiresConfirmation !== "boolean"
    || !(proposal.confirmationReason === null || typeof proposal.confirmationReason === "string")
  ) {
    throw new Error("Codex returned a malformed Session Proposal. Retry to request a fresh proposal.");
  }
  return proposal as unknown as SessionProposal;
}
