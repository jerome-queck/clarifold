# Public repository history audit — 2026-07-24

Issue #90 requires a full-history check before the repository governance migration is merged. This public receipt records only disclosure-safe results; it does not reproduce secret-scan matches or private learner material.

## Result

The tracked repository history has no confirmed credential, private learner record, or sensitive generated artifact requiring rotation or history rewriting. Existing commit history remains intact. The historical maintainer identity is mapped through [`.mailmap`](../../.mailmap), so future attribution can use the canonical Jerome Group address without pretending that old commits were rewritten.

## Evidence

- `npm run security:secrets` passed with the pinned Gitleaks release and reported no leaks while scanning the complete reachable Git history.
- `git rev-list --objects --all` with `git cat-file` found no unusually large generated or packaged object. The largest reachable blob was an approximately 560 KB historical TypeScript source revision; the repository contains no reachable learner-data archive or packaged application artifact.
- The contributor-identity audit found Jerome's historical NTU address in older commits and the canonical Jerome Group address in newer attribution, plus one Dependabot bot identity. No unexplained contributor identity was found.
- `git count-objects -vH` reported no garbage objects. This checkout also contains local Codex workspace refs and a machine-generated `.git/refs/.DS_Store` entry; those are outside tracked and pushed repository history and are not treated as repository content.

## Revalidation rule

A future confirmed credential or private learner-data exposure must be handled privately: revoke or rotate first, assess downstream copies, and rewrite history only if that materially reduces continuing exposure. Cosmetic naming, governance, or attribution cleanup is not a reason to invalidate public commit identifiers.
