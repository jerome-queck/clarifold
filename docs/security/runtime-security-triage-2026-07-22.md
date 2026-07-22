# Runtime and learner-facing security triage — 2026-07-22

Issue #82 completed an evidence-backed review of Clarifold's deployed runtime and learner-facing trust boundaries at `56a0d7656ae4b1f1faddf54494b13a59f188a762`.

This document is intentionally disclosure-safe. Reproduction details, affected controls, proof material, and remediation-sensitive evidence are retained in private GitHub Security Advisories and the private scan bundle. Build, workflow, dependency, packaging, and release security remain assigned to #83.

## Outcome

| Measure | Result |
|---|---:|
| Original runtime/worklist surfaces reviewed | 25 |
| Canonical candidates after deduplication | 8 |
| Private validated findings | 3 |
| Medium / low findings | 1 / 2 |
| High or critical public-cutover blockers | 0 |
| Candidates closed as rejected or disclosure-safe hardening | 5 |
| Deferred or unresolved candidates | 0 |
| Required discovery, validation, and attack-path receipts | 24 of 24 present |

The private findings concern three distinct control families: Model Runtime data authority, authentication-navigation validation, and native document resource budgeting. Their constraints and realistic reachability were retained in the final severity decisions; none was promoted to high or critical.

## Coverage and disposition

| Reviewed area | Public disposition | Next owner |
|---|---|---|
| Command construction and process launch | No validated command injection survived. Fixed executables, structured arguments, managed working directories, and bounded environments were confirmed where applicable. | #84 preserves these invariants and resolves any remaining narrow process-hardening work. |
| Dynamic property or method dispatch | The scanner candidate was a typed, source-literal collection operation rather than externally selected dispatch. | #84 records the explicit dismissal and keeps unsupported protocol operations fail-closed. |
| Model Runtime protocol, tools, and learner data | One private validated finding and one reliability-hardening row were retained. Governed note synthesis was confirmed as intended behavior rather than reclassified. | #84 owns typed protocol and navigation controls; #85 owns capability-scoped local data access. |
| Linked Sources and native extraction | One private validated resource finding and two disclosure-safe filesystem/resource hardening rows were retained. | #85 owns object-bound path safety, race coverage, and bounded source ingestion. |
| Artifact Export and share copies | No reportable vulnerability survived. One portability/metadata-hardening row remains. | #85 owns disclosure-safe portable-path representation. |
| Verifier inputs, executable selection, and evidence paths | No reportable vulnerability survived. Manifest validation, structured arguments, containment, and symlink defenses justified the scanner dismissals. | #84 and #85 preserve these controls in focused adversarial tests. |
| Durable learner-controlled values | Persisted values were traced through privileged consumers. No generic persisted-value path or dispatch vulnerability survived beyond the privately recorded Model Runtime boundary. | #84/#85 retain runtime decoding, safe identifiers, managed roots, and recoverable failure invariants. |

## Private records

The three validated findings are recorded as draft private GitHub Security Advisories:

- `GHSA-f824-gfc9-m642` — medium
- `GHSA-2vr5-9ww8-xj66` — low
- `GHSA-5h3p-pjpg-cgj2` — low

The advisories contain the affected revisions, bounded reproduction evidence, counterevidence, impact limits, and remediation invariants. They remain private until fixes and coordinated disclosure decisions are complete.

## Scanner reconciliation

Code scanning produced 41 open alerts before triage. Issue #82 owns 37 runtime/learner-facing alerts (`3`, `4`, and `7`–`41`); all received individual API-backed dismissal receipts with concrete, evidence-specific comments. Test-only alerts were classified as used in tests. False-positive dismissals were limited to cases where structured execution, fixed dispatch, explicit learner-selected destinations, or managed-root containment made the reported vulnerability infeasible.

Alerts `1`, `2`, `5`, and `6` remain open for #83 because they concern workflow, build, or release surfaces outside this issue's boundary.

Scanner dismissal does not close or downgrade the three independently validated private findings; those findings arise from different security invariants than the scanner rules.

## Hardening handoff

The private hardening portfolio evaluated six options across two qualified opportunities and mapped every reportable and rejected evidence row:

- #84 should preserve fixed structured execution, introduce purpose-specific runtime decoding/navigation policy, and keep unsupported operations fail-closed.
- #85 should remove ambient application-state authority from Model Runtime source access, bind reads to learner-authorized capabilities, enforce object/path identity through use, and add native extraction budgets with recoverable failure behavior.

The recommended designs are guidance, not evidence that remediation is complete. #84 and #85 must cite focused tests, packaged reachability, and repository verification for their selected implementations.

## Command and dispatch hardening record

Issue #84 preserves the triage dismissals and addresses the remaining disclosure-safe control gap without reclassifying rejected scanner candidates as vulnerabilities:

- Command injection remains dismissed: every production child launch selects one executable before launch, passes a structured argument array with `shell: false`, supplies an explicit working directory, and inherits only an allowlisted environment. Metacharacter and Unicode path tests confirm that argument content is not reinterpreted as a command.
- The reported dynamic-property candidate remains dismissed: it was a source-literal typed collection operation with no externally selected property or method. Runtime server requests and dynamic tools now use exact allowlisted dispatch values; each admitted tool call must also match the registered thread, turn, purpose-specific advertised tool set, and callback before any side effect. ASCII and Unicode lookalikes, unadvertised tools, and cross-thread envelopes fail closed with non-sensitive errors.
- Authentication state and ChatGPT-login results now receive purpose-specific runtime decoding. Authentication navigation is accepted only as one normalized HTTPS origin and route, rejects user-info, ports, lookalikes, encoded route variants, fragments, and malformed values at the child-response boundary, and applies the same policy again immediately before the privileged browser open.
- Focused runtime tests exercise malformed responses, malicious metacharacters, unsupported dispatch keys, and Unicode or encoding variants. The packaged application test drives a hostile child-supplied authentication destination through the renderer and verifies that it is rejected before the browser-open boundary.

This record does not close the separate Model Runtime data-authority or native document-resource findings assigned to #85.

The authentication origin-and-route policy intentionally does not guess at an undocumented provider query contract. The current Codex runtime supplies the OAuth client, redirect, state, and proof-key parameters; tightening those query values requires authoritative provider evidence and remains a time-bounded follow-up rather than an unsupported security claim.

## Verification and limitations

- All eight canonical candidates have one discovery, one validation, and one attack-path receipt.
- Every referenced receipt and phase report resolves inside the private scan bundle.
- Three dedicated vulnerability write-ups and bounded, non-egressing reproductions passed independent review.
- The final coverage ledger is complete with no duplicate, deferred, or inconsistent candidate.
- Source equivalence from the original validation revision to `56a0d7656ae4b1f1faddf54494b13a59f188a762` is recorded in the private re-anchor receipt; changed program documentation was separately reviewed against the threat model.
- No real learner data, credential collection, live phishing destination, unbounded native workload, or external-model privacy sentinel was used.
- This triage does not claim that #84, #85, or #83 remediation is complete.
