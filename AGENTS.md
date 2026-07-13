## Agent skills

### Issue tracker

GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context. See `docs/agents/domain.md`.

## Commit attribution

When materially involved, ensure the commit message includes each applicable agent's model-specific co-author and session trailers exactly once.

For Codex, use the current model display name and `CODEX_THREAD_ID`:

```text
Co-authored-by: Codex <model> <noreply@openai.com>
Codex-Session: codex://threads/<CODEX_THREAD_ID>
```

For Claude, preserve Claude Code's generated model-specific `Co-authored-by` and `Claude-Session` trailers. Never invent a session identifier or duplicate an automatic trailer.

Follow `CONTRIBUTING.md` for branches, commits, and pull requests.

Automatically use only model-invocable skills when their trigger descriptions match. Never auto-invoke a skill marked `disable-model-invocation: true`; use it only when explicitly requested. When the user explicitly asks which flow fits, use `/ask-matt`.
