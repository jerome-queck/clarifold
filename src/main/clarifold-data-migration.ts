import { statfs } from "node:fs/promises";
import { copyFile, lstat, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { CLARIFOLD_IDENTITY } from "../shared/clarifold-identity";
import { LearningApplication } from "../shared/learning-application";

const MIGRATION_RECEIPT_NAME = "migration-receipt.json";
const MIGRATION_STAGING_SUFFIX = ".migration-staging";
const MIGRATION_LOCK_SUFFIX = ".migration-lock";

export type MigrationStage =
  | "discovery"
  | "preflight"
  | "staging-copy"
  | "verification"
  | "atomic-commit"
  | "recovery"
  | "complete";

export type MigrationOutcome = "not-needed" | "migrated" | "already-migrated" | "blocked" | "failed";

export type MigrationReason =
  | "source-absent"
  | "source-incomplete"
  | "destination-conflict"
  | "concurrent-launch"
  | "staging-collision"
  | "insufficient-space"
  | "validation-failed"
  | "copy-failed"
  | "activation-failed";

export interface MigrationReceipt {
  readonly schemaVersion: 1;
  readonly source: string;
  readonly destination: string;
  readonly applicationVersion: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly outcome: "migrated";
}

export interface MigrationResult {
  readonly outcome: MigrationOutcome;
  readonly stages: MigrationStage[];
  readonly reason?: MigrationReason;
  readonly message?: string;
  readonly receipt?: MigrationReceipt;
}

export interface ClarifoldDataMigrationOptions {
  readonly sourceDirectory: string;
  readonly destinationDirectory: string;
  readonly applicationVersion: string;
  readonly now?: () => Date;
  readonly onStage?: (stage: MigrationStage) => void;
  readonly getFreeSpaceBytes?: (path: string) => Promise<number>;
  readonly validateStagedDirectory?: (path: string) => Promise<void>;
}

export async function migrateQuickStudyData(options: ClarifoldDataMigrationOptions): Promise<MigrationResult> {
  const sourceDirectory = normalizedDirectory(options.sourceDirectory, "source");
  const destinationDirectory = normalizedDirectory(options.destinationDirectory, "destination");
  if (sourceDirectory === destinationDirectory) throw new Error("Migration source and destination must differ.");

  const stages: MigrationStage[] = [];
  const emit = (stage: MigrationStage): void => {
    if (stages.at(-1) === stage) return;
    stages.push(stage);
    options.onStage?.(stage);
  };
  const result = (
    outcome: MigrationOutcome,
    reason?: MigrationReason,
    message?: string,
    receipt?: MigrationReceipt
  ): MigrationResult => {
    if (outcome === "blocked" || outcome === "failed") emit("recovery");
    emit("complete");
    return {
      outcome,
      stages: [...stages],
      ...(reason ? { reason } : {}),
      ...(message ? { message } : {}),
      ...(receipt ? { receipt } : {})
    };
  };

  emit("discovery");
  const sourceStatus = await directoryStatus(sourceDirectory);
  const destinationStatus = await directoryStatus(destinationDirectory);
  const receipt = destinationStatus.isDirectory ? await readMigrationReceipt(destinationDirectory) : null;
  if (receipt && receipt.source === sourceDirectory && receipt.destination === destinationDirectory) {
    emit("preflight");
    emit("verification");
    try {
      await (options.validateStagedDirectory ?? validateApplicationDirectory)(destinationDirectory);
    } catch (error) {
      return result("failed", "validation-failed", `The activated Clarifold data directory failed validation: ${errorMessage(error)}.`);
    }
    return result("already-migrated", undefined, undefined, receipt);
  }

  emit("preflight");
  if (!sourceStatus.exists) return result("not-needed", "source-absent");
  if (!sourceStatus.isDirectory) return result("blocked", "source-incomplete", "The legacy Quick Study data path is not a directory.");
  if (!(await isCompleteSourceDirectory(sourceDirectory))) {
    return result("blocked", "source-incomplete", "The legacy Quick Study data directory has no complete application state file.");
  }
  if (destinationStatus.exists && (!destinationStatus.isDirectory || destinationStatus.meaningful)) {
    return result("blocked", "destination-conflict", "The Clarifold data directory already contains data; automatic migration will not merge or overwrite it.");
  }

  const lockPath = `${destinationDirectory}${MIGRATION_LOCK_SUFFIX}`;
  await mkdir(dirname(destinationDirectory), { recursive: true });
  let lockHeld = false;
  try {
    try {
      await mkdir(lockPath);
      lockHeld = true;
      await writeFile(join(lockPath, "owner.json"), `${JSON.stringify({ pid: process.pid, startedAt: (options.now ?? (() => new Date()))().toISOString() })}\n`, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600
      });
    } catch (error) {
      if (isAlreadyExists(error)) return result("blocked", "concurrent-launch", "Another Clarifold launch is already preparing this migration.");
      throw error;
    }

    const stagingDirectory = `${destinationDirectory}${MIGRATION_STAGING_SUFFIX}`;
    const existingStaging = await pathStatus(stagingDirectory);
    if (existingStaging.exists) {
      if (!existingStaging.isDirectory) return result("failed", "staging-collision", "Clarifold found an unexpected migration staging path and left it untouched.");
      await rm(stagingDirectory, { recursive: true, force: true });
    }

    const sourceBytes = await directorySize(sourceDirectory);
    const freeSpaceBytes = await (options.getFreeSpaceBytes ?? availableSpaceBytes)(dirname(destinationDirectory));
    if (freeSpaceBytes < sourceBytes) {
      return result("failed", "insufficient-space", "There is not enough free space to stage the legacy Quick Study data safely.");
    }

    emit("staging-copy");
    try {
      await copyDirectory(sourceDirectory, stagingDirectory);
    } catch (error) {
      await removeOwnedStaging(stagingDirectory);
      return result("failed", "copy-failed", `Clarifold could not stage the legacy data: ${errorMessage(error)}.`);
    }

    emit("verification");
    try {
      await (options.validateStagedDirectory ?? validateApplicationDirectory)(stagingDirectory);
    } catch (error) {
      await removeOwnedStaging(stagingDirectory);
      return result("failed", "validation-failed", `Clarifold rejected the staged data: ${errorMessage(error)}.`);
    }

    const now = options.now ?? (() => new Date());
    const startedAt = now().toISOString();
    const migrationReceipt: MigrationReceipt = {
      schemaVersion: 1,
      source: sourceDirectory,
      destination: destinationDirectory,
      applicationVersion: options.applicationVersion,
      startedAt,
      completedAt: now().toISOString(),
      outcome: "migrated"
    };
    await writeFile(join(stagingDirectory, MIGRATION_RECEIPT_NAME), `${JSON.stringify(migrationReceipt, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600
    });

    emit("atomic-commit");
    try {
      const currentDestination = await directoryStatus(destinationDirectory);
      if (currentDestination.exists && (!currentDestination.isDirectory || currentDestination.meaningful)) {
        throw new Error("The Clarifold data directory changed while migration was being prepared.");
      }
      if (currentDestination.exists) await rm(destinationDirectory, { recursive: false });
      await rename(stagingDirectory, destinationDirectory);
    } catch (error) {
      await removeOwnedStaging(stagingDirectory);
      return result("failed", "activation-failed", `Clarifold could not activate the staged data: ${errorMessage(error)}.`);
    }
    return result("migrated", undefined, undefined, migrationReceipt);
  } finally {
    if (lockHeld) await rm(lockPath, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function legacyClarifoldDataDirectory(defaultDataDirectory: string): string {
  const normalizedDefault = normalizedDirectory(defaultDataDirectory, "default");
  return join(dirname(normalizedDefault), CLARIFOLD_IDENTITY.legacyDataDirectoryName);
}

interface DirectoryStatus {
  readonly exists: boolean;
  readonly isDirectory: boolean;
  readonly meaningful: boolean;
}

async function directoryStatus(path: string): Promise<DirectoryStatus> {
  const status = await pathStatus(path);
  if (!status.exists) return status;
  if (!status.isDirectory) return status;
  return { ...status, meaningful: (await readdir(path)).length > 0 };
}

async function pathStatus(path: string): Promise<DirectoryStatus> {
  try {
    const info = await lstat(path);
    return {
      exists: true,
      isDirectory: info.isDirectory(),
      meaningful: info.isDirectory() ? (await readdir(path)).length > 0 : true
    };
  } catch (error) {
    if (isMissing(error)) return { exists: false, isDirectory: false, meaningful: false };
    throw error;
  }
}

async function isCompleteSourceDirectory(path: string): Promise<boolean> {
  const statePath = join(path, "learning-application.json");
  try {
    const info = await lstat(statePath);
    return info.isFile() && !info.isSymbolicLink();
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

async function validateApplicationDirectory(path: string): Promise<void> {
  const application = await LearningApplication.launch(path);
  if (application.getState().persistenceRecovery.status !== "ready") {
    throw new Error("the stored learner state requires blocked recovery");
  }
}

async function copyDirectory(source: string, destination: string): Promise<void> {
  const sourceInfo = await lstat(source);
  if (!sourceInfo.isDirectory() || sourceInfo.isSymbolicLink()) throw new Error("the source is not a real directory");
  await mkdir(destination, { recursive: false, mode: 0o700 });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const sourcePath = join(source, entry.name);
    const destinationPath = join(destination, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`the source contains an unsupported symbolic link (${entry.name})`);
    if (entry.isDirectory()) await copyDirectory(sourcePath, destinationPath);
    else if (entry.isFile()) await copyFile(sourcePath, destinationPath);
    else throw new Error(`the source contains an unsupported filesystem entry (${entry.name})`);
  }
}

async function directorySize(path: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const entryPath = join(path, entry.name);
    if (entry.isDirectory()) total += await directorySize(entryPath);
    else if (entry.isFile()) total += (await stat(entryPath)).size;
  }
  return total;
}

async function availableSpaceBytes(path: string): Promise<number> {
  const filesystem = await statfs(path);
  return Number(filesystem.bavail) * Number(filesystem.bsize);
}

async function removeOwnedStaging(path: string): Promise<void> {
  try {
    const info = await lstat(path);
    if (info.isDirectory() && !info.isSymbolicLink()) await rm(path, { recursive: true, force: true });
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
}

async function readMigrationReceipt(path: string): Promise<MigrationReceipt | null> {
  try {
    const raw = JSON.parse(await readFile(join(path, MIGRATION_RECEIPT_NAME), "utf8")) as Record<string, unknown>;
    if (raw.schemaVersion !== 1 || raw.outcome !== "migrated"
      || typeof raw.source !== "string" || typeof raw.destination !== "string"
      || typeof raw.applicationVersion !== "string" || typeof raw.startedAt !== "string"
      || typeof raw.completedAt !== "string") return null;
    return raw as unknown as MigrationReceipt;
  } catch (error) {
    if (isMissing(error) || error instanceof SyntaxError) return null;
    throw error;
  }
}

function normalizedDirectory(path: string, label: string): string {
  if (!isAbsolute(path)) throw new Error(`The migration ${label} directory must be absolute.`);
  const normalized = resolve(path);
  if (normalized === dirname(normalized) || !normalized.startsWith(`${dirname(normalized)}${sep}`)) {
    throw new Error(`The migration ${label} directory must be an absolute child path.`);
  }
  return normalized;
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}

function isAlreadyExists(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "EEXIST");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
