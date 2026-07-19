import { useState } from "react";
import type { LearnerAction, LinkedSourceView, ReanchoringDecision, SourceAnchorSelection } from "../../shared/learning-application";
import { SourceLayer } from "./SourceLayer";

type AvailableSourceView = Extract<LinkedSourceView, { status: "available" }>;
type SelectableSourceView = AvailableSourceView & { mediaType: "text/plain" | "image/png" | "image/jpeg" };

export function ReanchoringReview({
  decision,
  sourceName,
  affectedTeachingCards,
  affectedAnnotations,
  affectedTrailItems,
  sourceView,
  onOpenSource,
  onResolve
}: {
  decision: ReanchoringDecision;
  sourceName: string;
  affectedTeachingCards: string[];
  affectedAnnotations: string[];
  affectedTrailItems: string[];
  sourceView: AvailableSourceView | null;
  onOpenSource(): Promise<void>;
  onResolve(action: Extract<LearnerAction, { type: "resolveReanchoring" }>): Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = anchorText(decision.oldSelection);

  const run = async (action: Extract<LearnerAction, { type: "resolveReanchoring" }>) => {
    setBusy(true);
    setError(null);
    try {
      await onResolve(action);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The Re-anchoring decision could not be saved.");
    } finally {
      setBusy(false);
    }
  };
  const openSource = async () => {
    setBusy(true);
    setError(null);
    try {
      await onOpenSource();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The current Source Layer could not be opened.");
    } finally {
      setBusy(false);
    }
  };
  const chooseReplacement = (selection: SourceAnchorSelection) => void run({
    type: "resolveReanchoring", decisionId: decision.id, resolution: "selectReplacement", selection
  });
  const selectableView: SelectableSourceView | null = sourceView && isSelectableMediaType(sourceView.mediaType)
    ? sourceView as SelectableSourceView
    : null;

  return (
    <section className="reanchoring-review" role="region" aria-label={`Unresolved Anchor review for ${sourceName}`}>
      <div className="card-heading">
        <div><p className="eyebrow">Re-anchoring review</p><h3>Unresolved Anchor · {label}</h3></div>
        <span className="source-badge">{decision.status === "leftUnresolved" ? "Left unresolved" : "Learner review required"}</span>
      </div>
      <dl>
        <div><dt>Old location</dt><dd>{locationLabel(decision.oldSelection)}</dd></div>
        <div><dt>Proposed location</dt><dd>{decision.proposedSelection
          ? locationLabel(decision.proposedSelection)
          : "No reliable replacement was found."}</dd></div>
      </dl>
      <AffectedLearningWork title="Affected Teaching Cards" items={affectedTeachingCards} />
      <AffectedLearningWork title="Affected annotations" items={affectedAnnotations} />
      <AffectedLearningWork title="Affected Trail Items" items={affectedTrailItems} />
      {decision.proposedSelection && <button type="button" className="primary" disabled={busy}
        aria-label={`Accept proposed match for ${label}`} onClick={() => void run({
          type: "resolveReanchoring", decisionId: decision.id, resolution: "acceptProposal"
        })}>Accept proposed match</button>}
      <section className="replacement-source-layer" aria-label={`Select replacement location for ${label}`}>
        <h4>Select a replacement location</h4>
        <p className="subtle">Open the current Source Layer, select the exact text, equation, or diagram region, then use the Selection Palette.</p>
        {selectableView ? <SourceLayer sourceId={selectableView.sourceId} content={selectableView.content}
          mediaType={selectableView.mediaType} anchors={[]} onChooseReplacement={chooseReplacement} />
          : <button type="button" className="secondary" disabled={busy}
            aria-label={`Open current Source Layer for ${label}`} onClick={() => void openSource()}>
            Open current Source Layer
          </button>}
      </section>
      <button type="button" className="text-button" disabled={busy} aria-label={`Leave ${label} unresolved`}
        onClick={() => void run({
          type: "resolveReanchoring", decisionId: decision.id, resolution: "leaveUnresolved"
        })}>Leave unresolved</button>
      {error && <p className="failure-message" role="alert">{error}</p>}
    </section>
  );
}

function isSelectableMediaType(value: AvailableSourceView["mediaType"]): value is SelectableSourceView["mediaType"] {
  return value === "text/plain" || value === "image/png" || value === "image/jpeg";
}

function AffectedLearningWork({ title, items }: { title: string; items: string[] }) {
  return <section><h4>{title}</h4>{items.length > 0
    ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
    : <p className="subtle">None.</p>}</section>;
}

function anchorText(selection: SourceAnchorSelection): string {
  return selection.kind === "diagramRegion" ? "diagram region" : selection.exactText;
}

function locationLabel(selection: SourceAnchorSelection): string {
  if (selection.kind === "diagramRegion") {
    return `Diagram region at ${selection.bounds.x}, ${selection.bounds.y}, ${selection.bounds.width} × ${selection.bounds.height}`;
  }
  return `${selection.kind === "equation" ? "Equation" : "Text"} at characters ${selection.startOffset}–${selection.endOffset}: ${selection.exactText}`;
}
