import { extractFile } from "@electron/asar";
import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const LICENSE_SHA256 = "ffcca38841adb694b6f380647e15f17c446a4d1656fed51a1e2041d064c94cc8";
const ALLOWED_NPM_RUNTIME_LICENSES = new Set(["MIT"]);

export async function auditPackagedApplication(applicationPath, options = {}) {
  const packageLock = options.packageLock ?? JSON.parse(await readFile(join(projectRoot, "package-lock.json"), "utf8"));
  const verifierId = options.verifierId ?? JSON.parse(await readFile(
    join(projectRoot, "src", "shared", "bundled-verifier-environment.json"),
    "utf8",
  )).id;
  const contents = join(applicationPath, "Contents");
  const resources = join(contents, "Resources");
  const asarPath = join(resources, "app.asar");
  const verifier = join(resources, "verifiers", verifierId);

  await requireNonEmptyFile(join(resources, "ELECTRON_LICENSE"), "Electron license");
  await requireNonEmptyFile(join(resources, "CHROMIUM_LICENSES.html"), "Chromium notices");
  const projectLicense = await requireNonEmptyFile(join(resources, "LICENSE"), "Clarifold license");
  if (sha256(projectLicense) !== LICENSE_SHA256) {
    throw new Error("Packaged Clarifold LICENSE does not match PolyForm Noncommercial 1.0.0.");
  }
  const notice = await requireNonEmptyFile(join(resources, "NOTICE"), "Clarifold notice");
  if (!notice.includes("Required Notice: Copyright © 2026 Jerome Queck")) {
    throw new Error("Packaged NOTICE is missing the required Jerome Queck copyright notice.");
  }
  await requireNonEmptyFile(join(resources, "THIRD_PARTY_NOTICES.md"), "third-party notices");
  await requireNonEmptyFile(join(verifier, "LICENSE"), "Lean license");
  await requireNonEmptyFile(join(verifier, "LICENSES"), "Lean component licenses");
  await requireNonEmptyFile(join(verifier, "mathlib-LICENSE"), "mathlib license");

  for (const { name, key, license } of runtimePackages(packageLock)) {
    if (!ALLOWED_NPM_RUNTIME_LICENSES.has(license)) {
      throw new Error(`Disallowed or unknown runtime license for ${name}: ${license}`);
    }
    const packageJsonPath = `node_modules/${name}/package.json`;
    let packagedPackage;
    try {
      packagedPackage = JSON.parse(extractFile(asarPath, packageJsonPath).toString("utf8"));
    } catch (error) {
      throw new Error(`Packaged runtime dependency is missing: ${packageJsonPath}`, { cause: error });
    }
    if (packagedPackage.license !== license) {
      throw new Error(`Packaged runtime license mismatch for ${name}: expected ${license}, got ${packagedPackage.license ?? "unknown"}`);
    }
    if (!key) throw new Error(`Could not resolve package-lock entry for runtime dependency ${name}.`);
  }

  return { applicationPath, runtimePackages: runtimePackages(packageLock).map(({ name, license }) => ({ name, license })) };
}

async function requireNonEmptyFile(path, label) {
  try {
    const contents = await readFile(path);
    if (contents.length === 0) throw new Error("empty file");
    return contents;
  } catch (error) {
    throw new Error(`Packaged ${label} is missing or unreadable: ${path}`, { cause: error });
  }
}

function runtimePackages(packageLock) {
  const packages = packageLock.packages ?? {};
  const queue = Object.keys(packages[""]?.dependencies ?? {}).map((name) => ({ name, parentKey: "" }));
  const visited = new Set();
  const result = [];
  while (queue.length > 0) {
    const { name, parentKey } = queue.shift();
    const key = resolvePackageKey(packages, name, parentKey);
    if (!key || visited.has(key)) continue;
    visited.add(key);
    const metadata = packages[key];
    const license = typeof metadata.license === "string" ? metadata.license : "unknown";
    result.push({ name, key, license });
    for (const dependency of Object.keys(metadata.dependencies ?? {})) {
      queue.push({ name: dependency, parentKey: key });
    }
  }
  return result;
}

function resolvePackageKey(packages, name, parentKey) {
  let current = parentKey;
  while (current) {
    const candidate = `${current}/node_modules/${name}`;
    if (packages[candidate]) return candidate;
    const boundary = current.lastIndexOf("/node_modules/");
    current = boundary < 0 ? "" : current.slice(0, boundary);
  }
  const rootCandidate = `node_modules/${name}`;
  return packages[rootCandidate] ? rootCandidate : null;
}

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

async function findPackagedApplication() {
  const outDirectory = join(projectRoot, "out");
  const entries = await readdir(outDirectory, { withFileTypes: true });
  const packageDirectory = entries.find((entry) => entry.isDirectory() && /^Quick Study-darwin-/.test(entry.name));
  if (!packageDirectory) throw new Error(`No packaged Quick Study application found under ${outDirectory}.`);
  return join(outDirectory, packageDirectory.name, "Quick Study.app");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const applicationPath = process.env.QUICK_STUDY_PACKAGED_APP ?? await findPackagedApplication();
  await access(applicationPath);
  const result = await auditPackagedApplication(applicationPath);
  console.log(`Packaged license audit passed for ${result.applicationPath}: ${result.runtimePackages.map(({ name, license }) => `${name} (${license})`).join(", ")}.`);
}
