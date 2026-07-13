# Contributing

## Work tracking

- Use one GitHub Issue per independently deliverable feature, fix, or maintenance task.
- Keep generated specs and implementation tickets in GitHub Issues.
- Reference the issue number in commits and pull requests.

## Branches

Keep `main` stable and demo-ready. Create each branch from an up-to-date `main`:

```text
feature/12-streaming-chat
fix/19-login-error
docs/23-api-guide
chore/27-update-tooling
```

Default to one branch and one pull request per ticket. Do not mix unrelated work, branch from unfinished feature branches, or reuse merged branches. Use a shared integration branch only when tightly coupled changes cannot remain independently green.

## Implementation

- Develop in small, test-driven vertical slices.
- Keep every commit focused and leave tests passing.
- Use conventional commit subjects where practical, such as `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, or `chore:`.
- Run relevant tests and checks before requesting review.

## AI attribution

When an AI agent materially contributes to a commit, include its applicable trailer exactly once:

```text
Co-authored-by: Codex <noreply@openai.com>
Co-authored-by: Claude <noreply@anthropic.com>
```

Do not add attribution for an agent that did not materially contribute.

## Pull requests

- Open a draft pull request while meaningful work is in progress.
- Keep the pull request focused on its ticket.
- Include `Closes #<issue-number>` in the body.
- Explain the change and list verification performed.
- Run `/code-review main` before marking the pull request ready.
- Squash-merge after review and checks pass, then delete the branch.

Trivial repository setup or documentation corrections may go directly to `main`; product work should use a pull request.
