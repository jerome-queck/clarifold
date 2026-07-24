## Agent skills

### Issue tracker

GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context. See `docs/agents/domain.md`.

## Engineering workflow

For tracked product engineering work, read [`docs/agents/engineering-workflow.md`](docs/agents/engineering-workflow.md) before selecting a flow or changing code. It owns the repository-specific routing, issue-entry, review, and skill-maintenance rules.

For product implementation and review, follow the repository-wide [`CODING_STANDARDS.md`](CODING_STANDARDS.md).

Automatically use only model-invocable skills when their trigger descriptions match. Never auto-invoke a skill marked `disable-model-invocation: true`; use it only when explicitly requested. When the user explicitly asks which engineering flow fits, use `/ask-matt`.

## Commit attribution

When an AI agent materially contributes, disclose it with neutral `Assisted-by` provenance. The human maintainer or approved collaborator remains the commit author and accountable reviewer.

For Codex, use the current model display name and an authentic `CODEX_THREAD_ID` when one is available:

```text
Assisted-by: Codex <model>
Codex-Session: codex://threads/<CODEX_THREAD_ID>
```

Never invent or duplicate a session identifier. A session reference is an audit aid, not evidence that generated output is correct, secure, original, or legally safe.

See [CONTRIBUTING.md — AI attribution](CONTRIBUTING.md#ai-attribution) for the canonical repository-wide commit-attribution rules.

Equivalent authentic provenance may be retained for other agents, but AI systems do not receive `Co-authored-by` trailers. Human contributors remain responsible for source, dependency, security, mathematical, privacy, and documentation review.

Follow [CONTRIBUTING.md](CONTRIBUTING.md) for branches, commits, and pull requests.
