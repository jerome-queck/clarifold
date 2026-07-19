import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { constants, createReadStream } from "node:fs";
import { chmod, copyFile, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import {
  BUNDLED_LEAN_ENVIRONMENT,
  validVerificationEnvironment,
  type VerifierEnvironmentInspection,
  type VerifierEnvironmentManager
} from "../shared/verifier-runtime";

export class LeanEnvironmentManager implements VerifierEnvironmentManager {
  private readonly environmentPath: string;
  private readonly seedPath: string;
  private readonly removalMarkerPath: string;
  private trustedSeedDigest: Promise<string> | null = null;

  constructor(
    private readonly registryPath: string,
    seedRegistryPath: string,
    private readonly validate: (environmentPath: string) => Promise<void> = validateReferenceProof,
    private readonly beforeRemove: () => Promise<void> = async () => undefined
  ) {
    this.environmentPath = join(registryPath, BUNDLED_LEAN_ENVIRONMENT.id);
    this.seedPath = join(seedRegistryPath, BUNDLED_LEAN_ENVIRONMENT.id);
    this.removalMarkerPath = join(registryPath, ".lean-environment-removed");
  }

  executablePath(): string {
    return join(this.environmentPath, "bin", "lean");
  }

  async defaultInstallationNeeded(): Promise<boolean> {
    const inspection = await this.inspect();
    return !inspection.installed && !inspection.cleanupRequired && !await exists(this.removalMarkerPath);
  }

  async inspect(): Promise<VerifierEnvironmentInspection> {
    const entries = await directoryEntries(this.registryPath);
    const interrupted = entries.some((name) => name.startsWith(`.${BUNDLED_LEAN_ENVIRONMENT.id}.installing-`)
      || name.startsWith(`.${BUNDLED_LEAN_ENVIRONMENT.id}.removing-`));
    const installed = await validInstalledEnvironment(this.environmentPath);
    const invalidActive = !installed && entries.includes(BUNDLED_LEAN_ENVIRONMENT.id);
    return {
      installed,
      installedBytes: installed ? await directorySize(this.environmentPath) : 0,
      cleanupRequired: interrupted || invalidActive
    };
  }

  async install(): Promise<{ installedBytes: number }> {
    await mkdir(this.registryPath, { recursive: true });
    for (const name of await directoryEntries(this.registryPath)) {
      if (name.startsWith(`.${BUNDLED_LEAN_ENVIRONMENT.id}.installing-`)) {
        await removeWritableTree(this.registryPath, join(this.registryPath, name));
      }
    }
    const stagingPath = join(this.registryPath, `.${BUNDLED_LEAN_ENVIRONMENT.id}.installing-${randomUUID()}`);
    await copySeedToWritableRegistry(this.seedPath, stagingPath);
    if (!await validEnvironmentIdentity(stagingPath)) {
      throw new Error("The staged Lean environment did not match the supported Default Verification Environment.");
    }
    if (await treeContentDigest(stagingPath) !== await this.seedDigest()) {
      throw new Error("The staged Lean environment did not match the signed application payload.");
    }
    await this.validate(stagingPath);
    await makeTreeReadOnly(this.registryPath, stagingPath);
    const backupPath = join(this.registryPath, `.${BUNDLED_LEAN_ENVIRONMENT.id}.removing-${randomUUID()}`);
    const hadActive = await exists(this.environmentPath);
    if (hadActive) await rename(this.environmentPath, backupPath);
    try {
      await rename(stagingPath, this.environmentPath);
    } catch (error) {
      if (hadActive) await rename(backupPath, this.environmentPath);
      throw error;
    }
    await removeWritableTree(this.registryPath, backupPath);
    await rm(this.removalMarkerPath, { force: true });
    return { installedBytes: await directorySize(this.environmentPath) };
  }

  async remove(): Promise<{ removedLogicalBytes: number }> {
    if (!await this.installedIntegrityIsValid()) {
      throw new Error("The installed Lean environment is missing or invalid; clean it up before retrying.");
    }
    await this.beforeRemove();
    const removedLogicalBytes = await directorySize(this.environmentPath);
    const removalPath = join(this.registryPath, `.${BUNDLED_LEAN_ENVIRONMENT.id}.removing-${randomUUID()}`);
    await writeFile(this.removalMarkerPath, `${BUNDLED_LEAN_ENVIRONMENT.id}\n`, "utf8");
    await rename(this.environmentPath, removalPath);
    await removeWritableTree(this.registryPath, removalPath);
    return { removedLogicalBytes };
  }

  async cleanup(): Promise<{ installed: boolean; installedBytes: number }> {
    for (const name of await directoryEntries(this.registryPath)) {
      if (name.startsWith(`.${BUNDLED_LEAN_ENVIRONMENT.id}.installing-`)
        || name.startsWith(`.${BUNDLED_LEAN_ENVIRONMENT.id}.removing-`)
        || (name === BUNDLED_LEAN_ENVIRONMENT.id && !await this.installedIntegrityIsValid())) {
        await removeWritableTree(this.registryPath, join(this.registryPath, name));
      }
    }
    const inspection = await this.inspect();
    return { installed: inspection.installed, installedBytes: inspection.installedBytes };
  }

  async assertInstalledIntegrity(signal?: AbortSignal): Promise<void> {
    if (!await validInstalledEnvironment(this.environmentPath)) {
      throw new Error("The installed Lean environment does not match the signed application payload.");
    }
    const deadline = Date.now() + 60_000;
    const [installedDigest, trustedDigest] = await Promise.all([
      treeContentDigest(this.environmentPath, signal, deadline),
      this.seedDigest(signal, deadline)
    ]);
    if (installedDigest !== trustedDigest) {
      throw new Error("The installed Lean environment does not match the signed application payload.");
    }
  }

  primeSeedIntegrity(): void {
    void this.seedDigest(undefined, Date.now() + 60_000).catch(() => undefined);
  }

  private async installedIntegrityIsValid(signal?: AbortSignal): Promise<boolean> {
    try {
      await this.assertInstalledIntegrity(signal);
      return true;
    } catch {
      return false;
    }
  }

  private seedDigest(signal?: AbortSignal, deadline = Date.now() + 60_000): Promise<string> {
    this.trustedSeedDigest ??= treeContentDigest(this.seedPath, signal, deadline).catch((error) => {
      this.trustedSeedDigest = null;
      throw error;
    });
    return this.trustedSeedDigest;
  }
}

function validateReferenceProof(environmentPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(join(environmentPath, "bin", "lean"), [join(environmentPath, "app-support", "QuickStudyNatAddZero.lean")], {
      timeout: 15_000,
      encoding: "utf8",
      maxBuffer: 1024 * 1024
    }, (error, _stdout, stderr) => {
      if (!error) resolve();
      else reject(new Error(`The staged Lean environment failed its reference proof. ${stderr.trim() || error.message}`));
    });
  });
}

