// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnchoredTeachingCard, LearningArtifact } from "../../shared/learning-application";
import { ContextualInspector } from "./ContextualInspector";

describe("Contextual Inspector", () => {
  afterEach(cleanup);

  it("keeps one anchored route primary while exposing history, a named variant, and artifact promotion", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onRevise = vi.fn().mockResolvedValue(undefined);
    const onRestore = vi.fn().mockResolvedValue(undefined);
    const onPin = vi.fn().mockResolvedValue(undefined);
    const card: AnchoredTeachingCard = {
      id: "card-1",
      sourceAnchorId: "anchor-1",
      title: "Explain compact subset",
      currentRevision: {
        id: "revision-2",
        instruction: "Make the separation argument explicit.",
        status: "completed",
        content: "Separate an outside point, then take a finite subcover.",
        error: null,
        retryable: false
      },
      revisions: [{
        id: "revision-1",
        instruction: "Explain or unpack this source anchor.",
        status: "completed",
        content: "Compactness gives a finite subcover.",
        error: null,
        retryable: false
      }],
      variants: [{
        id: "variant-1",
        name: "Closed-map route",
        revision: {
          id: "variant-revision-1",
          instruction: "Use projection.",
          status: "completed",
          content: "Projection gives a genuinely different route.",
          error: null,
          retryable: false
        }
      }],
      artifactId: null
    };

    render(<ContextualInspector
      card={card}
      artifact={null}
      onClose={onClose}
      onRevise={onRevise}
      onRestore={onRestore}
      onCreateVariant={vi.fn()}
      onPin={onPin}
    />);

    expect(screen.getByRole("complementary", { name: "Contextual Inspector for Explain compact subset" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close Contextual Inspector" })).toBe(document.activeElement);
    expect(screen.getByText("Separate an outside point, then take a finite subcover.")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Teaching Variant Closed-map route" }).textContent).toContain(
      "Projection gives a genuinely different route."
    );

    await user.click(screen.getByRole("button", { name: "Show Teaching Card revision history" }));
    await user.click(screen.getByRole("button", { name: "Restore Teaching Card revision 1" }));
    expect(onRestore).toHaveBeenCalledWith("revision-1");

    await user.type(screen.getByRole("textbox", { name: "Teaching Card follow-up" }), "Add the missing neighbourhood choice.");
    await user.click(screen.getByRole("button", { name: "Revise current Teaching Card" }));
    expect(onRevise).toHaveBeenCalledWith("Add the missing neighbourhood choice.");

    await user.click(screen.getByRole("button", { name: "Pin as Learning Artifact" }));
    expect(onPin).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Close Contextual Inspector" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows the pinned artifact relationship without offering duplicate promotion", () => {
    const artifact: LearningArtifact = {
      id: "artifact-1",
      title: "Explain compact subset",
      content: "A substantial explanation.",
      sourceAnchorIds: ["anchor-1"],
      pinned: true
    };
    const card = {
      id: "card-1",
      sourceAnchorId: "anchor-1",
      title: artifact.title,
      currentRevision: { id: "revision-1", instruction: "Explain", status: "completed", content: artifact.content, error: null, retryable: false },
      revisions: [],
      variants: [],
      artifactId: artifact.id
    } satisfies AnchoredTeachingCard;
    render(<ContextualInspector card={card} artifact={artifact} onClose={() => undefined}
      onRevise={async () => undefined} onRestore={async () => undefined}
      onCreateVariant={async () => undefined} onPin={async () => undefined} />);
    expect(screen.getByRole("status").textContent).toContain("Pinned Learning Artifact retains this Source Anchor");
    expect(screen.queryByRole("button", { name: "Pin as Learning Artifact" })).toBeNull();
  });
});
