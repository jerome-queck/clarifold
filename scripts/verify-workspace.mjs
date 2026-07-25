import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const EXPECTED_ORIGIN = "https://github.com/jerome-queck/clarifold.git";
const REQUIRED_COMMANDS = ["git", "node", "npm", "gh"];
const REQUIRED_WORKSPACE_PATHS = ["AGENTS.md", "package.json", "package-lock.json", ".agents/skills"];
const APPROVED_RETIRED_PATH_REFERENCE_FILES = new Set([
  "docs/adr/0029-name-the-product-clarifold.md",
  "docs/research/clarifold-identity-migration.md",
]);

export function verifyWorkspace({
  rootDirectory,
  repositoryRoot,
  retiredDirectory,
  retiredDirectoryExists,
  originUrl,
  branch,
  status,
  nodeVersion,
  npmVersion,
  availableCommands,
  availablePaths,
  retiredPathReferences,
}) {
  const errors = [];
  if (basename(rootDirectory) !== "Clarifold") {
    errors.push(`workspace directory must be named Clarifold (got ${basename(rootDirectory) || "<empty>"})`);
  }
  if (rootDirectory !== repositoryRoot) {
    errors.push(`workspace root does not match Git root (${repositoryRoot})`);
  }
  if (!retiredDirectory) {
    errors.push("retired workspace directory must be supplied");
  } else if (retiredDirectoryExists) {
    errors.push(`retired workspace directory still exists: ${retiredDirectory}`);
  }
  if (originUrl !== EXPECTED_ORIGIN) {
    errors.push(`origin must be ${EXPECTED_ORIGIN} (got ${originUrl || "<missing>"})`);
  }
  if (branch !== "main") errors.push(`workspace must be on main (got ${branch || "<detached>"})`);
  if (status) errors.push("workspace must be clean");

  const nodeMajor = majorVersion(nodeVersion);
  if (![22, 24].includes(nodeMajor)) {
    errors.push(`Node.js must be major version 22 or 24 (got ${nodeVersion || "<missing>"})`);
  }
  if (majorVersion(npmVersion) !== 11) {
    errors.push(`npm must be major version 11 (got ${npmVersion || "<missing>"})`);
  }

  const available = new Set(availableCommands ?? []);
  const missingCommands = REQUIRED_COMMANDS.filter((command) => !available.has(command));
  if (missingCommands.length > 0) {
    errors.push(`required commands are unavailable: ${missingCommands.join(", ")}`);
  }
  const availablePathSet = new Set(availablePaths ?? []);
  const missingPaths = REQUIRED_WORKSPACE_PATHS.filter((file) => !availablePathSet.has(file));
  if (missingPaths.length > 0) {
    errors.push(`required workspace surfaces are missing: ${missingPaths.join(", ")}`);
  }
  const unexpectedReferences = (retiredPathReferences ?? [])
    .filter(({ path }) => !APPROVED_RETIRED_PATH_REFERENCE_FILES.has(path));
  if (unexpectedReferences.length > 0) {
    const details = unexpectedReferences.map(({ path, line }) => `${path}:${line}`).join(", ");
    errors.push(`tracked files reference the retired workspace path outside approved historical records: ${details}`);
  }
  return { ok: errors.length === 0, errors };
}

function majorVersion(value) {
  const match = /^v?(\d+)(?:\.|$)/.exec(String(value ?? "").trim());
  return match ? Number(match[1]) : NaN;
}

function commandOutput(command, args) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function commandAvailable(command) {
  try {
    commandOutput("sh", ["-lc", `command -v ${command}`]);
    return true;
  } catch {
    return false;
  }
}

function isSymlink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

function inspectWorkspace(rootDirectory, retiredDirectory) {
  const root = realpathSync(rootDirectory);
  const retired = resolve(retiredDirectory);
  const repositoryRoot = realpathSync(commandOutput("git", ["-C", root, "rev-parse", "--show-toplevel"]));
  return verifyWorkspace({
    rootDirectory: root,
    repositoryRoot,
    retiredDirectory: retired,
    retiredDirectoryExists: existsSync(retired) || isSymlink(retired),
    originUrl: commandOutput("git", ["-C", root, "remote", "get-url", "origin"]),
    branch: commandOutput("git", ["-C", root, "branch", "--show-current"]),
    status: commandOutput("git", ["-C", root, "status", "--porcelain"]),
    nodeVersion: commandOutput("node", ["--version"]),
    npmVersion: commandOutput("npm", ["--version"]),
    availableCommands: REQUIRED_COMMANDS.filter(commandAvailable),
    availablePaths: REQUIRED_WORKSPACE_PATHS.filter((file) => existsSync(resolve(root, file))),
    retiredPathReferences: findRetiredPathReferences(root, retired),
  });
}

function findRetiredPathReferences(root, retired) {
  try {
    return commandOutput("git", ["-C", root, "grep", "-n", "-F", "--", retired])
      .split("\n")
      .filter(Boolean)
      .map((entry) => {
        const match = /^(.*?):(\d+):/.exec(entry);
        return match ? { path: match[1], line: Number(match[2]) } : { path: entry, line: "?" };
      });
  } catch (error) {
    if (error && typeof error === "object" && "status" in error && error.status === 1) return [];
    throw error;
  }
}

function main() {
  const args = process.argv.slice(2);
  const retiredIndex = args.indexOf("--retired-directory");
  const retiredDirectory = retiredIndex >= 0 ? args[retiredIndex + 1] : undefined;
  if (!retiredDirectory) throw new Error("Usage: npm run workspace:verify -- --retired-directory <path>");

  const result = inspectWorkspace(process.cwd(), retiredDirectory);
  for (const error of result.errors) console.error(`Workspace verification: ${error}`);
  if (!result.ok) process.exitCode = 1;
  else console.log("Workspace verification passed: Clarifold root, Git state, toolchain, and retired path are valid.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
