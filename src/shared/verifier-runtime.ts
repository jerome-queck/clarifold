export interface VerificationEnvironment {
  id: string;
  checker: string;
  leanVersion: string;
  mathlibVersion: string | null;
  platform: string;
}

export const BUNDLED_LEAN_ENVIRONMENT: Readonly<VerificationEnvironment> = Object.freeze({
  id: "lean-4.29.1-core-v1",
  checker: "Lean",
  leanVersion: "4.29.1",
  mathlibVersion: null,
  platform: "darwin"
});

export interface Formalization {
  exactClaim: string;
  formalStatement: string;
  assumptions: string[];
  proofSource: string;
}

export interface VerifierRunRequest extends Formalization {
  runId: string;
  evidenceDirectory: string;
}

export type VerifierCommandOutcome = "accepted" | "rejected" | "timedOut" | "cancelled"
  | "unsupported" | "unavailable" | "crashed" | "malformedOutput" | "versionMismatch";

export interface VerifierRunResult {
  outcome: VerifierCommandOutcome;
  diagnostics: string;
  evidenceLocation: string;
  command: string;
  environment: Readonly<VerificationEnvironment>;
}

export interface VerifierRuntime {
  run(request: VerifierRunRequest, signal?: AbortSignal): Promise<VerifierRunResult>;
}

const KNOWN_CLAIM = "For every natural number n, n + 0 = n.";

export function formalizationForClaim(exactClaim: string): Formalization | null {
  if (exactClaim.trim() !== KNOWN_CLAIM) return null;
  return {
    exactClaim: KNOWN_CLAIM,
    formalStatement: "theorem quickStudyNatAddZero (n : Nat) : n + 0 = n",
    assumptions: ["n : Nat"],
    proofSource: "theorem quickStudyNatAddZero (n : Nat) : n + 0 = n := by\n  rfl\n"
  };
}
