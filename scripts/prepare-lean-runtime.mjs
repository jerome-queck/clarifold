import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, chmod, copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join, relative } from "node:path";

const version = "4.29.1";
const environmentId = `lean-${version}-core-v1`;
const releases = {
  arm64: {
    archive: `lean-${version}-darwin_aarch64.zip`,
    sha256: "c15284adf88ad830c71775b9828cb81f49f7f262cbe1456b25d935855bd70975"
  },
  x64: {
    archive: `lean-${version}-darwin.zip`,
    sha256: "8761365b4db21f6f4f78baa98636325ffd0bc620cb0f82cee0e8fa4d2d7843b2"
  }
};

if (process.platform !== "darwin" || !(process.arch in releases)) {
  throw new Error(`The bundled verifier supports macOS arm64 and x64; received ${process.platform} ${process.arch}.`);
}

const release = releases[process.arch];
const projectRoot = process.cwd();
const destination = join(projectRoot, "dist", "verifiers", environmentId);
const destinationLean = join(destination, "bin", "lean");
if (await preparedRuntimeIsCurrent()) process.exit(0);

const cacheDirectory = join(projectRoot, "node_modules", ".cache", "quick-study-lean");
const archivePath = join(cacheDirectory, release.archive);
const extractionDirectory = join(cacheDirectory, `${environmentId}-${process.arch}-extracted`);
await mkdir(cacheDirectory, { recursive: true });

if (!await fileHasDigest(archivePath, release.sha256)) {
  await rm(archivePath, { force: true });
  await run("/usr/bin/curl", ["--fail", "--location", "--retry", "3", "--output", archivePath,
    `https://github.com/leanprover/lean4/releases/download/v${version}/${release.archive}`]);
  if (!await fileHasDigest(archivePath, release.sha256)) throw new Error("Downloaded Lean archive failed its pinned SHA-256 check.");
}

await rm(extractionDirectory, { recursive: true, force: true });
await mkdir(extractionDirectory, { recursive: true });
await run("/usr/bin/ditto", ["-x", "-k", archivePath, extractionDirectory]);
const extractedNames = (await readdir(extractionDirectory)).filter((name) => name.startsWith(`lean-${version}-darwin`));
if (extractedNames.length !== 1) throw new Error("The pinned Lean archive has an unexpected layout.");
const source = join(extractionDirectory, extractedNames[0]);

await rm(destination, { recursive: true, force: true });
await copySelectedRuntime(source, destination);
await chmod(destinationLean, 0o755);
await writeFile(join(destination, "manifest.json"), `${JSON.stringify({
  id: environmentId,
  checker: "Lean",
  leanVersion: version,
  mathlibVersion: null,
  platform: "darwin",
  architecture: process.arch,
  sourceArchive: release.archive,
  sourceSha256: release.sha256,
  supportProfile: "Quick Study exact core claims v1",
  runtimeFormat: 4
}, null, 2)}\n`, "utf8");
await rm(extractionDirectory, { recursive: true, force: true });

if (!await executableReportsPinnedVersion(destinationLean)) throw new Error("Prepared Lean runtime did not report the pinned version.");

async function copySelectedRuntime(sourceRoot, destinationRoot) {
  const paths = [
    "LICENSE",
    "LICENSES",
    "bin/lean"
  ];
  const leanLibrary = join(sourceRoot, "lib", "lean");
  for (const entry of await readdir(leanLibrary, { withFileTypes: true })) {
    if (entry.isFile() && /^lib.*shared.*\.dylib$/.test(entry.name)) paths.push(join("lib", "lean", entry.name));
    if (entry.isFile() && (entry.name.startsWith("Init.olean") || entry.name === "Init.ir")) {
      paths.push(join("lib", "lean", entry.name));
    }
  }
  await collectOleanFiles(join(leanLibrary, "Init"), sourceRoot, paths);
  for (const path of paths) {
    const from = join(sourceRoot, path);
    const to = join(destinationRoot, path);
    await mkdir(dirname(to), { recursive: true });
    const sourceStat = await stat(from);
    if (sourceStat.isDirectory()) await mkdir(to, { recursive: true });
    else await copyFile(from, to);
  }
}

async function collectOleanFiles(directory, sourceRoot, paths) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collectOleanFiles(path, sourceRoot, paths);
    else if (entry.name.includes(".olean") || entry.name.endsWith(".ir")) paths.push(relative(sourceRoot, path));
  }
}

async function fileHasDigest(path, expected) {
  try {
    await access(path);
  } catch {
    return false;
  }
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex") === expected;
}

async function executableReportsPinnedVersion(path) {
  try {
    const output = await run(path, ["--version"], true);
    return output.includes(`version ${version}`);
  } catch {
    return false;
  }
}

async function preparedRuntimeIsCurrent() {
  try {
    const manifest = JSON.parse(await readFile(join(destination, "manifest.json"), "utf8"));
    return manifest.runtimeFormat === 4 && await executableReportsPinnedVersion(destinationLean);
  } catch {
    return false;
  }
}

function run(command, args, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit" });
    let output = "";
    if (capture) {
      child.stdout.on("data", (chunk) => { output += chunk.toString(); });
      child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    }
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve(output) : reject(new Error(`${command} exited with ${code}. ${output}`)));
  });
}
