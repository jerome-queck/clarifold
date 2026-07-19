// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { LearningApplicationState, LearningSession } from "../../shared/learning-application";
import { AdaptiveTeaching } from "./AdaptiveTeaching";

describe("AdaptiveTeaching", () => {
  it("scopes its unfinished Teaching Experiment draft to the active Learning Session", async () => {
    const user = userEvent.setup();
    const onState = vi.fn<(state: LearningApplicationState) => void>();
    const view = render(<AdaptiveTeaching session={adaptiveSession("session-1", "Understand compactness")} onState={onState} />);

    await user.type(screen.getByRole("textbox", { name: "Why try it?" }), "Try a neighbourhood picture.");
    view.rerender(<AdaptiveTeaching session={adaptiveSession("session-2", "Understand connectedness")} onState={onState} />);

    expect((screen.getByRole("textbox", { name: "Why try it?" }) as HTMLInputElement).value).toBe("");
    expect((screen.getByRole("textbox", { name: "Concept" }) as HTMLInputElement).value).toBe("Understand connectedness");
  });
});

function adaptiveSession(id: string, learningGoal: string): LearningSession {
  const move = { id: `${id}-move`, kind: "explain" as const, route: "proofStructural" as const, reason: "Begin with definitions.", evidenceIds: [], experimentId: null };
  return {
    id, workspaceId: "workspace-1", missionId: "mission-1", mathematics: "Every compact subset is closed.", sourceIds: ["source-1"],
    learningGoal, sessionTarget: "Explain the proof", status: "active", activityOrder: 1,
    returnContext: { label: "Source", nextAction: "Continue" },
    proposal: { scope: "Explain the proof", initialTeachingDirection: "Begin with definitions", status: "accepted", confirmationReason: null },
    teachingMoves: [move], currentTeachingMove: move, understandingChecks: [], understandingEvidence: [], teachingExperiments: [], interactionPreferences: [],
    teachingCard: { status: "completed", content: "Use compactness after separating an exterior point.", error: null, retryable: false },
    teachingCardHistory: [], submittedPendingQuestions: [], currentTeachingInput: { kind: "sessionIntake", text: "Every compact subset is closed." },
    pendingQuestion: null, askBarContext: { items: [], includedIds: [], customized: false }, questionCards: [], activeQuestionCardId: null,
    accessPolicy: "focused", accessRequests: [], pendingFullAccessConfirmation: false, researchEgressPermission: { status: "notGranted" },
    researchActions: [], corroborationPass: null, corroborationPassHistory: [], sourceAnchors: [], sourceAnchorRequests: [], annotations: [],
    activeSourceAnchorId: null, anchoredTeachingCards: [], activeTeachingCardId: null, learningArtifacts: [], trailDraft: { items: [] },
    consolidationDraft: null, consolidatedOutcome: null, continuationOf: null, modelStopConfirmation: null, learningSlice: null,
    conceptPeeks: [], pendingConceptPeek: null, prerequisiteBranchProposals: [], prerequisiteBranch: null, agentTasks: [], activeAgentTaskId: null,
    reasoningPreference: "balanced", runtimeOverride: null, verifierEnvironmentPinId: null
  };
}
