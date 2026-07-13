# Contributing

## Work tracking

- Use one GitHub Issue per independently deliverable feature, fix, or maintenance task.
- `/to-spec` publishes the approved spec as a `ready-for-agent` GitHub Issue.
- `/to-tickets` creates `ready-for-agent` tracer-bullet Issues with explicit blockers. Generated tickets do not need `/triage`.
- Work the unblocked implementation frontier one ticket at a time. Start each `/implement` ticket in a fresh context.
- For tracked work, reference the ticket as `Refs #<number>` in at least one branch commit and `Closes #<number>` in the pull request.

## Branches

Keep `main` stable and demo-ready. Create each branch from an up-to-date `main`:

```text
feature/12-streaming-chat
fix/19-login-error
docs/23-api-guide
chore/27-update-tooling
```

Default to one branch and one pull request per ticket. Do not mix unrelated work, branch from unfinished feature branches, or reuse merged branches. Merge blockers before dependants.

Only wide expand-contract refactors may use a shared integration branch, and only when migration batches cannot remain independently green.

Prototypes are different: capture them on a clearly named throwaway branch outside `main`, link that branch and its verdict from the Issue, and merge only the validated decision into production code.

## Implementation

- Agree the public testing seams before implementation. Specs should record them.
- Develop in red-green vertical slices: one failing behavior test, then the minimum implementation to pass it.
- Test behavior through public seams, not implementation details. Refactor during review, after behavior is green.
- Keep every commit focused and leave tests passing.
- Use conventional commit subjects where practical, such as `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, or `chore:`.
- Run typechecking and focused tests regularly; run the full suite at completion.
- For bug fixes, state the confirmed cause in the commit or pull-request message.

### Review ordering

For product work, use this flow:

1. Create a branch from `main` for the Issue.
2. Implement and commit the work on that branch. A commit saves a version locally; it does not change `main`.
3. Push the branch. This copies the branch and its commits to GitHub; it still does not change `main`.
4. Open a pull request targeting `main`. The pull request is the proposal and review page for merging the branch into `main`.
5. Run `/code-review main`. Its **Standards** review checks the code against repository conventions and code-smell guidance; its **Spec** review checks whether the change correctly fulfils the Issue or spec without missing requirements or adding unrelated scope.
6. Fix any findings on the same branch, then commit and push those fixes. The pull request updates automatically. Rerun review after material fixes.
7. Merge the pull request only after review and tests pass. This is the step that changes `main` and can close the linked Issue.

## AI attribution

When an AI agent materially contributes, include its model-specific co-author and session trailers exactly once in local commits and in the final squash-commit message.

Codex uses its current model display name and thread ID:

```text
Co-authored-by: Codex <model> <noreply@openai.com>
Codex-Session: codex://threads/<CODEX_THREAD_ID>
```

Claude Code's generated model-specific `Co-authored-by` and `Claude-Session` trailers should be preserved. Do not invent session identifiers, duplicate automatic trailers, or attribute an agent that did not materially contribute.

## Pull requests

- Open a regular pull request when the branch is ready for review. Use a draft only when you deliberately want early feedback on unfinished work and GitHub offers the option.
- Keep the pull request focused on its ticket.
- Include `Closes #<issue-number>` in the body and target `main` so GitHub closes the Issue on merge.
- Explain the change and list verification performed.
- If `main` advances, update the branch, resolve conflicts, then rerun affected tests and review.
- Ensure `/code-review main` and all relevant checks pass before merging.
- Squash-merge after review and checks pass. Before confirming the merge, ensure the squash-commit message contains each applicable AI attribution trailer exactly once. Then delete the branch.

Trivial repository setup or documentation corrections may go directly to `main`; product work should use a pull request.
