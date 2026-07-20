import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const candidateCommit = execFileSync("/usr/bin/git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (execFileSync("/usr/bin/git", ["status", "--porcelain"], { encoding: "utf8" }).trim()) {
  throw new Error("Release recovery evidence requires a clean, committed candidate worktree.");
}
const beta = JSON.parse(await readFile(join(root, "test-results", "beta-install.json"), "utf8"));
if (beta.candidateCommit !== candidateCommit) {
  throw new Error("Installed recovery evidence must target the exact current commit.");
}
const outputDirectory = join(root, "test-results", "release-evidence");
const rawPath = join(outputDirectory, "recovery-vitest.json");
await mkdir(outputDirectory, { recursive: true });
execFileSync(process.execPath, [
  join(root, "node_modules", "vitest", "vitest.mjs"), "run", "--reporter=json", `--outputFile=${rawPath}`
], { cwd: root, stdio: "inherit" });
const raw = JSON.parse(await readFile(rawPath, "utf8"));
if (!raw.success) throw new Error("The deterministic recovery suite did not pass.");
const recoveryPolicyPath = join(root, "evaluation", "benchmarks", "v2", "recovery-evidence.json");
const recoveryPolicyContent = await readFile(recoveryPolicyPath);
const recoveryPolicy = JSON.parse(recoveryPolicyContent.toString("utf8"));
const assertions = new Map(raw.testResults.flatMap((result) => result.assertionResults)
  .map((assertion) => [assertion.title, assertion]));
