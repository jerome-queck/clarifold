import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readClarifoldReleaseIdentity } from "./clarifold-release-identity.mjs";
import { assertRealFile } from "./release-integrity.mjs";

export const INTERNAL_CANDIDATE_MAX_AGE_DAYS = 30;
export const INTERNAL_CANDIDATE_REPORT_RETENTION_DAYS = 14;
export const INTERNAL_CANDIDATE_ARCHIVE_RETENTION_DAYS = 30;

export async function assembleInternalCandidateManifest(rootDirectory = process.cwd(), {
  revision = process.env.CANDIDATE_REVISION,
  now = new Date(),
  verificationCommand = "npm run verify",
} = {}) {
  const release = await readClarifoldReleaseIdentity(rootDirectory);
  const candidateCommit = git(rootDirectory, ["rev-parse", "HEAD"]).trim();
  if (!/^[a-f0-9]{40}$/.test(revision ?? "")) {
    throw new Error("An explicit 40-character candidate revision is required.");
  }
  if (revision !== candidateCommit) {
    throw new Error("The candidate revision does not match the checked-out revision.");
  }
  if (git(rootDirectory, ["status", "--porcelain", "--untracked-files=all"]).trim()) {
    throw new Error("Internal candidate evidence requires a clean checked-out revision.");
  }

  const commitDate = new Date(git(rootDirectory, ["show", "-s", "--format=%cI", candidateCommit]).trim());
  if (!Number.isFinite(commitDate.getTime()) || !Number.isFinite(now.getTime())) {
    throw new Error("The candidate revision timestamp is invalid.");
  }
  const ageDays = (now.getTime() - commitDate.getTime()) / (24 * 60 * 60 * 1000);
  if (ageDays > INTERNAL_CANDIDATE_MAX_AGE_DAYS) {
    throw new Error(`The candidate revision is older than ${INTERNAL_CANDIDATE_MAX_AGE_DAYS} days.`);
  }

  const receiptPath = join(rootDirectory, "test-results", "beta-install.json");
  await assertRealFile(receiptPath, "installed beta receipt");
  const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
  if (receipt.candidateCommit !== candidateCommit
    || !/^(arm64|x64)$/.test(receipt.architecture ?? "")
    || receipt.artifact !== release.archiveName(receipt.architecture)
    || receipt.identity?.packageName !== release.packageName
    || receipt.identity?.productName !== release.productName
    || receipt.identity?.version !== release.version
    || receipt.identity?.bundleIdentifier !== release.bundleIdentifier
    || !/^[a-f0-9]{64}$/.test(receipt.sha256 ?? "")) {
    throw new Error("The installed beta receipt does not match the exact candidate revision and identity.");
  }

  const archivePath = join(rootDirectory, "out", "make", "zip", "darwin", receipt.architecture, receipt.artifact);
  await assertRealFile(archivePath, "internal candidate archive");
  const archiveSha256 = await fileDigest(archivePath);
  if (archiveSha256 !== receipt.sha256) {
    throw new Error("The internal candidate archive does not match the installed beta receipt.");
  }

  const manifest = {
    schemaVersion: 1,
    candidateCommit,
    candidateDate: commitDate.toISOString(),
    distribution: {
      label: "internal-candidate-not-for-distribution",
      support: "limited-support",
      signed: false,
      notarized: false,
      publicRelease: false,
    },
    retention: {
      reportDays: INTERNAL_CANDIDATE_REPORT_RETENTION_DAYS,
      archiveDays: INTERNAL_CANDIDATE_ARCHIVE_RETENTION_DAYS,
    },
    verification: {
      status: "passed",
      commands: [verificationCommand, "npm run security:dependencies"],
      completedAt: now.toISOString(),
      validations: receipt.validations ?? [],
    },
    toolchain: {
      node: process.version,
      npm: execFileSync("npm", ["--version"], { encoding: "utf8" }).trim(),
      electron: release.packageJson.devDependencies?.electron ?? release.packageJson.dependencies?.electron,
      runner: process.env.RUNNER_OS ?? process.platform,
    },
    provenance: {
      archiveName: receipt.artifact,
      archiveSha256,
      receiptSha256: await fileDigest(receiptPath),
    },
    supportMatrix: {
      architecture: receipt.architecture,
      macOS: "14 Sonoma or later",
      memory: "At least 16 GB",
    },
    knownLimitations: [
      "No Developer ID signing or notarization.",
      "This workflow artifact is not a supported public production release.",
      "Intel and universal archives are not claimed.",
      "There is no automatic updater or dedicated support service.",
    ],
    identity: {
      packageName: release.packageName,
      productName: release.productName,
      version: release.version,
      bundleIdentifier: release.bundleIdentifier,
    },
  };
  await writeFile(
    join(rootDirectory, "test-results", "internal-candidate.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return manifest;
}

function git(cwd, args) {
  return execFileSync("/usr/bin/git", args, { cwd, encoding: "utf8" });
}

async function fileDigest(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const manifest = await assembleInternalCandidateManifest();
  process.stdout.write(`Validated internal candidate ${manifest.candidateCommit}.\n`);
}
