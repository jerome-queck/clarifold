# Issue #116 integrated async-lifecycle closeout

Audit date: 2026-07-23

The audit was performed from integrated `main` at `35b7caf1` after PR #118
(#117) and PR #119 (#115) merged. The historical verifier, filesystem, and
source-index findings were not reopened by assumption. A current packaged red
reproduction was investigated only when the large-source budget scenario failed
on the clear-to-rebuild boundary.

## Completion criteria

| Criterion | Evidence | Result |
| --- | --- | --- |
| Child work is integrated | #115 and #117 are closed; merge commits `35b7caf1` and `4bcef40f` are on `main`. | Pass |
| Long-running operations expose correlated terminal state | Model teaching, session proposal, and access transitions use the shared `LearnerOperationRecord` ID, phases, queued actions, and learner feedback. Research actions, Agent Tasks, Source Index summaries, Verifier Environment state, and Verifier Manifests retain their domain IDs and terminal outcomes. | Pass with limitation below |
| Incompatible learner actions settle visibly | Public tests hold teaching/access work open and cover queued anchored explanation, queued intake, stale Full Access supersession, and access decisions. Renderer availability and the Busy/Queued/Blocked/Superseded notice use the same shared availability contract. | Pass |
| Packaged scenarios isolate action boundaries | Release-critical scenarios have isolated data/runtime/source roots. Actions have bounded receipts with operation, settlement, elapsed time, visible/backend failure state, lifecycle logs, and Playwright trace chunks. | Pass |
| Fresh Node 24/macOS packaged verification is repeated and measured | The source-index scenario performs five build samples, including four clear/rebuild cycles; the cold-start scenario performs twenty launches; verifier and Agent Task scenarios retain outcome samples. The exact candidate evidence is recorded below. | Pass |

## Current red reproduction and diagnosis

The first candidate verification at `35b7caf1` failed in the packaged
`large-source-index-budget` scenario after the first build and clear had
settled. The retained Playwright trace showed:

1. the first build reached `Ready · 1 page · 0 equation regions`;
2. clear reached `Search data unavailable · rebuild required`;
3. the rebuild button was still disabled while the renderer's local
   `busy` state was settling;
4. Playwright pressed that disabled button without dispatching the IPC action;
5. the backend therefore correctly remained `cleared`.

This was a packaged-harness synchronization defect, not a source-index
algorithm or verifier defect. The fix waits for the visible rebuild control to
be enabled before pressing it, at both clear-to-rebuild seams. It adds no
sleep, retry, product timeout, or product-indexing change.

## Deterministic verification seams

- Public Learning Application/source-access/packaged-action tests cover 232
  relevant tests after the fix, including the pinned 50,000-line corpus,
  clear/rebuild persistence, serialized index work, terminal model/access
  states, and the deliberate bounded-action stall.
- The full suite is 26 Vitest files / 408 tests; the final candidate
  `npm run verify` is the authoritative integrated result.
- Readiness waits are named bounded packaged actions, so a failed enabled-state
  boundary receives the same action-level receipt as its dispatch. Trace,
  lifecycle output, backend state, and operation receipts remain attached during
  scenario cleanup.

## Exact candidate verification

Candidate before this evidence-record update: `08344b3067f142dc9cfe2dc137b4276b26a4e4c9`.

```text
PATH=/Users/jeromequeck/.nvm/versions/node/v24.11.0/bin:$PATH npm run verify
26 Vitest files / 408 tests passed
packaged index-budget: 1 passed in 9.9s
packaged functional: 8 passed, 1 intentional live-runtime skip, 2.3m
ZIP SHA-256: 998db820e163900fb6b9e59b2fc056fe999eb27aa7d8dedf896154b4d2fe2a07
source-index p95: 795ms (795, 759, 763, 740, 756)
verifier lifecycle p95: 10371ms (10144, 10371, 586, 520, 518, 8957, 546, 539)
cold-start p95: 434ms (385, 430, 420, 434, 435, 391, 380, 369, 389, 385, 382, 374, 386, 382, 372, 377, 368, 382, 376, 387)
Agent Task p95: 58ms (27, 58, 37, 23, 19)
peak memory: 594MiB
verifier footprint: 6622MiB
application disk use: 6912MiB
```

The final post-remediation run is regenerated against the final commit after
this evidence-record update. Its exact SHA, ZIP digest, and measurements are
also posted to issue #116 and the pull request before merge.

## Remaining limitations

- There is no single universal lifecycle ledger shared by Source Index,
  Verifier Environment, External Research, and Agent Task records. Those
  boundaries retain domain-specific IDs and terminal states; a future uniform
  cross-operation timeline would be a separate architectural follow-up.
- A local packaged action deadline records and diagnoses a hung action but does
  not forcibly abort the underlying renderer promise. Scenario cleanup still
  terminates the isolated packaged process; this is a test-boundary limitation,
  not evidence of product completion.
- Model-provider transport deadlines remain owned by the Model Runtime
  adapter. Product cancellation, shutdown checkpointing, access decisions, and
  terminal Teaching Card states are covered here, but a provider that ignores
  cancellation can still require adapter-level investigation.

These limitations do not reopen resolved verifier or source-index defects and
do not weaken the approved source-index or verifier budgets.
