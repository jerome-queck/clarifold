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

See [CONTRIBUTING.md — AI attribution](CONTRIBUTING.md#ai-attribution) for the canonical AI-assisted commit attribution policy.

Follow [CONTRIBUTING.md](CONTRIBUTING.md) for branches, commits, and pull requests.
