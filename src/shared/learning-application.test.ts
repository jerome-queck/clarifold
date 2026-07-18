import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LearningApplication } from "./learning-application";
import type { ModelRuntime, SessionProposal, TeachingRequest } from "./model-runtime";

describe("Learning Application", () => {
  const dataDirectories: string[] = [];
  const applications: LearningApplication[] = [];

  afterEach(async () => {
    await Promise.all(applications.splice(0).map((application) => application.waitForModelWork()));
    await Promise.all(dataDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  });

  async function launch() {
    const dataDirectory = await mkdtemp(join(tmpdir(), "quick-study-test-"));
    dataDirectories.push(dataDirectory);
    const application = await LearningApplication.launch(dataDirectory);
    applications.push(application);
    return {
      dataDirectory,
      application
    };
  }

  async function launchWithRuntime(runtime: ModelRuntime) {
    const dataDirectory = await mkdtemp(join(tmpdir(), "quick-study-test-"));
    dataDirectories.push(dataDirectory);
    const application = await LearningApplication.launch(dataDirectory, runtime);
    applications.push(application);
    return {
      dataDirectory,
      application
    };
  }

  it("proposes an editable Learning Session and pauses materially ambiguous input for confirmation", async () => {
    const runtime = new DeterministicModelRuntime({
      learningGoal: "Understand which convergence claim to prove",
      scope: "Clarify whether the sequence is pointwise or uniformly convergent",
      initialTeachingDirection: "Compare the two definitions before choosing a proof",
      requiresConfirmation: true,
      confirmationReason: "The intended convergence notion changes the proof materially."
    });
    const { application } = await launchWithRuntime(runtime);

    const state = await application.submit({
      type: "submitSessionIntake",
      mathematics: "Show that this sequence converges."
    });

    expect(state.sessions[0]).toMatchObject({
      mathematics: "Show that this sequence converges.",
      learningGoal: "Understand which convergence claim to prove",
      proposal: {
        scope: "Clarify whether the sequence is pointwise or uniformly convergent",
        initialTeachingDirection: "Compare the two definitions before choosing a proof",
        status: "awaitingConfirmation",
        confirmationReason: "The intended convergence notion changes the proof materially."
      },
      teachingCard: { status: "idle", content: "" }
    });
    expect(runtime.teachingRequests).toEqual([]);

    const revised = await application.submit({
      type: "reviseSessionProposal",
      learningGoal: "Prove uniform convergence",
      scope: "Use the supremum norm on the stated domain",
      initialTeachingDirection: "Start from the epsilon definition"
    });
    expect(revised.sessions[0]).toMatchObject({
      learningGoal: "Prove uniform convergence",
      proposal: {
        scope: "Use the supremum norm on the stated domain",
        initialTeachingDirection: "Start from the epsilon definition"
      }
    });
  });

  it("starts a clear proposal immediately and streams one Teaching Card to completion", async () => {
    const runtime = new DeterministicModelRuntime({
      learningGoal: "Understand why the harmonic series diverges",
      scope: "Use the grouping argument",
      initialTeachingDirection: "Group terms into powers-of-two blocks",
      requiresConfirmation: false,
      confirmationReason: null
    }, true);
    const { application } = await launchWithRuntime(runtime);

    const started = await application.submit({
      type: "submitSessionIntake",
      mathematics: "Why does the harmonic series diverge?"
    });
    expect(started.sessions[0].proposal.status).toBe("accepted");
    expect(started.sessions[0].teachingCard).toMatchObject({ status: "streaming", content: "" });
    expect(runtime.teachingRequests).toHaveLength(1);

    runtime.emitTeaching("Group the terms as 1 + 1/2 + (1/3 + 1/4)");
    expect(application.getState().sessions[0].teachingCard).toMatchObject({
      status: "streaming",
      content: "Group the terms as 1 + 1/2 + (1/3 + 1/4)"
    });

    runtime.completeTeaching();
    await application.waitForModelWork();
    expect(application.getState().sessions[0].teachingCard).toMatchObject({
      status: "completed",
      content: "Group the terms as 1 + 1/2 + (1/3 + 1/4)",
      error: null
    });
  });

  it("starts confirmed work and cancellation retains the Learning Session in a clear stopped state", async () => {
    const runtime = new DeterministicModelRuntime({
      learningGoal: "Choose the intended convergence claim",
      scope: "Confirm uniform convergence",
      initialTeachingDirection: "Test the supremum error",
      requiresConfirmation: true,
      confirmationReason: "The domain is large enough to make the choice costly."
    }, true);
    const { application } = await launchWithRuntime(runtime);
    await application.submit({ type: "submitSessionIntake", mathematics: "Show f_n converges." });

    const confirmed = await application.submit({ type: "confirmSessionProposal" });
    expect(confirmed.sessions[0].teachingCard.status).toBe("streaming");
    runtime.emitTeaching("Begin by estimating the supremum");

    const stopped = await application.submit({ type: "cancelModelWork" });
    await application.waitForModelWork();
    expect(runtime.canceledSessionIds).toEqual([stopped.sessions[0].id]);
    expect(stopped.sessions[0]).toMatchObject({
      status: "active",
      teachingCard: {
        status: "stopped",
        content: "Begin by estimating the supremum",
        error: "Teaching stopped. You can retry without losing this Learning Session.",
        retryable: true
      }
    });
  });

  it("surfaces honest runtime failures and retries the same Teaching Card", async () => {
    const runtime = new DeterministicModelRuntime({
      learningGoal: "Understand the quotient rule",
      scope: "Derive the rule from the product rule",
      initialTeachingDirection: "Rewrite the quotient as a product",
      requiresConfirmation: false,
      confirmationReason: null
    }, true);
    const { application } = await launchWithRuntime(runtime);
    await application.submit({ type: "submitSessionIntake", mathematics: "Derive the quotient rule." });

    runtime.failTeaching(new Error("Codex authentication expired. Sign in and retry."));
    await application.waitForModelWork();
    expect(application.getState().sessions[0].teachingCard).toMatchObject({
      status: "failed",
      error: "Codex authentication expired. Sign in and retry.",
      retryable: true
    });

    const retried = await application.submit({ type: "retryModelWork" });
    expect(runtime.teachingRequests).toHaveLength(2);
    expect(retried.sessions[0].teachingCard).toMatchObject({
      status: "streaming",
      content: "",
      error: null,
      retryable: false
    });
    runtime.completeTeaching();
    await application.waitForModelWork();
  });

  it("supports ChatGPT and API-key authentication without retaining credentials in application state", async () => {
    const runtime = new DeterministicModelRuntime({
      learningGoal: "Unused",
      scope: "Unused",
      initialTeachingDirection: "Unused",
      requiresConfirmation: false,
      confirmationReason: null
    });
    runtime.authentication = { status: "signedOut" };
    const { application } = await launchWithRuntime(runtime);

    const chatGpt = await application.submit({ type: "startChatGptLogin" });
    expect(chatGpt.authentication).toEqual({
      status: "signingIn",
      method: "chatgpt",
      accountLabel: null,
      loginUrl: "https://auth.example.test",
      error: null
    });
    expect(runtime.chatGptLoginStarts).toBe(1);

    runtime.authentication = {
      status: "signedIn",
      method: "chatgpt",
      accountLabel: "learner@example.com"
    };
    const signedIn = await application.submit({ type: "refreshAuthentication" });
    expect(signedIn.authentication).toMatchObject({ status: "signedIn", method: "chatgpt" });

    runtime.authentication = { status: "signedIn", method: "apiKey", accountLabel: null };
    const apiKey = "sk-test-never-persist";
    const keySignedIn = await application.submit({ type: "loginWithApiKey", apiKey });
    expect(runtime.receivedApiKeys).toEqual([apiKey]);
    expect(keySignedIn.authentication).toEqual({
      status: "signedIn",
      method: "apiKey",
      accountLabel: null,
      loginUrl: null,
      error: null
    });
    expect(JSON.stringify(keySignedIn)).not.toContain(apiKey);
  });

  it("keeps malformed proposal failures retryable without fabricating a Learning Session", async () => {
    const runtime = new DeterministicModelRuntime({
      learningGoal: "Understand the chain rule",
      scope: "Derive the composition derivative",
      initialTeachingDirection: "Track a small input change through both functions",
      requiresConfirmation: false,
      confirmationReason: null
    });
    runtime.proposalError = new Error("Codex returned a malformed Session Proposal. Retry to request a fresh proposal.");
    const { application } = await launchWithRuntime(runtime);

    const failed = await application.submit({ type: "submitSessionIntake", mathematics: "Explain the chain rule." });
    expect(failed.sessions).toHaveLength(0);
    expect(failed.intakeError).toBe("Codex returned a malformed Session Proposal. Retry to request a fresh proposal.");

    runtime.proposalError = null;
    const retried = await application.submit({ type: "submitSessionIntake", mathematics: "Explain the chain rule." });
    expect(retried.intakeError).toBeNull();
    expect(retried.sessions[0].learningGoal).toBe("Understand the chain rule");
  });

  it("launches into an honest authentication failure instead of hanging when Codex is unavailable", async () => {
    const runtime = new DeterministicModelRuntime({
      learningGoal: "Unused",
      scope: "Unused",
      initialTeachingDirection: "Unused",
      requiresConfirmation: false,
      confirmationReason: null
    });
    runtime.authenticationError = new Error("Codex app-server stopped with code 1.");

    const { application } = await launchWithRuntime(runtime);
    expect(application.getState().authentication).toEqual({
      status: "failed",
      method: null,
      accountLabel: null,
      loginUrl: null,
      error: "Codex app-server stopped with code 1."
    });
  });

  it("starts Quick Study from typed mathematics with an editable goal and target", async () => {
    const { application } = await launch();

    await application.submit({
      type: "startQuickStudy",
      mathematics: "Prove that the square root of 2 is irrational."
    });
    await application.submit({ type: "editLearningGoal", value: "Understand the contradiction strategy" });
    const state = await application.submit({ type: "editSessionTarget", value: "Explain why even squares have even roots" });

    expect(state).toMatchObject({
      screen: "workbench",
      quickStudy: {
        workspace: { id: "quick-study-workspace", kind: "system", name: "Quick Study" },
        mission: {
          id: "quick-study-unfiled-mission",
          kind: "unfiled",
          workspaceId: "quick-study-workspace"
        }
      },
      sessions: [{
          workspaceId: "quick-study-workspace",
          missionId: "quick-study-unfiled-mission",
          mathematics: "Prove that the square root of 2 is irrational.",
          learningGoal: "Understand the contradiction strategy",
          sessionTarget: "Explain why even squares have even roots",
          status: "active"
      }]
    });
  });

  it("reloads paused Quick Study work with its return context intact", async () => {
    const { application, dataDirectory } = await launch();

    await application.submit({ type: "startQuickStudy", mathematics: "Evaluate the integral of x squared." });
    await application.submit({ type: "editLearningGoal", value: "Connect powers to antiderivatives" });
    await application.submit({ type: "editSessionTarget", value: "Derive the power rule example" });
    await application.submit({ type: "leaveSession" });

    const reloaded = await LearningApplication.launch(dataDirectory);
    expect(reloaded.getState()).toMatchObject({
      screen: "dashboard",
      sessions: [{
        learningGoal: "Connect powers to antiderivatives",
        sessionTarget: "Derive the power rule example",
        status: "paused",
        returnContext: {
          label: "Your typed mathematics",
          nextAction: "Continue working through the key idea"
        }
      }]
    });

    const sessionId = reloaded.getState().sessions[0].id;
    const resumed = await reloaded.submit({ type: "resumeSession", sessionId });
    expect(resumed).toMatchObject({ screen: "workbench", activeSessionId: sessionId });
    expect(resumed.sessions[0].status).toBe("active");
  });

  it("creates, renames, navigates, and reloads a Study Workspace with multiple Study Missions", async () => {
    const { application, dataDirectory } = await launch();

    const created = await application.submit({ type: "createWorkspace", name: "Abstract Algebra" });
    const workspace = created.workspaces.find((candidate) => candidate.name === "Abstract Algebra");
    expect(workspace).toBeDefined();

    await application.submit({
      type: "renameWorkspace",
      workspaceId: workspace!.id,
      name: "Algebra II"
    });
    const firstMissionState = await application.submit({
      type: "createMission",
      workspaceId: workspace!.id,
      name: "Understand group actions"
    });
    const secondMissionState = await application.submit({
      type: "createMission",
      workspaceId: workspace!.id,
      name: "Study the Sylow proofs"
    });
    const firstMission = firstMissionState.missions.find((mission) => mission.name === "Understand group actions");
    const secondMission = secondMissionState.missions.find((mission) => mission.name === "Study the Sylow proofs");

    const navigated = await application.submit({
      type: "navigateToMission",
      workspaceId: workspace!.id,
      missionId: firstMission!.id
    });
    expect(navigated.navigation).toEqual({ workspaceId: workspace!.id, missionId: firstMission!.id });
    expect(navigated.missions.filter((mission) => mission.workspaceId === workspace!.id)).toHaveLength(2);
    expect(secondMission).toMatchObject({ workspaceId: workspace!.id });

    const reloaded = await LearningApplication.launch(dataDirectory);
    expect(reloaded.getState()).toMatchObject({
      screen: "dashboard",
      navigation: { workspaceId: workspace!.id, missionId: firstMission!.id },
      workspaces: [{ id: "quick-study-workspace", name: "Quick Study" }, { id: workspace!.id, name: "Algebra II" }]
    });
    expect(reloaded.getState().missions.filter((mission) => mission.workspaceId === workspace!.id)).toHaveLength(2);
    expect(reloaded.getState().workspaces.find((candidate) => candidate.id === workspace!.id)).toMatchObject({
      context: { sourceIds: [], learnerContextIds: [] }
    });
    expect(firstMission).not.toHaveProperty("context");
    expect(secondMission).not.toHaveProperty("context");
  });

  it("files Quick Study work intact and orders the Resume Card by the most recently touched session", async () => {
    const { application, dataDirectory } = await launch();

    let state = await application.submit({ type: "startQuickStudy", mathematics: "Classify groups of order 15." });
    const filedSessionId = state.activeSessionId!;
    await application.submit({ type: "editLearningGoal", value: "Use the Sylow theorems" });
    await application.submit({ type: "editSessionTarget", value: "Control the Sylow subgroups" });
    await application.submit({ type: "leaveSession" });

    state = await application.submit({ type: "startQuickStudy", mathematics: "Compute the units modulo 8." });
    const latestSessionId = state.activeSessionId!;
    await application.submit({ type: "leaveSession" });

    state = await application.submit({ type: "createWorkspace", name: "Abstract Algebra" });
    const workspaceId = state.navigation.workspaceId;
    state = await application.submit({ type: "createMission", workspaceId, name: "Finite group structure" });
    const missionId = state.navigation.missionId!;
    const filed = await application.submit({ type: "fileSession", sessionId: filedSessionId, workspaceId, missionId });
    const movedSession = filed.sessions.find((session) => session.id === filedSessionId);

    expect(movedSession).toMatchObject({
      id: filedSessionId,
      workspaceId,
      missionId,
      mathematics: "Classify groups of order 15.",
      learningGoal: "Use the Sylow theorems",
      sessionTarget: "Control the Sylow subgroups",
      status: "paused",
      returnContext: {
        label: "Your typed mathematics",
        nextAction: "Continue working through the key idea"
      }
    });
    expect(filed.resumeSessionId).toBe(filedSessionId);
    expect(latestSessionId).not.toBe(filedSessionId);

    const reloaded = await LearningApplication.launch(dataDirectory);
    expect(reloaded.getState()).toMatchObject({
      screen: "dashboard",
      resumeSessionId: filedSessionId,
      navigation: { workspaceId, missionId }
    });
    expect(reloaded.getState().sessions).toHaveLength(2);
  });

  it("migrates the durable Quick Study session created by the previous application version", async () => {
    const dataDirectory = await mkdtemp(join(tmpdir(), "quick-study-test-"));
    dataDirectories.push(dataDirectory);
    await writeFile(join(dataDirectory, "learning-application.json"), JSON.stringify({
      screen: "resume",
      quickStudy: {
        workspace: { id: "quick-study-workspace", kind: "system", name: "Quick Study" },
        mission: {
          id: "quick-study-unfiled-mission",
          kind: "unfiled",
          workspaceId: "quick-study-workspace"
        }
      },
      session: {
        id: "legacy-session",
        workspaceId: "quick-study-workspace",
        missionId: "quick-study-unfiled-mission",
        mathematics: "Prove that the square root of 3 is irrational.",
        learningGoal: "Understand the contradiction",
        sessionTarget: "Track divisibility by three",
        status: "paused",
        returnContext: {
          label: "Your typed mathematics",
          nextAction: "Continue working through the key idea"
        }
      }
    }, null, 2), "utf8");

    const migrated = await LearningApplication.launch(dataDirectory);
    expect(migrated.getState()).toMatchObject({
      screen: "dashboard",
      activeSessionId: null,
      resumeSessionId: "legacy-session",
      sessions: [{
        id: "legacy-session",
        mathematics: "Prove that the square root of 3 is irrational.",
        learningGoal: "Understand the contradiction",
        sessionTarget: "Track divisibility by three",
        status: "paused"
      }]
    });
  });

  it("pauses an active Learning Session when hierarchy navigation returns to the dashboard", async () => {
    const { application } = await launch();
    const started = await application.submit({ type: "startQuickStudy", mathematics: "Find the derivative of sine." });
    const sessionId = started.activeSessionId!;

    const navigated = await application.submit({
      type: "navigateToWorkspace",
      workspaceId: "quick-study-workspace"
    });

    expect(navigated).toMatchObject({
      screen: "dashboard",
      activeSessionId: null,
      resumeSessionId: sessionId,
      sessions: [{ id: sessionId, status: "paused" }]
    });
  });
});

class DeterministicModelRuntime implements ModelRuntime {
  readonly teachingRequests: TeachingRequest[] = [];
  readonly canceledSessionIds: string[] = [];
  private teachingCompletion: (() => void) | null = null;
  private teachingFailure: ((error: Error) => void) | null = null;
  authentication: Awaited<ReturnType<ModelRuntime["getAuthentication"]>> = {
    status: "signedIn",
    method: "chatgpt",
    accountLabel: "learner@example.com"
  };
  chatGptLoginStarts = 0;
  readonly receivedApiKeys: string[] = [];
  proposalError: Error | null = null;
  authenticationError: Error | null = null;

  constructor(private readonly proposal: SessionProposal, private readonly holdTeaching = false) {}

  async getAuthentication() {
    if (this.authenticationError) throw this.authenticationError;
    return this.authentication;
  }

  async startChatGptLogin() {
    this.chatGptLoginStarts += 1;
    return { loginId: "login-1", authUrl: "https://auth.example.test" };
  }

  async loginWithApiKey(apiKey: string) {
    this.receivedApiKeys.push(apiKey);
  }

  async proposeSession(): Promise<SessionProposal> {
    if (this.proposalError) throw this.proposalError;
    return this.proposal;
  }

  async streamTeaching(request: TeachingRequest): Promise<void> {
    this.teachingRequests.push(request);
    if (this.holdTeaching) {
      await new Promise<void>((resolve, reject) => {
        this.teachingCompletion = resolve;
        this.teachingFailure = reject;
      });
    }
  }

  emitTeaching(delta: string) {
    this.teachingRequests.at(-1)?.onDelta(delta);
  }

  completeTeaching() {
    this.teachingCompletion?.();
  }

  failTeaching(error: Error) {
    this.teachingFailure?.(error);
  }

  async cancelTeaching(sessionId: string) {
    this.canceledSessionIds.push(sessionId);
    this.completeTeaching();
  }

  async shutdown() {}
}
