# Build, release, dependency, workflow, and Swift security triage — 2026-07-22

Issue #83 completed an evidence-backed review of Clarifold's build and release trust boundaries at `3604355e9d54ec46ca247a54e81973e1efbef3c7`.

This document is intentionally disclosure-safe. Validation details, reproductions, source/control/sink traces, and remediation-sensitive evidence remain in the private scan bundle. Runtime and learner-facing findings remain governed by the separate #82 triage and its #84/#85 remediation work.

## Outcome

| Measure | Result |
|---|---:|
| Ranked repository surfaces inventoried | 99 |
| Privileged or deployed surfaces fully reviewed | 32 |
| Canonical candidates classified | 29 |
| Final reportable findings | 4 |
| Low-severity findings | 4 |
| High or critical security-gate blockers | 0 |
| Candidates closed as rejected, prior-owned, or defense in depth | 25 |
| Deferred or unresolved candidates | 0 |
| Required discovery, validation, and attack-path receipts | 87 of 87 present |

The four findings are independent invocations of third-party GitHub Actions through movable major-version tags. They can affect checked-out source, the build runtime, executable-bearing caches, or the uploaded development beta. They remain low severity because the current workflow has read-only default token authority, no release event or release credential, and no notarized public-distribution step. #86 owns immutable action pinning and the related policy.

## Coverage and disposition

| Reviewed area | Public classification | Evidence and next owner |
|---|---|---|
| Production dependencies | Dismissed / not applicable | A production-only lockfile audit reports zero vulnerable nodes. |
| Development dependencies | Accepted risk pending remediation | Twelve open advisory instances are transitive development-only dependencies. Reachability review found no attacker-selected input to the affected paths in supported workflows. #86 must upgrade them or record time-bounded exceptions. |
| GitHub Actions token and trigger authority | Remediation required | Live repository defaults keep the workflow token read-only and no untrusted contribution receives release authority. Explicit least-privilege job permissions are still required by #86 so the invariant does not depend on repository defaults. |
| Third-party GitHub Actions | Validated, remediation required | Four independent low-severity findings survived validation and attack-path policy. Pin every privileged invocation to a reviewed full commit SHA; the fixture-only evidence upload remains non-reportable but should follow the same policy. |
| Cache and artifact handling | Remediation required | Pull-request cache isolation defeats promotion into the default-branch cache. The development beta upload remains exposed to mutable action code; consumer-side candidate digest binding is also retained for #86. |
| Lean runtime preparation | Dismissed with hardening retained | Structured argument execution with the shell disabled defeats the command-injection alert. Pinned archive identities and digests protect fresh preparation. Cache self-attestation and precompiled-content provenance remain defense-in-depth work where supported writers already have equivalent execution authority. |
| Packaging and release evidence | Remediation required, non-reportable | Bounded reproductions confirmed two candidate-attestation weaknesses, but the supported workflow exposes no lower-privileged artifact producer. An actor who can supply those bytes already controls the job or workspace and can directly alter the validator and evidence. #86 retains the fixes without treating them as current vulnerabilities. |
| Evaluation and quality gate | Dismissed with invariants retained | Generic command/path/authority candidates require trusted operator inputs. The supported beta lane fixes the benchmark and deterministic inventory, requires clean exact-candidate evidence, and checks the retained raw suite. |
| Secret exposure | Dismissed | GitHub Secret Scanning reported zero open alerts. Verified Gitleaks scans of tracked content and relevant Git history also returned zero findings. No secret rotation or private disclosure was required. |
| Swift analysis boundary | Prior-owned plus remediation required | Semgrep's Swift ruleset and Swift 6.4 warnings-as-errors typechecks covered both native helpers and the test fixture without new findings. Exact source matches the #82 audit; its real private resource and filesystem obligations remain owned by #85. #86 must make the equivalent Swift analysis lane repeatable and visibly failing. |
| Runtime and learner-facing application | Prior-owned | Exact source equivalence preserves #82's classifications and #84/#85 ownership; #83 did not duplicate or downgrade those findings. |

## Scanner reconciliation

The exact target revision had four open CodeQL alerts when triage began:

- the missing explicit workflow-permissions alert remains open as remediation-required policy work for #86;
- the command-line alert is dismissed because the implementation uses fixed executables, structured argument arrays, and no shell;
- both release path alerts are dismissed because the paths are trusted operator inputs in the supported clean-candidate workflow, while the separately reproduced artifact-integrity hardening remains assigned to #86.

Scanner dismissal does not imply that adjacent defense-in-depth work is complete. It records only that the scanner's claimed untrusted source-to-sink path did not survive validation.

## Remediation handoff

#86 should preserve these minimum invariants:

- declare least-privilege workflow permissions explicitly and keep untrusted contribution contexts free of write, secret, signing, and release authority;
- pin every third-party Action invocation to an approved full commit SHA and automate pin maintenance;
- upgrade development dependencies or record owner, expiry, reachability evidence, and review conditions for each exception;
- bind the exact packaged bytes, smoke receipt, candidate commit, and uploaded artifact together, rejecting symlinked application roots before attestation;
- retain fixed commands, structured arguments, contained paths, clean-candidate assembly, and truthful quality-gate authority;
- run a repeatable Swift scanner/compiler boundary that fails visibly in CI.

The recommendations are a handoff, not evidence that remediation is complete.

## Verification and limitations

- All 29 canonical candidates have discovery, centralized validation, and centralized attack-path receipts.
- Every coverage row is closed with no deferred or unresolved surface.
- Production and full dependency audits, live Dependabot/CodeQL/Secret Scanning records, tracked/history secret scans, Swift static analysis, compiler typechecks, source review, and bounded local reproductions were reconciled against the exact target revision.
- Severity follows the repository threat model: compromised upstream dependencies and mutable Actions are in scope; developers who already have unrestricted repository or local-shell authority are not treated as lower-privileged attackers.
- The current application is an ad-hoc-signed internal development beta, not a notarized public release. A future public distribution or privileged release workflow would require re-rating these boundaries.
- This triage does not claim that #86, #84, or #85 remediation is complete.
