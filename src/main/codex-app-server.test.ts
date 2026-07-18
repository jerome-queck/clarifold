import { describe, expect, it } from "vitest";
import { CodexAppServerRuntime, type AppServerTransport } from "./codex-app-server";

describe("Codex app-server contract", () => {
  it("initializes once and supports both Codex-owned authentication paths", async () => {
    let account: null | { type: "chatgpt"; email: string; planType: string } | { type: "apiKey" } = null;
    const transport = new ScriptedTransport((message) => {
      if (!("id" in message)) return;
      switch (message.method) {
        case "initialize":
          transport.respond(message.id, {
            userAgent: "codex-cli/0.144.1",
            codexHome: "/tmp/codex-home",
            platformFamily: "unix",
            platformOs: "macos"
          });
          break;
        case "account/read":
          transport.respond(message.id, { account, requiresOpenaiAuth: true });
          break;
        case "account/login/start":
          if ((message.params as { type: string }).type === "chatgpt") {
            transport.respond(message.id, {
              type: "chatgpt",
              loginId: "login-1",
              authUrl: "https://auth.openai.example/login-1"
            });
          } else {
            account = { type: "apiKey" };
            transport.respond(message.id, { type: "apiKey" });
          }
          break;
      }
    });

    const runtime = await CodexAppServerRuntime.connect(transport, "/workspace");
    expect(transport.messages.slice(0, 2)).toEqual([
      {
        id: 1,
        method: "initialize",
        params: {
          clientInfo: { name: "quick_study", title: "Quick Study", version: "0.1.0" },
          capabilities: null
        }
      },
      { method: "initialized", params: {} }
    ]);
    expect(await runtime.getAuthentication()).toEqual({ status: "signedOut" });

    const login = await runtime.startChatGptLogin();
    expect(login).toEqual({ loginId: "login-1", authUrl: "https://auth.openai.example/login-1" });
    expect(transport.messages.at(-1)).toMatchObject({
      method: "account/login/start",
      params: { type: "chatgpt", codexStreamlinedLogin: true, appBrand: "codex" }
    });

    await runtime.loginWithApiKey("sk-contract-sentinel");
    expect(transport.messages.at(-1)).toMatchObject({
      method: "account/login/start",
      params: { type: "apiKey", apiKey: "sk-contract-sentinel" }
    });
    expect(await runtime.getAuthentication()).toEqual({
      status: "signedIn",
      method: "apiKey",
      accountLabel: null
    });
  });

  it("maps stable thread and turn events into a proposal and streamed Teaching Card", async () => {
    let threadNumber = 0;
    const transport = new ScriptedTransport((message) => {
      if (!("id" in message)) return;
      if (message.method === "initialize") {
        transport.respond(message.id, {
          userAgent: "codex-cli/0.144.1",
          codexHome: "/tmp/codex-home",
          platformFamily: "unix",
          platformOs: "macos"
        });
      }
      if (message.method === "thread/start") {
        threadNumber += 1;
        transport.respond(message.id, { thread: { id: `thread-${threadNumber}` } });
      }
      if (message.method === "turn/start") {
        const params = message.params as { threadId: string; outputSchema?: unknown };
        const turnId = `turn-${threadNumber}`;
        transport.respond(message.id, { turn: { id: turnId } });
        if (params.outputSchema) {
          transport.notify("item/agentMessage/delta", {
            threadId: params.threadId,
            turnId,
            itemId: "proposal",
            delta: JSON.stringify({
              learningGoal: "Understand the alternating series test",
              scope: "Check decreasing magnitude and zero limit",
              initialTeachingDirection: "Inspect the absolute values first",
              requiresConfirmation: false,
              confirmationReason: null
            })
          });
        } else {
          transport.notify("item/agentMessage/delta", {
            threadId: params.threadId,
            turnId,
            itemId: "teaching-card",
            delta: "First check that the term magnitudes decrease. "
          });
          transport.notify("item/agentMessage/delta", {
            threadId: params.threadId,
            turnId,
            itemId: "teaching-card",
            delta: "Then check that they tend to zero."
          });
        }
        transport.notify("turn/completed", {
          threadId: params.threadId,
          turn: { id: turnId, status: "completed", error: null }
        });
      }
    });
    const runtime = await CodexAppServerRuntime.connect(transport, "/workspace");

    await expect(runtime.proposeSession("Does this alternating series converge?")).resolves.toEqual({
      learningGoal: "Understand the alternating series test",
      scope: "Check decreasing magnitude and zero limit",
      initialTeachingDirection: "Inspect the absolute values first",
      requiresConfirmation: false,
      confirmationReason: null
    });
    expect(transport.messages.find((message) => message.method === "thread/start")).toMatchObject({
      params: { cwd: "/workspace", approvalPolicy: "never", sandbox: "read-only", ephemeral: true }
    });

    const deltas: string[] = [];
    await runtime.streamTeaching({
      sessionId: "learning-session-1",
      mathematics: "Does this alternating series converge?",
      learningGoal: "Understand the alternating series test",
      scope: "Check decreasing magnitude and zero limit",
      initialTeachingDirection: "Inspect the absolute values first",
      onDelta: (delta) => deltas.push(delta),
      signal: new AbortController().signal
    });
    expect(deltas).toEqual([
      "First check that the term magnitudes decrease. ",
      "Then check that they tend to zero."
    ]);
  });

  it("interrupts active teaching and shuts down the stdio transport", async () => {
    const transport = new ScriptedTransport((message) => {
      if (!("id" in message)) return;
      if (message.method === "initialize") {
        transport.respond(message.id, {
          userAgent: "codex-cli/0.144.1",
          codexHome: "/tmp/codex-home",
          platformFamily: "unix",
          platformOs: "macos"
        });
      }
      if (message.method === "thread/start") {
        transport.respond(message.id, { thread: { id: "thread-cancel" } });
      }
      if (message.method === "turn/start") {
        transport.respond(message.id, { turn: { id: "turn-cancel" } });
      }
      if (message.method === "turn/interrupt") {
        transport.respond(message.id, {});
        queueMicrotask(() => transport.notify("turn/completed", {
          threadId: "thread-cancel",
          turn: { id: "turn-cancel", status: "interrupted", error: null }
        }));
      }
    });
    const runtime = await CodexAppServerRuntime.connect(transport, "/workspace");
    const teaching = runtime.streamTeaching({
      sessionId: "learning-session-cancel",
      mathematics: "Explain the diagonal argument.",
      learningGoal: "Understand diagonalization",
      scope: "Construct the differing sequence",
      initialTeachingDirection: "Assume an enumeration",
      onDelta: () => undefined,
      signal: new AbortController().signal
    });
    await transport.waitForMessage("turn/start");

    await runtime.cancelTeaching("learning-session-cancel");
    await expect(teaching).rejects.toThrow("interrupted");
    expect(transport.messages.find((message) => message.method === "turn/interrupt")).toMatchObject({
      params: { threadId: "thread-cancel", turnId: "turn-cancel" }
    });

    await runtime.shutdown();
    expect(transport.closed).toBe(true);
  });

  it("turns protocol and malformed-output failures into useful errors", async () => {
    const transport = new ScriptedTransport((message) => {
      if (!("id" in message)) return;
      if (message.method === "initialize") {
        transport.respond(message.id, {
          userAgent: "codex-cli/0.144.1",
          codexHome: "/tmp/codex-home",
          platformFamily: "unix",
          platformOs: "macos"
        });
      }
      if (message.method === "account/read") {
        transport.reject(message.id, -32000, "Authentication unavailable");
      }
      if (message.method === "thread/start") {
        transport.respond(message.id, { thread: { id: "thread-malformed" } });
      }
      if (message.method === "turn/start") {
        transport.respond(message.id, { turn: { id: "turn-malformed" } });
        queueMicrotask(() => {
          transport.notify("item/agentMessage/delta", {
            threadId: "thread-malformed",
            turnId: "turn-malformed",
            itemId: "proposal",
            delta: "not valid proposal JSON"
          });
          transport.notify("turn/completed", {
            threadId: "thread-malformed",
            turn: { id: "turn-malformed", status: "completed", error: null }
          });
        });
      }
    });
    const runtime = await CodexAppServerRuntime.connect(transport, "/workspace");

    await expect(runtime.getAuthentication()).rejects.toThrow(
      "Codex app-server error -32000: Authentication unavailable"
    );
    await expect(runtime.proposeSession("Ambiguous input")).rejects.toThrow(
      "Codex returned a malformed Session Proposal. Retry"
    );
  });
});

