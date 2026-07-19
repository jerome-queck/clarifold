import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AnchoredTeachingCard, LearningArtifact } from "../../shared/learning-application";
import { ClaimTrust } from "./ClaimTrust";

interface ContextualInspectorProps {
  card: AnchoredTeachingCard;
  artifact: LearningArtifact | null;
  autoFocusClose?: boolean;
  onClose(): void;
  onRevise(instruction: string): Promise<void>;
  onEditClaims(claims: Array<{ claimId: string | null; statement: string }>): Promise<void>;
  onRestore(revisionId: string): Promise<void>;
  onCreateVariant(name: string, instruction: string): Promise<void>;
  onRetry(variantId?: string): Promise<void>;
  onPin(kind: LearningArtifact["kind"]): Promise<void>;
}

export function ContextualInspector({
  card,
  artifact,
  autoFocusClose = true,
  onClose,
  onRevise,
  onEditClaims,
  onRestore,
  onCreateVariant,
  onRetry,
  onPin
}: ContextualInspectorProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [followUp, setFollowUp] = useState("");
  const [variantName, setVariantName] = useState("");
  const [variantInstruction, setVariantInstruction] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [claimEdits, setClaimEdits] = useState<Array<{ claimId: string | null; statement: string }>>(
    (card.currentRevision.claims ?? []).map((claim) => ({ claimId: claim.claimId, statement: claim.claimStatement }))
  );
  const [busy, setBusy] = useState(false);
  const isQuestionDraft = card.currentRevision.status === "idle" && card.title.startsWith("Question about");

  useEffect(() => {
    if (autoFocusClose) closeRef.current?.focus();
  }, [autoFocusClose, card.id]);
  useEffect(() => setClaimEdits((card.currentRevision.claims ?? []).map(
    (claim) => ({ claimId: claim.claimId, statement: claim.claimStatement })
  )), [card.currentRevision.id, card.currentRevision.claims]);

  const submitRevision = async (event: FormEvent) => {
    event.preventDefault();
    if (!followUp.trim()) return;
    setBusy(true);
    try {
      await onRevise(followUp.trim());
      setFollowUp("");
    } finally {
      setBusy(false);
    }
  };
  const submitVariant = async (event: FormEvent) => {
    event.preventDefault();
    if (!variantName.trim() || !variantInstruction.trim()) return;
    setBusy(true);
    try {
      await onCreateVariant(variantName.trim(), variantInstruction.trim());
      setVariantName("");
      setVariantInstruction("");
    } finally {
      setBusy(false);
    }
  };
  const restore = async (revisionId: string) => {
    setBusy(true);
    try {
      await onRestore(revisionId);
    } finally {
      setBusy(false);
    }
  };
  const pin = async (kind: LearningArtifact["kind"]) => {
    setBusy(true);
    try {
      await onPin(kind);
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="contextual-inspector" aria-label={`Contextual Inspector for ${card.title}`}>
      <div className="card-heading">
        <div><p className="eyebrow">Contextual Inspector</p><h2>{card.title}</h2></div>
        <button ref={closeRef} className="text-button" aria-label="Close Contextual Inspector" onClick={onClose}>Close</button>
      </div>
      <section className={`anchored-teaching-card ${card.currentRevision.status}`} aria-label="Current anchored Teaching Card" aria-live="polite">
        <div className="card-heading">
          <h3>Current route</h3>
          <span className="saved">{teachingStatus(card.currentRevision.status)}</span>
        </div>
        {card.currentRevision.content
          ? <p>{card.currentRevision.content}</p>
          : <p className="subtle">{card.currentRevision.status === "streaming" ? "Preparing the anchored explanation…" : "No explanation content yet."}</p>}
        {card.currentRevision.error && <p className="failure-message" role="alert">{card.currentRevision.error}</p>}
        {card.currentRevision.retryable && <button className="secondary" disabled={busy}
          onClick={() => void onRetry()}>Retry anchored Teaching Card</button>}
        {card.currentRevision.contextUsed.length > 0 && <details className="context-used-receipt">
          <summary>Context Used Receipt</summary>
          <p>Context supplied to this Teaching Card:</p>
          <ul>{card.currentRevision.contextUsed.map((context) => <li key={`${context.sourceId}-${context.location}`}>
            <strong>{context.sourceName}</strong> · {context.location}
          </li>)}</ul>
        </details>}
        <ClaimTrust revision={card.currentRevision} />
        {card.currentRevision.status === "completed" && <fieldset className="teaching-card-claims">
          <legend>Exact mathematical claims</legend>
          {claimEdits.map((claim, index) => <div key={claim.claimId ?? `new-claim-${index}`}>
            <label htmlFor={`teaching-claim-${card.id}-${index}`}>Exact claim {index + 1}</label>
            <textarea id={`teaching-claim-${card.id}-${index}`} value={claim.statement}
              onChange={(event) => setClaimEdits((current) => current.map((item, itemIndex) =>
                itemIndex === index ? { ...item, statement: event.target.value } : item
              ))} />
            {claimEdits.length > 1 && <button type="button" className="text-button"
              aria-label={`Remove Teaching Card exact claim ${index + 1}`}
              onClick={() => setClaimEdits((current) => current.filter((_item, itemIndex) => itemIndex !== index))}>
              Remove claim
            </button>}
          </div>)}
          <button type="button" className="text-button" onClick={() => setClaimEdits((current) => [
            ...current, { claimId: null, statement: "" }
          ])}>Add exact claim</button>
          <button type="button" className="secondary" disabled={busy || claimEdits.length === 0
            || claimEdits.some((claim) => !claim.statement.trim())}
            onClick={() => void onEditClaims(claimEdits)}>Save exact claims</button>
        </fieldset>}
      </section>

      {card.revisions.length > 0 && (
        <section className="teaching-history" aria-label="Teaching Card revision history">
          <button className="secondary" aria-expanded={historyOpen} onClick={() => setHistoryOpen((current) => !current)}>
            {historyOpen ? "Hide Teaching Card revision history" : "Show Teaching Card revision history"}
          </button>
          {historyOpen && <ol>
            {card.revisions.map((revision, index) => <li key={revision.id}>
              <p>{revision.content || revision.error}</p>
              <button className="text-button" disabled={busy || revision.status === "streaming"}
                aria-label={`Restore Teaching Card revision ${index + 1}`} onClick={() => void restore(revision.id)}>Restore this revision</button>
            </li>)}
          </ol>}
        </section>
      )}

      {card.variants.map((variant) => (
        <section className="teaching-variant" aria-label={`Teaching Variant ${variant.name}`} aria-live="polite" key={variant.id}>
          <div className="card-heading"><h3>{variant.name}</h3><span className="saved">Named alternative</span></div>
          {variant.revision.error
            ? <p className="failure-message" role="alert">{variant.revision.error}</p>
            : <p>{variant.revision.content || (variant.revision.status === "streaming" ? "Preparing this alternative route…" : "No alternative content yet.")}</p>}
          {variant.revision.retryable && <button className="secondary" disabled={busy}
            onClick={() => void onRetry(variant.id)}>Retry Teaching Variant {variant.name}</button>}
        </section>
      ))}

      <form className="inspector-form" onSubmit={(event) => void submitRevision(event)}>
        <label htmlFor={`teaching-follow-up-${card.id}`}>{isQuestionDraft ? "Question about this Source Anchor" : "Teaching Card follow-up"}</label>
        <textarea id={`teaching-follow-up-${card.id}`} value={followUp} disabled={busy || card.currentRevision.status === "streaming"}
          onChange={(event) => setFollowUp(event.target.value)} />
        <button className="primary" disabled={busy || !followUp.trim() || card.currentRevision.status === "streaming"}>
          {isQuestionDraft ? "Ask about this Source Anchor" : "Revise current Teaching Card"}
        </button>
      </form>

      <form className="inspector-form" onSubmit={(event) => void submitVariant(event)}>
        <label htmlFor={`variant-name-${card.id}`}>Teaching Variant name</label>
        <input id={`variant-name-${card.id}`} value={variantName} disabled={busy}
          onChange={(event) => setVariantName(event.target.value)} />
        <label htmlFor={`variant-instruction-${card.id}`}>Alternative route instruction</label>
        <textarea id={`variant-instruction-${card.id}`} value={variantInstruction} disabled={busy}
          onChange={(event) => setVariantInstruction(event.target.value)} />
        <button className="secondary" disabled={busy || !variantName.trim() || !variantInstruction.trim()}>Create named Teaching Variant</button>
      </form>

      {artifact ? (
        <p className="saved" role="status">Pinned Learning Artifact retains this Source Anchor.</p>
      ) : (
        <div className="artifact-promotion-actions">
          <button className="secondary" disabled={busy || card.currentRevision.status !== "completed" || !card.currentRevision.content.trim()}
            onClick={() => void pin("learningArtifact")}>Pin as Learning Artifact</button>
          <button className="secondary" disabled={busy || card.currentRevision.status !== "completed" || !card.currentRevision.content.trim()}
            onClick={() => void pin("reformulatedProof")}>Save as Reformulated Proof</button>
        </div>
      )}
    </aside>
  );
}

function teachingStatus(status: AnchoredTeachingCard["currentRevision"]["status"]): string {
  return {
    idle: "Saved request",
    streaming: "Teaching in progress",
    completed: "Current revision",
    stopped: "Stopped",
    failed: "Needs attention"
  }[status];
}
