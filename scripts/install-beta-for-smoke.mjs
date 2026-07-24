import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, lstat, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readClarifoldReleaseIdentity } from "./clarifold-release-identity.mjs";
import { assertRealDirectory, assertRealFile } from "./release-integrity.mjs";

const root = process.cwd();
const architecture = process.arch === "arm64" ? "arm64" : "x64";
const release = await readClarifoldReleaseIdentity(root);
const { identity } = release;
const verifierSpecification = JSON.parse(await readFile(join(
  root, "src", "shared", "bundled-verifier-environment.json"
), "utf8"));
const makeDirectory = join(root, "out", "make", "zip", "darwin", architecture);
const expectedName = release.archiveName(architecture);
const artifactPath = join(makeDirectory, expectedName);
const installDirectory = join(root, "test-results", "installed-beta");
const applicationPath = join(installDirectory, release.applicationName);
const executablePath = join(applicationPath, "Contents", "MacOS", release.executableName);
const verifierPath = join(applicationPath, "Contents", "Resources", "verifiers",
  verifierSpecification.id);

await assertRealFile(artifactPath, "beta archive");
await stat(artifactPath);
await makeWritable(installDirectory);
await rm(installDirectory, { recursive: true, force: true });
await mkdir(installDirectory, { recursive: true });
execFileSync("/usr/bin/ditto", ["-x", "-k", artifactPath, installDirectory], { stdio: "inherit" });
await assertRealDirectory(applicationPath, "packaged application root");
await assertRealFile(executablePath, "packaged application executable");
await stat(verifierPath);
execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", applicationPath], { stdio: "inherit" });

const bundleMetadata = JSON.parse(execFileSync("/usr/bin/plutil", [
  "-convert", "json", "-o", "-", join(applicationPath, "Contents", "Info.plist")
], { encoding: "utf8" }));
for (const [field, actual, expected] of [
  ["CFBundleDisplayName", bundleMetadata.CFBundleDisplayName, release.productName],
  ["CFBundleExecutable", bundleMetadata.CFBundleExecutable, release.executableName],
  ["CFBundleIdentifier", bundleMetadata.CFBundleIdentifier, release.bundleIdentifier],
  ["CFBundleName", bundleMetadata.CFBundleName, release.productName],
  ["CFBundleShortVersionString", bundleMetadata.CFBundleShortVersionString, release.version]
]) {
  if (actual !== expected) throw new Error(`Packaged ${field} is ${String(actual)}; expected ${expected}.`);
}
for (const resource of ["LICENSE.md", "NOTICE", "THIRD_PARTY_NOTICES.md", "ELECTRON_LICENSE", "CHROMIUM_LICENSES.html"]) {
  await assertRealFile(join(applicationPath, "Contents", "Resources", resource), `packaged ${resource}`);
}

const digest = await fileDigest(artifactPath);
const report = {
  schemaVersion: 1,
  artifact: expectedName,
  architecture,
  identity: {
    packageName: release.packageName,
    productName: release.productName,
    version: release.version,
    bundleIdentifier: release.bundleIdentifier
  },
  sha256: digest,
  candidateCommit: process.env.GITHUB_SHA
    ?? execFileSync("/usr/bin/git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  installedApplication: `test-results/installed-beta/${release.applicationName}`,
  validations: [
    "archive-extracted", "application-identity", "application-executable-present", "bundled-verifier-present",
    "legal-resources-present", "code-signature-valid"
  ]
};
await writeFile(join(root, "test-results", "beta-install.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

const entries = (await readdir(installDirectory)).filter((entry) => entry !== ".DS_Store");
if (entries.length !== 1 || entries[0] !== release.applicationName) {
  throw new Error(`The beta archive must install exactly ${release.applicationName}; found: ${entries.join(", ")}`);
}

process.stdout.write(`Validated installed beta ${expectedName} (${digest}).\n`);

async function fileDigest(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function makeWritable(path) {
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  if (info.isSymbolicLink()) return;
  if (!info.isDirectory()) {
    await chmod(path, 0o600);
    return;
  }
  await chmod(path, 0o700);
  for (const entry of await readdir(path)) await makeWritable(join(path, entry));
}