async function validInstalledEnvironment(path: string): Promise<boolean> {
  return await validEnvironmentIdentity(path) && await treeIsImmutable(path);
}

async function validEnvironmentIdentity(path: string): Promise<boolean> {
  try {
    const root = await lstat(path);
    const manifestPath = join(path, "manifest.json");
    const manifestInfo = await lstat(manifestPath);
    if (!root.isDirectory() || root.isSymbolicLink() || !manifestInfo.isFile() || manifestInfo.isSymbolicLink()) return false;
    const manifest: unknown = JSON.parse(await readFile(manifestPath, "utf8"));
    if (!validVerificationEnvironment(manifest)) return false;
    const executable = await lstat(join(path, "bin", "lean"));
    return executable.isFile() && !executable.isSymbolicLink();
  } catch {
    return false;
  }
}

async function directoryEntries(path: string): Promise<string[]> {
  try {
    return (await readdir(path)).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function directorySize(path: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isSymbolicLink()) throw new Error("The Lean environment contains an unsafe filesystem link.");
    total += entry.isDirectory() ? await directorySize(child) : (await lstat(child)).size;
  }
  return total;
}

async function treeContentDigest(root: string, signal?: AbortSignal, deadline = Date.now() + 60_000): Promise<string> {
  const hash = createHash("sha256");
  await appendTreeDigest(hash, root, root, signal, deadline);
  return hash.digest("hex");
}

