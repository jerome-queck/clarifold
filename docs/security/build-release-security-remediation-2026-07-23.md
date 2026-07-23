# Build and release security remediation — 2026-07-23

Issue #86 turns the disclosure-safe triage in [`build-release-security-triage-2026-07-22.md`](build-release-security-triage-2026-07-22.md) into repeatable repository controls.

## Workflow trust boundary

The macOS verification job now has an explicit empty workflow permission baseline and grants only `contents: read` to its job. Pull requests, including untrusted fork contributions, receive no write, release, signing, or secret authority. Every third-party action is pinned to a reviewed full commit SHA, with its maintained version retained in a comment so Dependabot can propose pin updates:

- `actions/checkout` v7: `fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09`
- `actions/setup-node` v7: `a0853c24544627f65ddf259abe73b1d18a591444`
- `actions/cache` v6: `0057852bfaa89a56745cba8c7296529d2fc39830`
- `actions/upload-artifact` v7: `ea165f8d65b6e75b540449e92b4886f43607fa02`
- `gitleaks/gitleaks-action` v3: `e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e`

Dependabot's GitHub Actions update group remains enabled. A pin change is reviewable as a normal pull request and cannot self-approve or publish a release.

## Dependencies

On 2026-07-23 with Node 24, `npm audit --omit=dev --audit-level=high` reports zero production vulnerabilities. The full audit reports 24 development-only vulnerability nodes (3 low, 20 high, 1 critical), with the fixed `fast-uri` transitive package removed from that set and now locked at 3.1.4.

The remaining full-audit findings are transitive development-only paths and are not reachable from the packaged application or supported learner-controlled runtime. They remain time-bounded exceptions rather than silent dismissals:

| Root package | Path | Classification | Review-by | Evidence and condition |
| --- | --- | --- | --- | --- |
| `tar` | Electron Forge → Electron rebuild → node-gyp → make-fetch-happen | Development-only, transitive; no supported fix is available in the current stable Forge lane | 2026-10-23 | Packaging tooling runs only in the trusted build job; upgrade Forge/rebuild when a supported release removes the vulnerable range, then rerun the full audit and packaging lane |
| `tmp` | Electron Forge → Inquirer editor → external-editor | Development-only, transitive; no supported fix is available in the current stable Forge lane | 2026-10-23 | No learner or repository input reaches the editor's temporary-directory prefix; remove the exception when Forge's supported dependency graph updates |
| `shell-quote` | `concurrently` used only by the local development launcher | Development-only, transitive; no supported upgrade is available without changing the launcher major version | 2026-10-23 | The launcher is not used by CI or packaged runtime and receives only repository-authored commands; replace or upgrade the launcher before expiry |

The production audit command is a required CI check. The full audit must still be reviewed whenever Dependabot changes the lockfile; any new runtime finding or unlisted development path is a release blocker. This exception record is valid only through the review-by date and does not authorize introducing the affected packages into runtime dependencies.

## Secret scanning

The macOS CI checkout fetches full history and runs the pinned Gitleaks action with pull-request comments and artifact upload disabled, so it needs only read access. GitHub Secret Scanning remains the repository's hosted alerting control. The 2026-07-22 tracked-content and relevant-history scans reported no known live secret; a future finding must be handled privately and rotated before disclosure.

## Swift boundary

`npm run security:swift` runs Swift 6.4 compiler typechecking with warnings-as-errors for both native helpers and the scanned-PDF fixture. It runs before the broader verification lane and fails visibly on a compiler or warning regression. This is the documented equivalent analysis boundary from the triage; it does not replace the private-resource and filesystem ownership in #85.

## Release integrity

The packaged smoke installer now uses `lstat` to reject a symbolic-link application root before code-signature and verifier attestation. The existing candidate receipt continues to bind the exact archive digest, candidate commit, extracted application, signature, and bundled verifier; publishing rejects a missing or digest-mismatched archive. No signed or notarized public release is introduced by this change.