const collectorDefinitions = [
  { scenarioId: "recovery-runtime-loss", initialCondition: {
    kind: "runtime-unavailable",
    evidenceTitle: "launches into an honest authentication failure instead of hanging when Codex is unavailable"
  }, testTitles: [
    "launches into an honest authentication failure instead of hanging when Codex is unavailable",
    "surfaces honest runtime failures and retries the same Teaching Card"
  ], installedValidations: ["installed-critical-journeys"], failureBlocker: "unrecoverable-work" },
  { scenarioId: "recovery-interrupted-agent-work", initialCondition: {
    kind: "unfinished-agent-work-at-quit",
    evidenceTitle: "checkpoints an unfinished Agent Task on quit and resumes it only after an explicit learner action"
  }, testTitles: [
    "checkpoints an unfinished Agent Task on quit and resumes it only after an explicit learner action"
  ], installedValidations: ["agent-recovery-journeys"], failureBlocker: "unrecoverable-work" },
  { scenarioId: "recovery-stale-source", initialCondition: {
    kind: "linked-source-revision-changed",
    evidenceTitle: "creates a visible Source Revision, rebuilds its Source Index, and never snapshots a change automatically"
  }, testTitles: [
    "creates a visible Source Revision, rebuilds its Source Index, and never snapshots a change automatically"
  ], installedValidations: ["installed-critical-journeys"], failureBlocker: "source-mutation" },
  { scenarioId: "recovery-reanchoring-uncertainty", initialCondition: {
    kind: "anchor-match-uncertain-or-missing",
    evidenceTitle: "keeps uncertain and missing matches unresolved until the learner confirms a replacement, across relaunch"
  }, testTitles: [
    "keeps uncertain and missing matches unresolved until the learner confirms a replacement, across relaunch"
  ], installedValidations: [], failureBlocker: "unrecoverable-work" },
  { scenarioId: "recovery-privacy-denial", initialCondition: {
    kind: "session-access-denied",
    evidenceTitle: "denies app-server approval requests under Focused Access"
  }, testTitles: [
    "denies app-server approval requests under Focused Access",
    "supplies only authorized source content to the Model Runtime"
  ], installedValidations: ["installed-critical-journeys"], failureBlocker: "hidden-data-egress" },
  { scenarioId: "recovery-verifier-failure", initialCondition: {
    kind: "checker-unavailable",
    evidenceTitle: "reports an unavailable checker"
  }, testTitles: [
    "reports an unavailable checker"
  ], installedValidations: ["installed-critical-journeys"], failureBlocker: "dishonest-verification" },
  { scenarioId: "recovery-verifier-upgrade", initialCondition: {
    kind: "verifier-staging-interrupted",
    evidenceTitle: "reports and cleans interrupted staging without activating a half-installed checker"
  }, testTitles: [
    "reports and cleans interrupted staging without activating a half-installed checker",
    "keeps a failed validation in inactive staging for explicit cleanup"
  ], installedValidations: [], failureBlocker: "dishonest-verification" },
  { scenarioId: "recovery-artifact-invalidation", initialCondition: {
    kind: "artifact-claim-revision-changed",
    evidenceTitle: "stales only the exact changed claim in a multi-claim Artifact revision"
  }, testTitles: [
    "stales only the exact changed claim in a multi-claim Artifact revision",
    "invalidates a claim when regeneration changes assumptions without changing its displayed statement"
  ], installedValidations: [], failureBlocker: "dishonest-verification" },
  { scenarioId: "recovery-critical-journey-accessibility", initialCondition: {
    kind: "accessible-action-failed",
    evidenceTitle: "announces Ask Bar action failures"
  }, testTitles: [
    "announces Ask Bar action failures",
    "restores a closed Contextual Inspector only through its Anchor Marker and returns focus on close",
    "offers keyboard-accessible explicit resumption for a checkpointed Agent Task",
    "opens keyboard-accessible Session Consolidation controls and requires an explicit Target Disposition",
    "closes the Selection Palette with Escape and restores focus to the selected source control"
  ], installedValidations: ["installed-critical-journeys", "agent-recovery-journeys"],
  failureBlocker: "inaccessible-critical-journey" }
];
if (JSON.stringify(collectorDefinitions) !== JSON.stringify(recoveryPolicy.scenarios)) {
  throw new Error("The recovery collector definitions drifted from the checked-in recovery evidence policy.");
}
const definitions = recoveryPolicy.scenarios;
const trials = definitions.map(({ scenarioId, initialCondition, testTitles, installedValidations, failureBlocker }) => {
  const testEvidence = testTitles.map((title) => {
    const assertion = assertions.get(title);
    if (!assertion) throw new Error(`Missing deterministic recovery test: ${title}`);
    return { title, status: assertion.status, durationMs: assertion.duration };
  });
  const missingValidations = installedValidations.filter((validation) => !beta.validations.includes(validation));
  const initialEvidence = testEvidence.find((test) => test.title === initialCondition.evidenceTitle);
  if (!initialEvidence) throw new Error(`Missing initial-condition evidence for ${scenarioId}.`);
  const initialFailureEvidence = {
    kind: initialCondition.kind,
    title: initialEvidence.title,
    status: initialEvidence.status,
    durationMs: initialEvidence.durationMs
  };
  const passed = initialFailureEvidence.status === "passed"
    && testEvidence.every((test) => test.status === "passed") && missingValidations.length === 0;
  return {
    scenarioId,
    run: 1,
    passed,
    initialFailureEvidence,
    testEvidence,
    installedValidations,
    missingValidations,
    observedBlockers: passed ? [] : [failureBlocker]
  };
});
const report = {
  schemaVersion: 2,
  candidateCommit,
  recordedAt: new Date().toISOString(),
  recoveryPolicySha256: createHash("sha256").update(recoveryPolicyContent).digest("hex"),
  rawVitestFile: "recovery-vitest.json",
  rawVitestSha256: createHash("sha256").update(await readFile(rawPath)).digest("hex"),
  trials
};
await writeFile(join(outputDirectory, "recovery-verdicts.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
if (trials.some((trial) => !trial.passed)) throw new Error("One or more deterministic recovery trials failed.");
process.stdout.write(`Recorded ${trials.length} candidate-bound deterministic recovery trials.\n`);