async function appendTreeDigest(
  hash: ReturnType<typeof createHash>, root: string, path: string, signal: AbortSignal | undefined, deadline: number
): Promise<void> {
  requireIntegrityScanActive(signal, deadline);
  const entries = (await readdir(path, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    requireIntegrityScanActive(signal, deadline);
    const child = join(path, entry.name);
    const identity = relative(root, child);
    if (entry.isSymbolicLink()) throw new Error("The Lean environment contains an unsafe filesystem link.");
    hash.update(entry.isDirectory() ? `directory\0${identity}\0` : `file\0${identity}\0`);
    if (entry.isDirectory()) await appendTreeDigest(hash, root, child, signal, deadline);
    else if (entry.isFile()) {
      for await (const chunk of createReadStream(child, { signal })) {
        requireIntegrityScanActive(signal, deadline);
        hash.update(chunk);
      }
    } else throw new Error("The Lean environment contains an unsupported filesystem entry.");
  }
}

function requireIntegrityScanActive(signal: AbortSignal | undefined, deadline: number): void {
  if (signal?.aborted) throw new Error("The Lean integrity check was cancelled.");
  if (Date.now() > deadline) throw new Error("The Lean integrity check exceeded 60 seconds.");
}

async function copySeedToWritableRegistry(source: string, destination: string): Promise<void> {
  await mkdir(destination, { recursive: true, mode: 0o700 });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const sourceChild = join(source, entry.name);
    const destinationChild = join(destination, entry.name);
    if (entry.isDirectory()) await copySeedToWritableRegistry(sourceChild, destinationChild);
    else if (entry.isFile()) {
      await copyFile(sourceChild, destinationChild, constants.COPYFILE_FICLONE);
      await chmod(destinationChild, destinationChild.endsWith(join("bin", "lean")) ? 0o700 : 0o600);
    } else {
      throw new Error(`The bundled Lean environment contains an unsupported filesystem entry: ${entry.name}`);
    }
  }
}

async function makeTreeReadOnly(registryPath: string, path: string): Promise<void> {
  assertManagedPath(registryPath, path);
  const info = await lstat(path);
  if (info.isSymbolicLink()) throw new Error("The Lean environment contains an unsafe filesystem link.");
  if (!info.isDirectory()) {
    await chmod(path, path.endsWith(join("bin", "lean")) ? 0o500 : 0o400);
    return;
  }
  for (const entry of await readdir(path)) await makeTreeReadOnly(registryPath, join(path, entry));
  await chmod(path, 0o500);
}

async function treeIsImmutable(path: string): Promise<boolean> {
  const info = await lstat(path);
  if (info.isSymbolicLink() || (info.mode & 0o222) !== 0) return false;
  if (!info.isDirectory()) return true;
  for (const entry of await readdir(path)) {
    if (!await treeIsImmutable(join(path, entry))) return false;
  }
  return true;
}

async function removeWritableTree(registryPath: string, path: string): Promise<void> {
  assertManagedPath(registryPath, path);
  if (!await exists(path)) return;
  await makeTreeWritable(registryPath, path);
  await rm(path, { recursive: true, force: true });
}

async function makeTreeWritable(registryPath: string, path: string): Promise<void> {
  assertManagedPath(registryPath, path);
  const info = await lstat(path);
  if (info.isSymbolicLink()) return;
  if (!info.isDirectory()) return;
  await chmod(path, 0o700);
  for (const entry of await readdir(path, { withFileTypes: true })) {
    await makeTreeWritable(registryPath, join(path, entry.name));
  }
}

function assertManagedPath(registryPath: string, path: string): void {
  const relation = relative(registryPath, path);
  if (!relation || relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
    throw new Error("Refusing to modify a path outside the Verifier Environment Registry.");
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
