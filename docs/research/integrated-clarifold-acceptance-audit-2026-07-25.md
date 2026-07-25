# Integrated Clarifold acceptance audit — 2026-07-25

## Decision

**Pass for the audited integrated revision, with the existing time-bounded
development-dependency exceptions and the deliberate #104 local workspace
rename gate preserved.** This record is evidence for the integrated
public-repository cutover; the delivery PR and its resulting squash-merge
`main` revision must rerun the exact verification lane before #103 is closed.
It does not close parent #81 or authorize a signed, notarized, ordinary-user
macOS release.

The audited revision is [`d2dae6ee3eca0fec6c9bac837ec8996127ec556a`](https://github.com/jerome-queck/clarifold/commit/d2dae6ee3eca0fec6c9bac837ec8996127ec556a), the exact `main` revision
available when this audit ran. Evidence was collected on macOS arm64 with
Node `v24.18.0` and npm `11.16.0`, matching the supported CI toolchain.

## Acceptance matrix

| Requirement | Result | Evidence |
| --- | --- | --- |
| Full repository verification passes on integrated `main` | **Pass** | `npm run verify` passed: 31 Vitest files / 452 tests, policy and identity checks, quality-gate fixture, Electron arm64 packaging, beta maker, packaged license audit, one index-budget smoke test, and 9 functional packaged tests with 1 intentional live-runtime skip. |
| Clean install, migration, interruption, rollback, retry, conflict, relaunch, and durable learner state | **Pass** | Migration tests cover staged activation with an intact source, idempotence, meaningful-destination conflict, failed staging cleanup, incomplete source, concurrent launch guards, abandoned-lock recovery, rollback sessions, Source Anchors, Personal Notes, Linked Sources, Source Index state, and legacy-state migration. Packaged smoke covers migration/rollback and durable-session reload. |
| Security gate remains satisfied | **Pass with recorded exceptions** | Production `npm run security:dependencies` reported zero vulnerabilities; `npm run security:secrets` found no leaks; `npm run security:swift` passed; live GitHub state has zero open CodeQL and secret-scanning alerts. The 11 open Dependabot alerts are the known transitive development-toolchain paths recorded below and in the [public-cutover security gate](../security/public-cutover-security-gate-2026-07-23.md), owned by Jerome Queck through 2026-10-23. |
| Canonical public and packaged legal/community surfaces are present and validated | **Pass** | `npm run test:policy` and `npm run policy:documentation` passed. Root license, notice, third-party notices, privacy, security, conduct, contribution, issue forms, pull-request declarations, and packaged legal-resource checks are present and consistent. |
| Live repository metadata and community profile match Clarifold | **Pass with documented GitHub limitation** | The live repository is public, named `jerome-queck/clarifold`, has the Clarifold description and intended topics, keeps homepage blank, and reports community health 100%. README, contribution, pull-request, conduct, and license surfaces are recognized; GitHub reports the PolyForm license as `NOASSERTION`/`Other`, which is the documented detector limitation rather than a relicensing change. The four YAML issue forms are present in the repository and the chooser routes sensitive matters privately. |
| Stale identifier and Build Week searches match the allowlist | **Pass** | `npm run policy:legacy-identifiers` classified 406 references: 276 historical, 116 durable-domain, 14 approved-compatibility, and no unexplained active event or product references. Generated and dependency directories are excluded by the audited policy. |
| README, screenshots, icon, application, package, artifact, CI, and candidate reports present Clarifold consistently | **Pass** | `npm run policy:identity`, `npm run branding:icon:check`, packaged identity/icon/legal-resource checks, and the installed candidate receipt passed. The candidate report binds Clarifold `0.2.0`, bundle `org.jeromegroup.clarifold`, archive `Clarifold-darwin-arm64-0.2.0.zip`, and the exact revision. |
| Releases, tags, and old repository redirect are verified without repetition | **Pass** | Live Clarifold Releases count is `0`, tag count is `0`, and `https://github.com/jerome-queck/openai-build-week` returns HTTP `301` to `https://github.com/jerome-queck/clarifold`. |
| Local workspace rename remains isolated to #104 | **Pass** | No local workspace-directory rename or compatibility symlink was performed. The canonical migration record remains authoritative for the separate #104 post-audit operation. |
| Internal-candidate policy is exercised with exact provenance and checksums | **Pass** | `CANDIDATE_REVISION=d2dae6ee3eca0fec6c9bac837ec8996127ec556a npm run quality:assemble:internal-candidate` passed against a clean exact revision. The installed arm64 archive SHA-256 is `39dd569b85cc1950c586af0b9b1a333f523f47b10db32a1026cb0fbfe9700ece` and the receipt SHA-256 is `33387b79e838481cc0fc004d6faf0bd76f2979ee171088e0019aeb57467d6294`; the report declares unsigned, non-notarized, limited-support, not-for-distribution status with 14-day report and 30-day archive retention. |

## Verification evidence

### Local and packaged lanes

The complete command sequence was run with the repository's Node 24 toolchain:

```text
npm run verify                         PASS
npm run security:dependencies         PASS — 0 production vulnerabilities
npm run security:secrets              PASS — Gitleaks: 167 commits, ~4.31 MB, no leaks
npm run security:swift                 PASS — all native and fixture Swift checks
npm run quality:assemble:internal-candidate PASS — exact revision and clean tree
```

The packaged receipt validated the extracted application, Clarifold identity,
executable, bundled verifier, generated icon parity, legal resources, code
signature, source-index and verifier budgets, installed critical journeys, and
agent recovery journeys. The archive was not promoted to a GitHub Release.

The reviewable scenario seams are:

- [`clarifold-data-migration.test.ts`](../../src/main/clarifold-data-migration.test.ts): staged valid-state activation with source preservation, idempotence, meaningful-destination conflict, failed-staging cleanup, incomplete-source rejection, abandoned-lock recovery, concurrent-launch blocking, rollback session preservation, Source Anchor and Personal Note preservation, and missing Linked Source revalidation.
- [`learning-application.test.ts`](../../src/shared/learning-application.test.ts): durable session migration, stopped retryable cards across shutdown/relaunch, source and session restoration, and durable learner-state recovery.
- [`packaged-clarifold.spec.ts`](../../tests/packaged-clarifold.spec.ts): packaged migration/rollback, durable-session reload, verifier/artifact reinstall, delayed-transfer reload, resource budgets, Background Agent Task recovery, and authentication-destination rejection.
- The generated ignored receipts are `test-results/beta-install.json` and `test-results/internal-candidate.json`; they are produced by [`install-beta-for-smoke.mjs`](../../scripts/install-beta-for-smoke.mjs) and [`assemble-internal-candidate-manifest.mjs`](../../scripts/assemble-internal-candidate-manifest.mjs). The candidate manifest completed at `2026-07-25T06:27:59.616Z` and records the archive and receipt digests above.

The full npm audit currently reports 33 development-only vulnerability nodes
(3 low, 29 high, 1 critical). The production graph remains clean. The live
Dependabot snapshot collected on 2026-07-25 reports 11 open alerts: #1 (`tmp`,
low), #2–#7 (`tar`, high), #8 (`tmp`, high), #9 (`tar`, medium), #10
(`shell-quote`, high), and #14 (`tar`, medium). They reduce to the same three
transitive roots through Electron Forge/rebuild/node-gyp, Electron
Forge/Inquirer, and the local `concurrently` launcher. These are not silently
dismissed: the owner is Jerome Queck, review-by is 2026-10-23, and the required
action is to upgrade or replace the supported development graph and rerun the
full audit before expiry or immediately if the reachability boundary changes.

