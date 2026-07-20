# Quick Study macOS beta

This is an evaluation beta for the supported Apple Silicon baseline. It is not a public production release and makes no causal learning-effectiveness claim.

## Supported environment

- Apple Silicon Mac with macOS 14 Sonoma or later.
- At least 16 GB memory and 12 GB free disk space for the application, local data, indexes, and the bundled verifier.
- Network access and a supported Codex authentication path are needed for model-backed teaching. ChatGPT sign-in and OpenAI API-key sign-in are owned by Codex; Quick Study does not store either credential.
- Local Working Mode, Linked Sources, Session Records, annotations, search, artifacts, export, and installed Lean checks remain usable without Codex access.

The automated release lane runs on GitHub's `macos-14` runner with Node 24. The final local installed-artifact audit records the exact Mac, OS, candidate commit, archive digest, and operational measurements with the release evidence described in [`evaluation/README.md`](../evaluation/README.md).

The candidate quality report and its complete, non-private evidence are bundled under ignored `out/release/macos-beta-<version>/` only after `quality:gate:beta` passes. That bundle is attached to a GitHub prerelease whose tag targets the exact attested candidate commit, so publishing evidence does not change the candidate it describes. The deterministic harness fixture is uploaded separately by CI as `quality-gate-harness-fixture-only`; it is never included in or presented as the candidate report.

## Build, install, and validate

Use Node 24 from a clean checkout:

```sh
npm ci
npm run verify
```

`npm run verify` builds and ad-hoc signs the architecture-native application, creates `out/make/zip/darwin/<arch>/Quick Study-darwin-<arch>-0.1.0.zip`, extracts that artifact into an isolated installation directory, verifies its signature and bundled Lean payload, then runs the critical journeys against the extracted application rather than the Forge package directory.

After collecting the live model, blinded evaluator, and deterministic recovery evidence described in `evaluation/README.md`, run the candidate gate and publish its durable report with the same evidence paths:

```sh
QUICK_STUDY_MODEL_EVIDENCE=/absolute/path/to/model-responses.json \
QUICK_STUDY_EVALUATOR_VERDICTS=/absolute/path/to/blinded-verdicts.json \
QUICK_STUDY_RECOVERY_EVIDENCE=/absolute/path/to/recovery-verdicts.json \
npm run quality:gate:beta

QUICK_STUDY_MODEL_EVIDENCE=/absolute/path/to/model-responses.json \
QUICK_STUDY_EVALUATOR_VERDICTS=/absolute/path/to/blinded-verdicts.json \
QUICK_STUDY_RECOVERY_EVIDENCE=/absolute/path/to/recovery-verdicts.json \
npm run quality:bundle:beta
```

`quality:bundle:beta` refuses dirty candidates, non-passing reports, mismatched candidate commits, or missing evidence. Its ignored output contains the human and JSON reports, assembled evidence, installed-beta measurements, both blinded verdicts, deterministic recovery evidence, model responses, and a SHA-256 manifest. Publish it without changing the attested commit:

```sh
CANDIDATE_COMMIT=$(git rev-parse HEAD)
gh release create "macos-beta-0.1.0-candidate-${CANDIDATE_COMMIT:0:12}" \
  --target "$CANDIDATE_COMMIT" --prerelease \
  --title "Quick Study macOS beta 0.1.0 candidate ${CANDIDATE_COMMIT:0:12}" \
  --notes "Candidate quality report and reproducible non-private evidence for issue #37." \
  "out/make/zip/darwin/arm64/Quick Study-darwin-arm64-0.1.0.zip" \
  out/release/macos-beta-0.1.0/*
```

The release manifest binds the uploaded architecture-native ZIP to the digest validated by the installed-app lane, and the prerelease tag keeps the exact evaluated commit reachable after squash merge. Record its URL in the pull request and release handoff. CI also retains the ZIP as the separately named `quick-study-macos-beta-<arch>` artifact; the harness-only report remains separately named and cannot be mistaken for candidate evidence.

For an evaluation install, unzip the archive and copy `Quick Study.app` to `/Applications` or another local Applications folder. The current archive is ad-hoc signed but not Developer ID signed or notarized. It is therefore suitable for local and CI evaluation, not public internet distribution; do not bypass organizational Gatekeeper policy to install it. Developer ID signing, notarization, and a post-notarization rerun are required before calling any artifact a public beta.

## Privacy and source access defaults

- Application state stays in the local Electron `userData` directory.
- Linked Sources remain at their original locations. Study, indexing, export, and verification do not silently copy, replace, or modify them.
- The ad-hoc evaluation build is not App-Sandboxed. Its last-known path is location metadata, not persistent permission. It does not claim the security-scoped persistence of a provisioned Mac App Store build.
- Model access, external research, and Source Excerpt Egress are separate boundaries. Personal Notes remain excluded from ordinary teaching; optional artifact synthesis is the only governed exception.
- The source-safety smoke assertions compare the original Linked Source bytes after indexing, relocation recovery, snapshot creation, teaching, formal verification, artifact synthesis, export, quit, and relaunch.

## Recovery

- If Codex, authentication, quota, or network access is unavailable, use Local Working Mode and save Pending Questions for explicit later submission.
- If a Linked Source is missing or moved, use Retry or Locate again. Quick Study retains its identity and associations and does not reconstruct unavailable content from an index or fingerprint.
- If Lean installation or removal is interrupted, use the visible retry or cleanup action. Historical Verifier Manifests and proof evidence remain intact.
- If Quick Study quits with unfinished Agent Tasks, reopen the app and explicitly resume the checkpoint. Relaunch never resumes model spending automatically.
- Back up the local application-data directory before destructive machine repair. Linked Sources require their own normal backup because Quick Study does not own or duplicate them.

## Known limitations

- macOS only; Windows, Linux, mobile, and web are not supported.
- Apple Silicon is the validated beta baseline. Intel and universal archives are not claimed.
- The evaluation archive is not notarized and has no automatic updater.
- The non-App-Sandbox evaluation build cannot demonstrate production security-scoped bookmark persistence.
- Formal verification covers only exact app-supported statements in the recorded Lean environment. Checker failure is not mathematical disproof, and model or source agreement is not formal verification.
- The quality-gate fixture proves the harness only. A candidate needs separately collected release evidence for every benchmark and operational budget; missing evidence fails the gate.
- No causal learning benefit is claimed without a separately governed comparative study.

## Feedback

Report beta feedback through [GitHub Issues](https://github.com/jerome-queck/openai-build-week/issues/new). Do not attach learner records, source documents, credentials, Personal Notes, or other private data. Include the beta version, macOS version, Mac model, action attempted, visible error, and whether recovery succeeded.
