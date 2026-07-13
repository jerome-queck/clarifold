# Contributing

## Work tracking

- Use one GitHub Issue per independently deliverable feature, fix, or maintenance task.
- `/to-spec` publishes the approved spec as a `ready-for-agent` GitHub Issue.
- `/to-tickets` creates `ready-for-agent` tracer-bullet Issues with explicit blockers. Generated tickets do not need `/triage`.
- Work the unblocked frontier one ticket at a time. Start each `/implement` ticket in a fresh context.
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

The installed `/implement` ordering says to review before committing, but `/code-review` reads committed `HEAD` and cannot see uncommitted changes. This repository therefore uses the following explicit override:

1. Commit locally without pushing.
2. Run `/code-review main` for separate Standards and Spec reviews.
3. Fix findings, amend or add commits, and rerun review when material.
4. Push only after the branch passes review and tests.

Repeat this checkpoint for later draft-pull-request changes, then run a final review before marking the pull request ready.

## AI attribution

When an AI agent materially contributes, include its applicable trailer exactly once in local commits and in the final squash-commit message:

```text
Co-authored-by: Codex <noreply@openai.com>
Co-authored-by: Claude <noreply@anthropic.com>
```

Do not add attribution for an agent that did not materially contribute.

## Pull requests

- Open a draft pull request after the first coherent commit is pushed when collaborative visibility is useful.
- Keep the pull request focused on its ticket.
- Include `Closes #<issue-number>` in the body.
- Explain the change and list verification performed.
- Ensure `/code-review main` and all relevant checks pass before marking it ready.
- Squash-merge after review and checks pass, then delete the branch.

Trivial repository setup or documentation corrections may go directly to `main`; product work should use a pull request.
