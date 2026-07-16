# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments` then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either — resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Picking up implementation work

Inspect the full issue before claiming it:

```sh
gh issue view <number> --comments \
  --json number,title,body,state,labels,assignees,comments,url,blockedBy,parent,subIssues
```

Summarize the native relationships before claiming:

```sh
gh issue view <number> --json blockedBy,parent,subIssues --jq '{
  openBlockers: [.blockedBy.nodes[] | select(.state == "OPEN") | {number, title}],
  parent: .parent,
  openChildren: [.subIssues.nodes[] | select(.state == "OPEN") | {number, title}]
}'
```

For autonomous pickup, an implementation issue is available only when it is open, has the `ready-for-agent` label, has no assignee, and `openBlockers` is empty. Where native dependencies are unavailable, inspect every issue in the fallback `Blocked by: #<n>, #<n>` line and require all of them to be closed. If the user explicitly asks to resume an assigned issue, verify that its assignment and active branch belong to the intended driver rather than treating it as new work.

If the issue has implementation sub-issues, treat it as a parent planning issue rather than an implementation unit. Select an unblocked child while any remain open; when all are closed, use the parent-completion procedure instead. Claim the selected issue as the first write, then confirm the resulting assignment:

```sh
gh issue edit <number> --add-assignee @me
gh issue view <number> --json assignees --jq '.assignees[].login'
```

Treat assignment as a coordination signal, not an atomic lock. Sessions can race, and multiple agents may use the same GitHub identity. Check the active task/branch coordination after assignment and stop if someone else is already implementing the issue. Only one implementer works an issue at a time.

If work must be abandoned, leave a concise blocker or handoff comment and release the assignment:

```sh
gh issue comment <number> --body "Blocked/handoff: <state, evidence, and next step>"
gh issue edit <number> --remove-assignee @me
```

After the final child is merged and the parent acceptance criteria have been verified on `main`, record the integrated verification and close the parent explicitly:

```sh
gh issue comment <parent-number> --body "Integrated verification: <commands and results>"
gh issue close <parent-number>
```

## Wayfinding operations (not enabled)

`/wayfinder` is optional and is not enabled for the repository's default flow. Do not create its labels or use these operations unless the user explicitly opts in. The details below are retained so the advanced flow can be enabled deliberately.

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api` on the sub-issues endpoint). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies** — the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). Read the edge with `gh issue view <child> --json blockedBy`; any member of `blockedBy.nodes` whose state is `OPEN` is a live blocker. Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker in `blockedBy.nodes` (or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me` — the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
