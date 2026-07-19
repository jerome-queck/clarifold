import { useState, type FormEvent } from "react";
import type { LearnerAction, ReanchoringDecision, SourceAnchorSelection } from "../../shared/learning-application";

export function ReanchoringReview({
  decision,
  sourceName,
  affectedTeachingCards,
  affectedAnnotations,
  affectedTrailItems,
  onResolve
}: {
  decision: ReanchoringDecision;
  sourceName: string;
  affectedTeachingCards: string[];
  affectedAnnotations: string[];
  affectedTrailItems: string[];
  onResolve(action: Extract<LearnerAction, { type: "resolveReanchoring" }>): Promise<void>;
}) {
  const initial = decision.proposedSelection ?? decision.oldSelection;
  const [kind, setKind] = useState<SourceAnchorSelection["kind"]>(initial.kind);
  const [exactText, setExactText] = useState(initial.kind === "diagramRegion" ? "" : initial.exactText);
  const [startOffset, setStartOffset] = useState(initial.kind === "diagramRegion" ? "0" : String(initial.startOffset));
  const [endOffset, setEndOffset] = useState(initial.kind === "diagramRegion" ? "0" : String(initial.endOffset));
  const [prefix, setPrefix] = useState(initial.kind === "diagramRegion" ? "" : initial.prefix);
  const [suffix, setSuffix] = useState(initial.kind === "diagramRegion" ? "" : initial.suffix);
  const [equationIndex, setEquationIndex] = useState(initial.kind === "equation" ? String(initial.equationIndex) : "0");
  const initialBounds = initial.kind === "diagramRegion" ? initial.bounds : { x: 0, y: 0, width: 0.25, height: 0.25 };
  const [bounds, setBounds] = useState(Object.fromEntries(
    Object.entries(initialBounds).map(([key, value]) => [key, String(value)])
  ) as Record<"x" | "y" | "width" | "height", string>);
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
  const replace = (event: FormEvent) => {
    event.preventDefault();
    const selection = replacementSelection();
    if (selection) void run({
      type: "resolveReanchoring", decisionId: decision.id, resolution: "selectReplacement", selection
    });
  };
  const replacementSelection = (): SourceAnchorSelection | null => {
    if (kind === "diagramRegion") {
      return {
        kind,
        bounds: {
          x: Number(bounds.x), y: Number(bounds.y), width: Number(bounds.width), height: Number(bounds.height)
        }
      };
    }
    const location = {
      startOffset: Number(startOffset), endOffset: Number(endOffset), exactText, prefix, suffix
    };
    if (!exactText || !Number.isInteger(location.startOffset) || !Number.isInteger(location.endOffset)) return null;
    return kind === "equation" ? { kind, equationIndex: Number(equationIndex), ...location } : { kind, ...location };
  };

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
      <form onSubmit={replace}>
        <fieldset disabled={busy}>
          <legend>Select a replacement location</legend>
          <label htmlFor={`replacement-kind-${decision.id}`}>Replacement kind</label>
          <select id={`replacement-kind-${decision.id}`} value={kind}
            onChange={(event) => setKind(event.target.value as SourceAnchorSelection["kind"])}>
            <option value="text">Text</option><option value="equation">Equation</option><option value="diagramRegion">Diagram region</option>
          </select>
          {kind === "diagramRegion" ? (["x", "y", "width", "height"] as const).map((field) => <label key={field}>
            Replacement {field}<input type="number" step="any" value={bounds[field]}
              onChange={(event) => setBounds((current) => ({ ...current, [field]: event.target.value }))} />
          </label>) : <>
            <label>Replacement exact text<input value={exactText} onChange={(event) => setExactText(event.target.value)} /></label>
            <label>Replacement start offset<input type="number" value={startOffset} onChange={(event) => setStartOffset(event.target.value)} /></label>
            <label>Replacement end offset<input type="number" value={endOffset} onChange={(event) => setEndOffset(event.target.value)} /></label>
            <label>Replacement prefix<input value={prefix} onChange={(event) => setPrefix(event.target.value)} /></label>
            <label>Replacement suffix<input value={suffix} onChange={(event) => setSuffix(event.target.value)} /></label>
            {kind === "equation" && <label>Replacement equation index<input type="number" value={equationIndex}
              onChange={(event) => setEquationIndex(event.target.value)} /></label>}
          </>}
        </fieldset>
        <button className="secondary" disabled={busy || replacementSelection() === null}
          aria-label={`Use replacement location for ${label}`}>Use replacement location</button>
      </form>
      <button type="button" className="text-button" disabled={busy} aria-label={`Leave ${label} unresolved`}
        onClick={() => void run({
          type: "resolveReanchoring", decisionId: decision.id, resolution: "leaveUnresolved"
        })}>Leave unresolved</button>
      {error && <p className="failure-message" role="alert">{error}</p>}
    </section>
  );
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
