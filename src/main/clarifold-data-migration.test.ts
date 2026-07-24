// @vitest-environment node

import { appendFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ModelRuntime } from "../shared/model-runtime";
import { LearningApplication, type LocalSourceAccess } from "../shared/learning-application";
import {
  migrateQuickStudyData,
  migrationStatusForStage,
  migrationStatusFor,
  type MigrationStage
} from "./clarifold-data-migration";

describe("Clarifold data migration", () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
  });

  it("reports that no migration is needed when the old default is absent", async () => {
    const root = await temporaryDirectory("clarifold-migration-absent-");
    const result = await migrateQuickStudyData({
      sourceDirectory: join(root, "Quick Study"),
      destinationDirectory: join(root, "Clarifold"),
      applicationVersion: "0.2.0"
    });

    expect(result.outcome).toBe("not-needed");
    expect(result.stages).toEqual(["discovery", "preflight", "complete"]);
  });

  it("copies valid learner state through staging, leaves the source intact, and records a safe receipt", async () => {
    const root = await temporaryDirectory("clarifold-migration-success-");
    const sourceDirectory = join(root, "Quick Study");
    const destinationDirectory = join(root, "Clarifold");
    await createLearnerState(sourceDirectory);
    await writeFile(join(sourceDirectory, "rollback-marker.txt"), "retain me\n", "utf8");
    await mkdir(destinationDirectory, { recursive: true });
    const sourceState = await readFile(join(sourceDirectory, "learning-application.json"), "utf8");
    const durableState = JSON.parse(sourceState) as Record<string, unknown>;

    const result = await migrateQuickStudyData({
      sourceDirectory,
      destinationDirectory,
      applicationVersion: "0.2.0",
      now: () => new Date("2026-07-24T01:02:03.000Z")
    });

    expect(result.outcome).toBe("migrated");
    expect(result.stages).toEqual<MigrationStage[]>([
      "discovery", "preflight", "staging-copy", "verification", "atomic-commit", "complete"
    ]);
    expect(await readFile(join(destinationDirectory, "learning-application.json"), "utf8")).toBe(sourceState);
    expect(JSON.parse(await readFile(join(destinationDirectory, "learning-application.json"), "utf8"))).toEqual(durableState);
    expect(durableState).toMatchObject({
      sessions: expect.arrayContaining([expect.objectContaining({ trailDraft: { items: expect.any(Array) } })]),
      sourceIndexes: expect.any(Array),
      verifierManifests: expect.any(Array),
      verifierEnvironment: expect.objectContaining({ environments: expect.any(Array) }),
      learnerModel: expect.objectContaining({ entries: expect.any(Array) })
    });
    expect(await readFile(join(sourceDirectory, "learning-application.json"), "utf8")).toBe(sourceState);
    expect(await readFile(join(sourceDirectory, "rollback-marker.txt"), "utf8")).toBe("retain me\n");
    const durableSession = (durableState.sessions as Array<Record<string, any>>)[1];
    const migratedApplication = await LearningApplication.launch(destinationDirectory);
    expect(migratedApplication.getState().sessions[1].learningArtifacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: durableSession.learningArtifacts[0].id })
    ]));
    expect(migratedApplication.getState().sessions[1].trailDraft.items).toEqual(durableSession.trailDraft.items);
    expect(migratedApplication.getState().sessions[1].understandingEvidence).toEqual(durableSession.understandingEvidence);
    expect(migratedApplication.getState().learnerModel.entries).toEqual(
      (durableState.learnerModel as { entries: unknown[] }).entries
    );
    expect(migratedApplication.getState().verifierManifests).toEqual(durableState.verifierManifests);
    expect(migratedApplication.getState().verifierEnvironment.environments.map((entry) => entry.environment.id))
      .toEqual(expect.arrayContaining(
        (durableState.verifierEnvironment as { environments: Array<{ environment: { id: string } }> }).environments
          .map((entry) => entry.environment.id)
      ));
    expect(await readFile(join(destinationDirectory, "verifier-evidence", "durable-verifier-manifest.lean"), "utf8"))
      .toBe("theorem durable_fixture : True := by trivial\n");
    expect(JSON.parse(await readFile(join(destinationDirectory, "migration-receipt.json"), "utf8"))).toEqual({
      schemaVersion: 1,
      source: sourceDirectory,
      destination: destinationDirectory,
      applicationVersion: "0.2.0",
      startedAt: "2026-07-24T01:02:03.000Z",
      completedAt: "2026-07-24T01:02:03.000Z",
      outcome: "migrated",
      retryState: "idempotent"
    });
    expect(await readdir(dirname(destinationDirectory))).not.toContain("Clarifold.migration-staging");
  });

  it("is idempotent after activation and does not copy the preserved source again", async () => {
    const root = await temporaryDirectory("clarifold-migration-retry-");
    const sourceDirectory = join(root, "Quick Study");
    const destinationDirectory = join(root, "Clarifold");
    await createLearnerState(sourceDirectory);
    await expect(migrateQuickStudyData({ sourceDirectory, destinationDirectory, applicationVersion: "0.2.0" }))
      .resolves.toMatchObject({ outcome: "migrated" });
    const receipt = await readFile(join(destinationDirectory, "migration-receipt.json"), "utf8");

    await expect(migrateQuickStudyData({ sourceDirectory, destinationDirectory, applicationVersion: "0.2.0" }))
      .resolves.toMatchObject({ outcome: "already-migrated" });
    expect(await readFile(join(destinationDirectory, "migration-receipt.json"), "utf8")).toBe(receipt);
  });

  it("blocks a meaningful destination instead of overwriting or merging it", async () => {
    const root = await temporaryDirectory("clarifold-migration-conflict-");
    const sourceDirectory = join(root, "Quick Study");
    const destinationDirectory = join(root, "Clarifold");
    await createLearnerState(sourceDirectory);
    await mkdir(destinationDirectory, { recursive: true });
    await writeFile(join(destinationDirectory, "local-history.txt"), "keep destination\n", "utf8");
    const sourceState = await readFile(join(sourceDirectory, "learning-application.json"), "utf8");

    const result = await migrateQuickStudyData({ sourceDirectory, destinationDirectory, applicationVersion: "0.2.0" });
    expect(result).toMatchObject({ outcome: "blocked", reason: "destination-conflict" });
    expect(migrationStatusFor(result)).toMatchObject({ retryState: "manual-intervention-required" });
    expect(await readFile(join(sourceDirectory, "learning-application.json"), "utf8")).toBe(sourceState);
    expect(await readFile(join(destinationDirectory, "local-history.txt"), "utf8")).toBe("keep destination\n");
  });

  it("redacts filesystem details from renderer-facing migration status", () => {
    const status = migrationStatusFor({
      outcome: "failed",
      stages: ["discovery", "preflight", "staging-copy", "recovery", "complete"],
      reason: "copy-failed",
      message: "Could not copy /Users/learner/Library/Application Support/Quick Study/learning-application.json"
    });

    expect(status.message).toBe("Clarifold could not stage the old learner data safely; the source was left unchanged.");
    expect(status.message).not.toContain("/Users/");
  });

  it("cleans its own failed staging output and exposes recovery without touching the source", async () => {
    const root = await temporaryDirectory("clarifold-migration-failure-");
    const sourceDirectory = join(root, "Quick Study");
    const destinationDirectory = join(root, "Clarifold");
    await createLearnerState(sourceDirectory);
    const result = await migrateQuickStudyData({
      sourceDirectory,
      destinationDirectory,
      applicationVersion: "0.2.0",
      getFreeSpaceBytes: async () => 0
    });

    expect(result).toMatchObject({ outcome: "failed", reason: "insufficient-space" });
    expect(result.stages).toContain("recovery");
    expect(JSON.parse(await readFile(`${destinationDirectory}.migration-recovery.json`, "utf8"))).toMatchObject({
      outcome: "failed", reason: "insufficient-space", retryState: "safe-to-retry"
    });
    await expect(readFile(join(sourceDirectory, "learning-application.json"))).resolves.toBeTruthy();
    await expect(readdir(destinationDirectory)).rejects.toMatchObject({ code: "ENOENT" });

    const retry = await migrateQuickStudyData({ sourceDirectory, destinationDirectory, applicationVersion: "0.2.0" });
    expect(retry.outcome).toBe("migrated");
    await expect(readFile(`${destinationDirectory}.migration-recovery.json`, "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(join(sourceDirectory, "learning-application.json"))).resolves.toBeTruthy();
  });

  it("exposes a renderer-safe in-progress status for every migration stage", () => {
    expect(migrationStatusForStage(["discovery", "staging-copy"])).toEqual({
      outcome: "migrating",
      stages: ["discovery", "staging-copy"],
      message: "Clarifold is safely staging the old Quick Study learner data."
    });
  });

  it("rejects an incomplete source before any staging copy", async () => {
    const root = await temporaryDirectory("clarifold-migration-incomplete-");
    const sourceDirectory = join(root, "Quick Study");
    const destinationDirectory = join(root, "Clarifold");
    await mkdir(sourceDirectory, { recursive: true });
    await writeFile(join(sourceDirectory, "partial-copy.txt"), "partial\n", "utf8");

    await expect(migrateQuickStudyData({ sourceDirectory, destinationDirectory, applicationVersion: "0.2.0" }))
      .resolves.toMatchObject({ outcome: "blocked", reason: "source-incomplete" });
    await expect(readdir(destinationDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("recovers an abandoned lock owned by a dead process", async () => {
    const root = await temporaryDirectory("clarifold-migration-stale-lock-");
    const sourceDirectory = join(root, "Quick Study");
    const destinationDirectory = join(root, "Clarifold");
    await createLearnerState(sourceDirectory);
    const lockDirectory = `${destinationDirectory}.migration-lock`;
    await writeFile(lockDirectory, JSON.stringify({ pid: 999_999_999, token: "stale-lock" }), "utf8");

    await expect(migrateQuickStudyData({ sourceDirectory, destinationDirectory, applicationVersion: "0.2.0" }))
      .resolves.toMatchObject({ outcome: "migrated" });
  });

  it("serializes concurrent reclamation of an abandoned lock", async () => {
    const root = await temporaryDirectory("clarifold-migration-stale-lock-race-");
    const sourceDirectory = join(root, "Quick Study");
    const destinationDirectory = join(root, "Clarifold");
    await createLearnerState(sourceDirectory);
    await writeFile(`${destinationDirectory}.migration-lock`, JSON.stringify({ pid: 999_999_999, token: "stale-lock" }), "utf8");

    const results = await Promise.all([
      migrateQuickStudyData({ sourceDirectory, destinationDirectory, applicationVersion: "0.2.0" }),
      migrateQuickStudyData({ sourceDirectory, destinationDirectory, applicationVersion: "0.2.0" })
    ]);
    expect(results.filter((result) => result.outcome === "migrated")).toHaveLength(1);
    expect(results.filter((result) => result.reason === "concurrent-launch")).toHaveLength(1);
  });

  it("recovers an abandoned stale-lock reclaimer guard", async () => {
    const root = await temporaryDirectory("clarifold-migration-stale-reclaimer-");
    const sourceDirectory = join(root, "Quick Study");
    const destinationDirectory = join(root, "Clarifold");
    await createLearnerState(sourceDirectory);
    const staleOwner = JSON.stringify({ pid: 999_999_999, token: "stale-lock" });
    await writeFile(`${destinationDirectory}.migration-lock`, staleOwner, "utf8");
    await writeFile(`${destinationDirectory}.migration-lock.reclaim`, staleOwner, "utf8");

    await expect(migrateQuickStudyData({ sourceDirectory, destinationDirectory, applicationVersion: "0.2.0" }))
      .resolves.toMatchObject({ outcome: "migrated" });
  });

  it("does not delete staging output without its Clarifold ownership marker", async () => {
    const root = await temporaryDirectory("clarifold-migration-staging-collision-");
    const sourceDirectory = join(root, "Quick Study");
    const destinationDirectory = join(root, "Clarifold");
    await createLearnerState(sourceDirectory);
    const stagingDirectory = `${destinationDirectory}.migration-staging`;
    await mkdir(stagingDirectory, { recursive: true });
    await writeFile(join(stagingDirectory, "unrelated.txt"), "leave me\n", "utf8");

    await expect(migrateQuickStudyData({ sourceDirectory, destinationDirectory, applicationVersion: "0.2.0" }))
      .resolves.toMatchObject({ outcome: "failed", reason: "staging-collision" });
    await expect(readFile(join(stagingDirectory, "unrelated.txt"), "utf8")).resolves.toBe("leave me\n");
  });

  it("blocks concurrent launches while the first launch owns the guard", async () => {
    const root = await temporaryDirectory("clarifold-migration-concurrent-");
    const sourceDirectory = join(root, "Quick Study");
    const destinationDirectory = join(root, "Clarifold");
    await createLearnerState(sourceDirectory);
    let releaseValidation!: () => void;
    let signalValidationStarted!: () => void;
    const validationStarted = new Promise<void>((resolve) => { signalValidationStarted = resolve; });
    const validationRelease = new Promise<void>((resolve) => { releaseValidation = resolve; });
    const first = migrateQuickStudyData({
      sourceDirectory,
      destinationDirectory,
      applicationVersion: "0.2.0",
      onStage: (stage) => { if (stage === "verification") signalValidationStarted(); },
      validateStagedDirectory: async () => validationRelease
    });
    await validationStarted;
    await expect(migrateQuickStudyData({ sourceDirectory, destinationDirectory, applicationVersion: "0.2.0" }))
      .resolves.toMatchObject({ outcome: "blocked", reason: "concurrent-launch" });
    releaseValidation();
    await expect(first).resolves.toMatchObject({ outcome: "migrated" });
  });

  it("preserves a resumable session and Linked Source references for rollback", async () => {
    const root = await temporaryDirectory("clarifold-migration-preservation-");
    const sourceDirectory = join(root, "Quick Study");
    const destinationDirectory = join(root, "Clarifold");
    const linkedSourcePath = join(root, "externally-owned-notes.txt");
    await writeFile(linkedSourcePath, "externally owned\n", "utf8");
    await mkdir(sourceDirectory, { recursive: true });
    const application = await LearningApplication.launch(sourceDirectory);
    await application.submit({ type: "startQuickStudy", mathematics: "Study compactness." });
    await application.linkExternalAttachment(application.getState().quickStudy.workspace.id, {
      name: "externally-owned-notes.txt",
      resourceType: "file",
      lastKnownPath: linkedSourcePath,
      canonicalPath: linkedSourcePath,
      accessGrant: null,
      fingerprint: { size: 17, modifiedAtMs: 1 }
    });
    const sourceState = JSON.parse(await readFile(join(sourceDirectory, "learning-application.json"), "utf8")) as {
      sessions: Array<{ learningGoal: string }>;
      sources: Array<{ kind: string; link?: { canonicalPath: string } }>;
    };
    const sourceSnapshot = await readFile(join(sourceDirectory, "learning-application.json"), "utf8");

    await expect(migrateQuickStudyData({ sourceDirectory, destinationDirectory, applicationVersion: "0.2.0" }))
      .resolves.toMatchObject({ outcome: "migrated" });
    const migrated = await LearningApplication.launch(destinationDirectory);
    const rolledBack = await LearningApplication.launch(sourceDirectory);
    expect(migrated.getState().sessions.map((session) => session.learningGoal)).toEqual(
      sourceState.sessions.map((session) => session.learningGoal)
    );
    expect(migrated.getState().sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "linkedSource", link: expect.objectContaining({ canonicalPath: linkedSourcePath }) })
    ]));
    expect(rolledBack.getState().sessions).toHaveLength(sourceState.sessions.length);
    expect(await readFile(join(sourceDirectory, "learning-application.json"), "utf8")).toBe(sourceSnapshot);
    expect(await readFile(linkedSourcePath, "utf8")).toBe("externally owned\n");
    await expect(readFile(join(destinationDirectory, "externally-owned-notes.txt"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves Source Anchors and Personal Notes through migration and relaunch", async () => {
    const root = await temporaryDirectory("clarifold-migration-durable-records-");
    const sourceDirectory = join(root, "Quick Study");
    const destinationDirectory = join(root, "Clarifold");
    const application = await LearningApplication.launch(sourceDirectory);
    let sourceState = await application.submit({ type: "startQuickStudy", mathematics: "Every compact subset is closed." });
    const sourceId = sourceState.sessions[0].sourceIds[0];
    sourceState = await application.submit({
      type: "createSourceAnchor",
      sourceId,
      selection: {
        kind: "text",
        startOffset: 6,
        endOffset: 20,
        exactText: "compact subset",
        prefix: "Every ",
        suffix: " is closed."
      },
      paletteAction: "addNote"
    });
    const anchorId = sourceState.sessions[0].sourceAnchors[0].id;
    sourceState = await application.submit({
      type: "createAnnotation",
      sourceAnchorId: anchorId,
      purpose: "personalNote",
      content: "The finite-subcover step is the key bridge."
    });
    const sourceBytes = await readFile(join(sourceDirectory, "learning-application.json"), "utf8");

    await expect(migrateQuickStudyData({ sourceDirectory, destinationDirectory, applicationVersion: "0.2.0" }))
      .resolves.toMatchObject({ outcome: "migrated" });

    const migrated = await LearningApplication.launch(destinationDirectory);
    const migratedState = migrated.getState();
    expect(migratedState.sessions[0].sourceAnchors).toEqual(sourceState.sessions[0].sourceAnchors);
    expect(migratedState.sessions[0].annotations).toEqual(sourceState.sessions[0].annotations);
    expect(migratedState.sessions[0].sourceIds).toEqual(sourceState.sessions[0].sourceIds);
    expect(await readFile(join(sourceDirectory, "learning-application.json"), "utf8")).toBe(sourceBytes);

    const relaunched = await LearningApplication.launch(destinationDirectory);
    expect(relaunched.getState().sessions[0].annotations).toEqual(sourceState.sessions[0].annotations);
    expect(relaunched.getState().sessions[0].sourceAnchors).toEqual(sourceState.sessions[0].sourceAnchors);
  });

  it("revalidates a missing Linked Source in staging while preserving its path and Source Index state", async () => {
    const root = await temporaryDirectory("clarifold-migration-source-revalidation-");
    const sourceDirectory = join(root, "Quick Study");
    const destinationDirectory = join(root, "Clarifold");
    const linkedSourcePath = join(root, "externally-owned-notes.txt");
    const fingerprint = { size: 34, modifiedAtMs: 1 };
    const sourceAccess: LocalSourceAccess & { missing: boolean } = {
      missing: false,
      read: async (source) => {
        if (sourceAccess.missing) throw new Error("The source is missing or access is no longer available.");
        return {
          sourceId: source.id,
          resourceType: "file",
          content: "Every compact subset is closed.",
          mediaType: "text/plain",
          fingerprint
        };
      },
      extractForIndex: async (source) => ({
        extractionMethod: "embeddedText",
        fingerprint,
        pages: [{
          pageNumber: 1,
          width: 1000,
          height: 1400,
          thumbnailDataUrl: "data:image/png;base64,c21hbGw=",
          regions: [{
            kind: "text",
            text: "Every compact subset is closed.",
            bounds: { x: 0.1, y: 0.1, width: 0.8, height: 0.05 },
            sourceStartOffset: 0,
            sourceEndOffset: 32
          }]
        }]
      }),
      snapshot: async () => ({
        mediaType: "text/plain",
        contentBase64: Buffer.from("Every compact subset is closed.").toString("base64"),
        fingerprint
      })
    };
    await writeFile(linkedSourcePath, "Every compact subset is closed.\n", "utf8");
    const application = await LearningApplication.launch(sourceDirectory, null, sourceAccess);
    let sourceState = await application.linkExternalAttachment(application.getState().quickStudy.workspace.id, {
      name: "externally-owned-notes.txt",
      resourceType: "file",
      lastKnownPath: linkedSourcePath,
      canonicalPath: linkedSourcePath,
      accessGrant: null,
      fingerprint
    });
    const sourceId = sourceState.sources.find((source) => source.kind === "linkedSource")!.id;
    sourceState = await application.submit({ type: "startQuickStudy", mathematics: "Study compactness." });
    await application.submit({ type: "addSourceToSession", sourceId });
    await application.indexSource(sourceId);
    sourceState = await application.submit({
      type: "createSourceAnchor",
      sourceId,
      selection: { kind: "text", startOffset: 0, endOffset: 13, exactText: "Every compact", prefix: "", suffix: " subset is closed." },
      paletteAction: "addNote"
    });
    await application.submit({
      type: "createAnnotation",
      sourceAnchorId: sourceState.sessions[0].sourceAnchors[0].id,
      purpose: "personalNote",
      content: "Check the finite subcover argument."
    });
    sourceAccess.missing = true;
    await expect(migrateQuickStudyData({ sourceDirectory, destinationDirectory, applicationVersion: "0.2.0", sourceAccess }))
      .resolves.toMatchObject({ outcome: "migrated" });

    const migrated = await LearningApplication.launch(destinationDirectory);
    const linked = migrated.getState().sources.find((source) => source.kind === "linkedSource");
    expect(linked).toMatchObject({
      kind: "linkedSource",
      link: { canonicalPath: linkedSourcePath, accessStatus: "unavailable" }
    });
    expect(migrated.getState().sourceIndexes).toContainEqual(expect.objectContaining({ sourceId, status: "ready" }));
    expect(migrated.getState().sessions[0].annotations).toEqual(expect.arrayContaining([
      expect.objectContaining({ content: "Check the finite subcover argument." })
    ]));
  });

  it("fails safely when the legacy source changes during staging", async () => {
    const root = await temporaryDirectory("clarifold-migration-source-change-");
    const sourceDirectory = join(root, "Quick Study");
    const destinationDirectory = join(root, "Clarifold");
    await createLearnerState(sourceDirectory);

    await expect(migrateQuickStudyData({
      sourceDirectory,
      destinationDirectory,
      applicationVersion: "0.2.0",
      validateStagedDirectory: async () => {
        await appendFile(join(sourceDirectory, "learning-application.json"), "\n", "utf8");
      }
    })).resolves.toMatchObject({ outcome: "failed", reason: "copy-failed" });
    await expect(readdir(destinationDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  });

  async function temporaryDirectory(prefix: string): Promise<string> {
    const path = await mkdtemp(join(tmpdir(), prefix));
    temporaryDirectories.push(path);
    return path;
  }

  async function createLearnerState(path: string): Promise<void> {
    await mkdir(path, { recursive: true });
    const runtime = migrationRuntime();
    const application = await LearningApplication.launch(path, runtime);
    await application.submit({ type: "createWorkspace", name: "Topology" });
    await application.submit({ type: "startQuickStudy", mathematics: "Study compactness." });
    await application.submit({ type: "addTrailItem", kind: "concept", content: "Compactness supplies a finite subcover." });
    let state = await application.submit({
      type: "submitSessionIntake", mathematics: "Every compact subset of a Hausdorff space is closed."
    });
    await application.waitForModelWork();
    const activeSession = state.sessions.find((session) => session.id === state.activeSessionId)!;
    state = await application.submit({
      type: "createSourceAnchor",
      sourceId: activeSession.sourceIds[0],
      selection: {
        kind: "text", startOffset: 0, endOffset: 13, exactText: "Every compact", prefix: "", suffix: " subset of a Hausdorff space"
      },
      paletteAction: "explain"
    });
    await application.waitForModelWork();
    state = await application.submit({
      type: "pinTeachingCardArtifact",
      cardId: state.sessions.find((session) => session.id === state.activeSessionId)!.anchoredTeachingCards[0].id
    });
    state = await application.submit({
      type: "offerUnderstandingCheck",
      kind: "explain",
      prompt: "Explain why compactness gives a finite subcover.",
      concept: "compactness",
      representation: "proofStructural"
    });
    state = await application.submit({
      type: "recordUnderstandingEvidence",
      checkId: state.sessions.find((session) => session.id === state.activeSessionId)!.understandingChecks.at(-1)!.id,
      response: "Every open cover has a finite subcover by compactness.",
      interpretation: "secureUnderstanding",
      confidence: "high"
    });
    const statePath = join(path, "learning-application.json");
    const persistedState = JSON.parse(await readFile(statePath, "utf8")) as Record<string, any>;
    const session = persistedState.sessions[1];
    const artifact = session.learningArtifacts[0];
    const artifactId = artifact.id;
    const revisionId = artifact.currentRevision.id;
    const environment = persistedState.verifierEnvironment.defaultEnvironment;
    persistedState.verifierManifests = [{
      id: "durable-verifier-manifest",
      sessionId: session.id,
      target: "learningArtifact",
      targetId: artifactId,
      claimId: "durable-claim",
      claimRevisionId: revisionId,
      exactClaim: "A compact space admits a finite subcover.",
      formalStatement: null,
      assumptions: [],
      proofSource: null,
      environment,
      command: "lean durable-artifact.lean",
      commandOutcome: "accepted",
      formalStatementVerificationLevel: "incomplete",
      diagnostics: "Fixture evidence retained for migration verification.",
      evidenceLocation: join(path, "verifier-evidence", "durable-verifier-manifest.lean"),
      createdAt: "2026-07-24T01:02:03.000Z"
    }];
    persistedState.verifierEnvironment.status = "installed";
    persistedState.verifierEnvironment.activeEnvironmentId = environment.id;
    const removableEnvironment = { ...environment, id: "durable-removable-environment", sourceArchive: "fixture-removable" };
    persistedState.verifierEnvironment.environments = [{
      environment,
      installedBytes: 123,
      pinned: true,
      manifestReferences: 1
    }, {
      environment: removableEnvironment,
      installedBytes: 456,
      pinned: false,
      manifestReferences: 0
    }];
    const evidenceDirectory = join(path, "verifier-evidence");
    await mkdir(evidenceDirectory, { recursive: true });
    await writeFile(join(evidenceDirectory, "durable-verifier-manifest.lean"), "theorem durable_fixture : True := by trivial\n", "utf8");
    await writeFile(statePath, JSON.stringify(persistedState), "utf8");
  }

  function migrationRuntime(): ModelRuntime {
    return {
      getCapabilities: async () => ({ models: [{ model: "fixture", displayName: "Fixture", isDefault: true, supportedReasoningEfforts: ["medium"] }] }),
      getAuthentication: async () => ({ status: "signedIn", method: "chatgpt", accountLabel: "fixture@example.com" }),
      startChatGptLogin: async () => ({ loginId: "fixture-login", authUrl: "https://example.test/login" }),
      loginWithApiKey: async () => undefined,
      proposeSession: async () => ({
        learningGoal: "Understand compactness",
        scope: "Explain the finite-subcover argument",
        initialTeachingDirection: "Start from the compactness definition.",
        requiresConfirmation: false,
        confirmationReason: null
      }),
      streamTeaching: async (request) => request.onDelta("Compactness reduces the open cover to finitely many members."),
      cancelTeaching: async () => undefined,
      shutdown: async () => undefined,
      createDelayedTransferTask: async () => { throw new Error("Not used by migration fixture."); },
      clarifyDelayedTransferTask: async () => { throw new Error("Not used by migration fixture."); },
      assessDelayedTransferWork: async () => { throw new Error("Not used by migration fixture."); },
      createConceptPeek: async () => { throw new Error("Not used by migration fixture."); },
      synthesizeArtifact: async () => { throw new Error("Not used by migration fixture."); },
      regenerateArtifact: async () => { throw new Error("Not used by migration fixture."); },
      recheckArtifactClaim: async () => { throw new Error("Not used by migration fixture."); },
      runSpecialistAgent: async () => { throw new Error("Not used by migration fixture."); }
    };
  }
});
