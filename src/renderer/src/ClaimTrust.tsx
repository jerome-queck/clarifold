import {
  claimCheckMethodLabel,
  claimCheckOutcomeLabel,
  claimEvidenceReferenceLabel,
  claimOriginLabel,
  verificationCurrencyLabel,
  verificationLevelLabel,
  type ClaimVerificationState
} from "../../shared/learning-application";

export interface ClaimTrustRevision {
  claims?: ClaimVerificationState[];
}

export function ClaimTrust({ revision }: {
  revision: ClaimTrustRevision;
}) {
  const claims = revision.claims ?? [];
  return (
    <section className="claim-trust" aria-label="Claim provenance and verification">
      {claims.map((claim, index) => <article aria-label={`Mathematical claim ${index + 1}`} key={claim.claimId}>
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
      </article>)}
    </section>
  );
}
