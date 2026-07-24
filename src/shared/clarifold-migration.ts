export type MigrationStage =
  | "discovery"
  | "preflight"
  | "staging-copy"
  | "verification"
  | "atomic-commit"
  | "recovery"
  | "complete";

export type MigrationOutcome = "not-needed" | "migrated" | "already-migrated" | "blocked" | "failed";
export type MigrationStatusOutcome = MigrationOutcome | "migrating";

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
  readonly retryState: "idempotent";
}

export interface MigrationRecoveryReceipt {
  readonly schemaVersion: 1;
  readonly source: string;
  readonly destination: string;
  readonly applicationVersion: string;
  readonly updatedAt: string;
  readonly outcome: "blocked" | "failed";
  readonly reason: MigrationReason;
  readonly retryState: "safe-to-retry" | "manual-intervention-required";
  readonly message: string;
}

export interface MigrationResult {
  readonly outcome: MigrationOutcome;
  readonly stages: MigrationStage[];
  readonly reason?: MigrationReason;
  readonly message?: string;
  readonly receipt?: MigrationReceipt;
}

/** Safe to expose to the renderer: it deliberately excludes data-directory paths and learner content. */
export interface MigrationStatus {
  readonly outcome: MigrationStatusOutcome;
  readonly stages: MigrationStage[];
  readonly reason?: MigrationReason;
  readonly message?: string;
  readonly retryState?: "idempotent" | "safe-to-retry" | "manual-intervention-required";
}