type ProtocolMessage = {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
};

class ScriptedTransport implements AppServerTransport {
  readonly messages: ProtocolMessage[] = [];
  closed = false;
  private lineListener: ((line: string) => void) | null = null;
  private closeListener: ((error?: Error) => void) | null = null;
  private readonly messageWaiters = new Map<string, Array<() => void>>();

  constructor(private readonly onMessage: (message: ProtocolMessage) => void) {}

  write(line: string): void {
    const message = JSON.parse(line) as ProtocolMessage;
    this.messages.push(message);
    if (message.method) {
      for (const resolve of this.messageWaiters.get(message.method) ?? []) resolve();
      this.messageWaiters.delete(message.method);
    }
    queueMicrotask(() => this.onMessage(message));
  }

  onLine(listener: (line: string) => void): void {
    this.lineListener = listener;
  }

  onClose(listener: (error?: Error) => void): void {
    this.closeListener = listener;
  }

  respond(id: number | undefined, result: unknown): void {
    this.lineListener?.(JSON.stringify({ id, result }));
  }

  notify(method: string, params: unknown): void {
    this.lineListener?.(JSON.stringify({ method, params }));
  }

  reject(id: number | undefined, code: number, message: string): void {
    this.lineListener?.(JSON.stringify({ id, error: { code, message } }));
  }

  close(): void {
    this.closed = true;
    this.closeListener?.();
  }

  async waitForMessage(method: string): Promise<void> {
    if (this.messages.some((message) => message.method === method)) return;
    await new Promise<void>((resolve) => {
      const waiters = this.messageWaiters.get(method) ?? [];
      waiters.push(resolve);
      this.messageWaiters.set(method, waiters);
    });
  }
}
