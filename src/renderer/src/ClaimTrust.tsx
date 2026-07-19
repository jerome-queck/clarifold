import {
  claimCheckMethodLabel,
  claimCheckOutcomeLabel,
  claimEvidenceReferenceLabel,
  claimOriginLabel,
  verificationCurrencyLabel,
  verificationLevelLabel,
  type ClaimVerificationState,
  type VerifierManifest
} from "../../shared/learning-application";
import { formalizationForClaim } from "../../shared/verifier-runtime";
import { useState } from "react";

export interface ClaimTrustRevision {
  claims?: ClaimVerificationState[];
}

export function ClaimTrust({ revision, revisionId, verifierManifests = [], onVerify }: {
  revision: ClaimTrustRevision;
  revisionId?: string;
  verifierManifests?: VerifierManifest[];
  onVerify?: (claimId: string) => Promise<void>;
}) {
  const claims = revision.claims ?? [];
  const [runningClaimId, setRunningClaimId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const verify = async (claimId: string) => {
    if (!onVerify) return;
    setError(null);
    setRunningClaimId(claimId);
    try {
      await onVerify(claimId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The formal check could not be started.");
    } finally {
      setRunningClaimId(null);
    }
  };
  return (
    <section className="claim-trust" aria-label="Claim provenance and verification">
      {claims.map((claim, index) => {
        const formalization = formalizationForClaim(claim.claimStatement);
        const manifests = verifierManifests.filter((manifest) => manifest.claimId === claim.claimId
          && (!revisionId || manifest.claimRevisionId === revisionId));
        return <article aria-label={`Mathematical claim ${index + 1}`} key={claim.claimId}>
      <dl className="artifact-evidence">
        <div><dt>Claim Origin</dt><dd>{claimOriginLabel(claim.claimOrigin)}</dd></div>
        <div><dt>Verification Level</dt><dd>{verificationLevelLabel(claim.verificationLevel)}</dd></div>
        <div><dt>Verification Currency</dt><dd>{verificationCurrencyLabel(claim.verificationCurrency)}</dd></div>
      </dl>
      <p className="claim-statement"><strong>Exact claim:</strong> {claim.claimStatement}</p>
      {claim.claimOriginReferences.length > 0 && <p className="record-link">Origin evidence: {
        claim.claimOriginReferences.map(claimEvidenceReferenceLabel).join(" · ")
      }</p>}
      {claim.verificationEvidence.length > 0 && <details className="verification-evidence">
        <summary>Verification evidence</summary>
        <ol>{claim.verificationEvidence.map((item) => <li key={item.id}>
          <p><strong>{claimCheckMethodLabel(item.method)}</strong> · {claimCheckOutcomeLabel(item.outcome)} · {verificationCurrencyLabel(item.currency)}</p>
          <p>{item.summary}</p>
          <p className="record-link">{claimEvidenceReferenceLabel(item.reference)}</p>
          {item.limitation && <p className="subtle">{item.limitation}</p>}
          {item.changedBecause && <p className="subtle">Changed because: {item.changedBecause}</p>}
        </li>)}</ol>
      </details>}
      {claim.verificationGaps.map((gap) => <div className="verification-gap" role="alert" aria-label="Verification Gap" key={gap.id}>
        <strong>Verification Gap</strong>
        <p>{gap.reason}</p>
        <p>Affected conclusion: {gap.affectedConclusion}</p>
      </div>)}
      {claim.verificationEscalation.recommended && <div className="verification-escalation" role="status" aria-label="Verification Escalation">
        <strong>Verification Escalation recommended</strong>
        <ul>{claim.verificationEscalation.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
      </div>}
      {formalization && <section className="formalization-preview" aria-label={`Formalization for mathematical claim ${index + 1}`}>
        <h3>Exact formal statement</h3>
        <pre>{formalization.formalStatement}</pre>
        <p><strong>Assumptions:</strong> {formalization.assumptions.join(", ")}</p>
        <p className="subtle">A successful run applies only to this exact formal statement, not the surrounding explanation or unformalized steps.</p>
        {onVerify && <button className="secondary" disabled={runningClaimId !== null}
          aria-label={`Check exact claim ${index + 1} with bundled Lean`}
          onClick={() => void verify(claim.claimId)}>
          {runningClaimId === claim.claimId ? "Checking with bundled Lean…" : "Check exact claim with bundled Lean"}
        </button>}
      </section>}
      {manifests.length > 0 && <details className="verifier-manifests" open>
        <summary>Verifier Manifests</summary>
        {manifests.map((manifest) => <article key={manifest.id} aria-label="Verifier Manifest">
          <dl className="artifact-evidence">
            <div><dt>Command outcome</dt><dd>{manifest.commandOutcome}</dd></div>
            <div><dt>Verification Environment</dt><dd>{manifest.environment.id} · Lean {manifest.environment.leanVersion}</dd></div>
            <div><dt>Formal statement</dt><dd>{manifest.formalStatement ?? "Unsupported translation"}</dd></div>
            <div><dt>Assumptions</dt><dd>{manifest.assumptions.join(", ") || "None recorded"}</dd></div>
            <div><dt>Evidence location</dt><dd>{manifest.evidenceLocation ?? "No proof file was produced"}</dd></div>
          </dl>
          <p>{manifest.diagnostics}</p>
        </article>)}
      </details>}
      </article>})}
      {error && <p className="failure-message" role="alert">{error}</p>}
    </section>
  );
}
