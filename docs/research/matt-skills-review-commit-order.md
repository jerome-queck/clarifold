# Matt skills: review/commit ordering

Research date: 2026-07-13. Upstream snapshot: [`391a270`](https://github.com/mattpocock/skills/tree/391a2701dd948f94f56a39f7533f8eea9a859c87).

## Conclusion

Matt's documented intent is **implement, review, then final commit**. However, the current `code-review` implementation can review only changes already committed to `HEAD`. The two skills are inconsistent. There is no upstream evidence that `implement` intentionally assumes intermediate commits. This is best classified as an unresolved wording/implementation bug, not a deliberate workflow requiring checkpoint commits.

## Evidence

1. `implement` says, in order, “use `/code-review`” and then “Commit your work to the current branch.” ([source, lines 13–15](https://github.com/mattpocock/skills/blob/391a2701dd948f94f56a39f7533f8eea9a859c87/skills/engineering/implement/SKILL.md#L13-L15))
2. `ask-matt` is more explicit: `implement` closes with review “before committing.” ([source, line 26](https://github.com/mattpocock/skills/blob/391a2701dd948f94f56a39f7533f8eea9a859c87/skills/engineering/ask-matt/SKILL.md#L26))
3. Matt added that wording in commit [`8010ddb`](https://github.com/mattpocock/skills/commit/8010ddb2bbffb6b3507bb9a142dd368d30e079e0), whose message says the build chain ends at `code-review` and that `implement` closes out with it.
4. `code-review` instead mandates `git diff <fixed-point>...HEAD`, requires that diff to be non-empty, and reads `git log <fixed-point>..HEAD`. ([source, lines 19–23](https://github.com/mattpocock/skills/blob/391a2701dd948f94f56a39f7533f8eea9a859c87/skills/engineering/code-review/SKILL.md#L19-L23))
5. Git defines `git diff A...B` as comparing the merge base with the tree at `B`; with `B=HEAD`, working-tree and staged-only changes are absent. By contrast, `git diff <commit>` compares that commit with the working tree. ([official Git documentation](https://git-scm.com/docs/git-diff#Documentation/git-diff.txt-emgitdiffemltoptionsgt--merge-baseltcommitgt--ltpathgt82308203))
6. The `code-review` description claims support for “work-in-progress changes,” but its prescribed command cannot see uncommitted WIP. ([source, line 3](https://github.com/mattpocock/skills/blob/391a2701dd948f94f56a39f7533f8eea9a859c87/skills/engineering/code-review/SKILL.md#L3))
7. Upstream issue [#511](https://github.com/mattpocock/skills/issues/511) reports this exact contradiction. It remains open with no maintainer response as of the research date.

## History

`implement`'s final “Commit your work” instruction dates to its initial addition in [`ffb2fa6`](https://github.com/mattpocock/skills/commit/ffb2fa66). Review was later promoted and linked into the build chain by [`14c13c5`](https://github.com/mattpocock/skills/commit/14c13c5bf9ec1bee9926c0c1f388534f0b9ab8e8) and [`8010ddb`](https://github.com/mattpocock/skills/commit/8010ddb2bbffb6b3507bb9a142dd368d30e079e0). The history contains no accompanying change that makes `code-review` include the working tree or tells `implement` to create a checkpoint commit.

## Inference and practical interpretation

**Inference:** “Before committing” is the strongest statement of intended order because Matt added it deliberately while threading review through the full flow. The fixed-point review command appears inherited from branch/PR review and was not adapted for `implement`'s pre-commit use.

Until upstream resolves #511:

- Faithful to stated intent: review the full working-tree change against the merge base, e.g. `git diff $(git merge-base <fixed-point> HEAD)`, then commit after fixes.
- Faithful to the unmodified `code-review` skill: create a checkpoint commit, run review, fix findings, then amend/squash before publishing.

The first preserves Matt's explicit ordering; the second is a compatibility workaround, not a documented Matt convention.
