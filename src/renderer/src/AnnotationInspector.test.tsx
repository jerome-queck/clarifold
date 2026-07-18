// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnnotationInspector } from "./AnnotationInspector";

describe("Annotation Inspector", () => {
  afterEach(cleanup);

  it("creates an explicitly purposed annotation and keyboard-converts it with the change visible", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);
    const onConvert = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(<AnnotationInspector
      anchorLabel="Text Source Anchor: compact subset"
      annotations={[]}
      initialPurpose="personalNote"
      onCreate={onCreate}
      onConvert={onConvert}
      onClose={() => undefined}
    />);

    expect(screen.getByRole("complementary", { name: "Annotations for Text Source Anchor: compact subset" })).toBeTruthy();
    expect(screen.getByText("Personal Notes stay local and are excluded from ordinary Teaching Moves.")).toBeTruthy();
    await user.type(screen.getByRole("textbox", { name: "Personal Note" }), "Use my own cover notation.");
    await user.click(screen.getByRole("button", { name: "Save Personal Note" }));
    expect(onCreate).toHaveBeenCalledWith("personalNote", "Use my own cover notation.");

    rerender(<AnnotationInspector
      anchorLabel="Text Source Anchor: compact subset"
      annotations={[{
        id: "annotation-1",
        sourceAnchorId: "anchor-1",
        purpose: "tutorFeedback",
        content: "Use my own cover notation.",
        purposeChanges: [{ from: "personalNote", to: "tutorFeedback" }]
      }]}
      initialPurpose="tutorFeedback"
      onCreate={onCreate}
      onConvert={onConvert}
      onClose={() => undefined}
    />);
    const feedback = screen.getByRole("article", { name: "Tutor Feedback" });
    expect(feedback.textContent).toContain("Changed from Personal Note");
    const convert = screen.getByRole("button", { name: "Convert Tutor Feedback to Personal Note" });
    convert.focus();
    await user.keyboard("{Enter}");
    expect(onConvert).toHaveBeenCalledWith("annotation-1", "personalNote");
  });

  it("announces annotation save failures without losing the verbatim draft", async () => {
    const user = userEvent.setup();
    render(<AnnotationInspector
      anchorLabel="Text Source Anchor: compact subset"
      annotations={[]}
      initialPurpose="personalNote"
      onCreate={async () => { throw new Error("The local annotation could not be persisted."); }}
      onConvert={async () => undefined}
      onClose={() => undefined}
    />);

    const draft = screen.getByRole("textbox", { name: "Personal Note" });
    await user.type(draft, "  Keep these spaces.  ");
    await user.click(screen.getByRole("button", { name: "Save Personal Note" }));

    expect((await screen.findByRole("alert")).textContent).toContain("could not be persisted");
    expect((draft as HTMLTextAreaElement).value).toBe("  Keep these spaces.  ");
  });
});
