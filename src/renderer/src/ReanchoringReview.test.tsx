// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReanchoringDecision } from "../../shared/learning-application";
import { ReanchoringReview } from "./ReanchoringReview";

describe("ReanchoringReview", () => {
  afterEach(cleanup);

  it("reviews affected learning work and confirms or replaces an anchor by keyboard", async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn().mockResolvedValue(undefined);
    const decision: ReanchoringDecision = {
      id: "review-1", sessionId: "session-1", sourceId: "source-1", sourceAnchorId: "anchor-1",
      fromRevisionId: "source-revision-1", toRevisionId: "source-revision-2", status: "unresolved",
      oldSelection: {
        kind: "text", startOffset: 15, endOffset: 25, exactText: "Beta lemma",
        prefix: "Alpha theorem. ", suffix: ". Gamma claim."
      },
      proposedSelection: {
        kind: "text", startOffset: 23, endOffset: 33, exactText: "Beta lemma",
        prefix: "eorem changed. ", suffix: ". Delta claim."
      }
    };
    render(<ReanchoringReview decision={decision} sourceName="notes.txt"
      affectedTeachingCards={["Question about Beta lemma"]}
      affectedAnnotations={["Personal Note: Check this step."]}
      affectedTrailItems={["Concept: Beta lemma"]}
      onResolve={onResolve} />);

    const review = screen.getByRole("region", { name: "Unresolved Anchor review for notes.txt" });
    expect(review.textContent).toContain("Old location");
    expect(review.textContent).toContain("Proposed location");
    expect(review.textContent).toContain("Question about Beta lemma");
    expect(review.textContent).toContain("Personal Note: Check this step.");
    expect(review.textContent).toContain("Concept: Beta lemma");

    screen.getByRole("button", { name: "Accept proposed match for Beta lemma" }).focus();
    await user.keyboard("{Enter}");
    expect(onResolve).toHaveBeenCalledWith({
      type: "resolveReanchoring", decisionId: "review-1", resolution: "acceptProposal"
    });

    await user.clear(screen.getByLabelText("Replacement exact text"));
    await user.type(screen.getByLabelText("Replacement exact text"), "Delta claim");
    await user.clear(screen.getByLabelText("Replacement start offset"));
    await user.type(screen.getByLabelText("Replacement start offset"), "35");
    await user.clear(screen.getByLabelText("Replacement end offset"));
    await user.type(screen.getByLabelText("Replacement end offset"), "46");
    await user.click(screen.getByRole("button", { name: "Use replacement location for Beta lemma" }));
    expect(onResolve).toHaveBeenLastCalledWith(expect.objectContaining({
      type: "resolveReanchoring", decisionId: "review-1", resolution: "selectReplacement",
      selection: expect.objectContaining({ exactText: "Delta claim", startOffset: 35, endOffset: 46 })
    }));

    await user.click(screen.getByRole("button", { name: "Leave Beta lemma unresolved" }));
    expect(onResolve).toHaveBeenLastCalledWith({
      type: "resolveReanchoring", decisionId: "review-1", resolution: "leaveUnresolved"
    });
  });
});