### Live GitHub controls

The live repository API reported (using the linked [repository](https://api.github.com/repos/jerome-queck/clarifold), [community profile](https://api.github.com/repos/jerome-queck/clarifold/community/profile), [branch protection](https://api.github.com/repos/jerome-queck/clarifold/branches/main/protection), [releases](https://api.github.com/repos/jerome-queck/clarifold/releases), and [tags](https://api.github.com/repos/jerome-queck/clarifold/tags) endpoints):

- `main` requires the strict `verify` status check, requires linear history,
  rejects force-pushes and deletion, and has no required code-owner approval.
- GitHub Private Vulnerability Reporting is enabled (`204` from the repository
  vulnerability-alerts endpoint); repository CodeQL and secret-scanning alert
  counts are both zero.
- GitHub community health is 100%; the current profile recognizes README,
  contributing, pull-request, conduct, and license surfaces. PolyForm's
  `NOASSERTION` detector result is retained as a limitation.
- The exact live topics are `advanced-mathematics`, `codex`, `education`,
  `electron`, `lean4`, `learning`, `local-first`, `macos`, `react`, and
  `typescript`; the repository description is “A local-first macOS workbench
  that turns the feeling of understanding advanced mathematics into evidence.”
- Discussions, Packages, and the homepage remain intentionally unused; no
  accidental public production release or candidate tag exists.

## Limitations and revalidation

This receipt is bound to the exact audited baseline revision and evidence above.
The committed delivery candidate must run hosted `verify`, and the squash merge
must be checked again on its resulting `main` SHA; those exact-SHA results are
the evidence used to close #103. A new runtime dependency finding,
open high/critical CodeQL alert, secret alert, workflow authority, signed
distribution path, or externally reachable build input reopens the security
decision. Parent #81 remains open until its integrated acceptance and the
separate human/local #104 gate are complete.

Issue #104 is the focused follow-up for the deferred local workspace-directory
rename. Hosted PR verification and the resulting squash-merge `main` check are
delivery gates for this issue, not a reason to rename the workspace early; the
parent remains open until those exact-SHA checks and #104 are complete.

The first hosted `verify` run for candidate `72c212d7` passed in
[PR #143](https://github.com/jerome-queck/clarifold/actions/runs/30148849681).
When `main` advanced to the same audit tree during delivery, the classifier
correctly failed a subsequent empty-diff update with `No changed paths were
found`; this was a delivery-state result, not an application verification
failure. This receipt keeps the final PR diff non-empty so its hosted and
post-merge checks remain reviewable.
