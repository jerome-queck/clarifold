// @vitest-environment node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// @ts-expect-error The candidate contract is an executable-side JavaScript module.
import { assembleInternalCandidateManifest } from "../../scripts/assemble-internal-candidate-manifest.mjs";

describe("internal candidate release contract", () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })));
  });

  it("binds the limited-support candidate report and archive to one fresh revision", async () => {
    const fixture = await createCandidateFixture();
    temporaryDirectories.push(fixture.root);

    const manifest = await assembleInternalCandidateManifest(fixture.root, {
      revision: fixture.commit,
      now: new Date("2026-07-25T00:00:00.000Z"),
    });

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      candidateCommit: fixture.commit,
      distribution: {
        label: "internal-candidate-not-for-distribution",
        support: "limited-support",
        signed: false,
        notarized: false,
        publicRelease: false,
      },
      retention: { reportDays: 14, archiveDays: 30 },
      verification: {
        status: "passed",
        commands: ["npm run verify", "npm run security:dependencies"],
      },
      supportMatrix: { architecture: "arm64", macOS: "14 Sonoma or later" },
      provenance: {
        archiveName: "Clarifold-darwin-arm64-0.2.0.zip",
        archiveSha256: fixture.archiveDigest,
      },
    });
    expect(manifest.provenance.receiptSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.knownLimitations).toContain("No Developer ID signing or notarization.");
  });

  it("rejects a revision that is stale or different from the checked-out source", async () => {
    const fixture = await createCandidateFixture({
      commitDate: "2026-06-24T00:00:00.000Z",
    });
    temporaryDirectories.push(fixture.root);

    await expect(assembleInternalCandidateManifest(fixture.root, {
      revision: fixture.commit,
      now: new Date("2026-07-25T00:00:00.000Z"),
    })).rejects.toThrow("older than 30 days");

    await expect(assembleInternalCandidateManifest(fixture.root, {
      revision: "a".repeat(40),
      now: new Date("2026-07-25T00:00:00.000Z"),
    })).rejects.toThrow("does not match the checked-out revision");
  });

  it("assembles the report when invoked through its workflow command", async () => {
    const fixture = await createCandidateFixture();
    temporaryDirectories.push(fixture.root);

    execFileSync(process.execPath, [join(process.cwd(), "scripts", "assemble-internal-candidate-manifest.mjs")], {
      cwd: fixture.root,
      env: { ...process.env, CANDIDATE_REVISION: fixture.commit },
    });

    const manifest = JSON.parse(await readFile(join(fixture.root, "test-results", "internal-candidate.json"), "utf8"));
    expect(manifest.candidateCommit).toBe(fixture.commit);
    expect(manifest.provenance.archiveSha256).toBe(fixture.archiveDigest);
  });

  it("keeps routine CI reports small and puts the archive only in the manual candidate workflow", async () => {
    const routineWorkflow = await readFile(join(process.cwd(), ".github", "workflows", "macos-ci.yml"), "utf8");
    const candidateWorkflow = await readFile(join(
      process.cwd(), ".github", "workflows", "internal-candidate.yml"
    ), "utf8");

    expect(routineWorkflow).not.toContain("out/make/zip/darwin");
    expect(routineWorkflow).toContain("retention-days: 14");
    expect(candidateWorkflow).toContain("workflow_dispatch:");
    expect(candidateWorkflow).toContain("revision:");
    expect(candidateWorkflow).toContain("required: true");
    expect(candidateWorkflow).toContain("retention-days: 30");
    expect(candidateWorkflow).toContain("retention-days: 14");
    expect(candidateWorkflow).toContain("internal-candidate-not-for-distribution");
    expect(candidateWorkflow).not.toMatch(/gh\s+(release|api).*releases|git\s+tag/);
  });
});

async function createCandidateFixture({
  commitDate = "2026-07-24T00:00:00.000Z",
}: { commitDate?: string } = {}) {
  const root = await mkdtemp(join(tmpdir(), "clarifold-internal-candidate-"));
  await mkdir(join(root, "src", "shared"), { recursive: true });
  await mkdir(join(root, "test-results"), { recursive: true });
  await mkdir(join(root, "out", "make", "zip", "darwin", "arm64"), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({
    name: "clarifold",
    productName: "Clarifold",
    version: "0.2.0",
    devDependencies: { electron: "43.1.1" },
  }));
  await writeFile(join(root, "src", "shared", "clarifold-identity.json"), await readFile(
    join(process.cwd(), "src", "shared", "clarifold-identity.json"), "utf8"
  ));
  await writeFile(join(root, "test-results", "beta-install.json"), "{}\n");
  await writeFile(join(root, ".gitignore"), "out/\ntest-results/\n");
  git(root, ["init"]);
  git(root, ["config", "user.name", "Release Test"]);
  git(root, ["config", "user.email", "release-test@example.com"]);
  git(root, ["add", "."]);
  execFileSync("/usr/bin/git", ["commit", "-m", "test candidate"], {
    cwd: root,
    env: { ...process.env, GIT_AUTHOR_DATE: commitDate, GIT_COMMITTER_DATE: commitDate },
  });
  const commit = git(root, ["rev-parse", "HEAD"]).trim();
  const archivePath = join(root, "out", "make", "zip", "darwin", "arm64", "Clarifold-darwin-arm64-0.2.0.zip");
  await writeFile(archivePath, "candidate archive", "utf8");
  const archiveDigest = digest(await readFile(archivePath));
  await writeFile(join(root, "test-results", "beta-install.json"), JSON.stringify({
    candidateCommit: commit,
    architecture: "arm64",
    artifact: "Clarifold-darwin-arm64-0.2.0.zip",
    identity: {
      packageName: "clarifold",
      productName: "Clarifold",
      version: "0.2.0",
      bundleIdentifier: "org.jeromegroup.clarifold",
    },
    sha256: archiveDigest,
  }) + "\n");
  return { root, commit, archiveDigest };
}

function git(cwd: string, args: string[]): string {
  return execFileSync("/usr/bin/git", args, { cwd, encoding: "utf8" });
}

function digest(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}
