import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BUNDLED_LEAN_ENVIRONMENT, formalizationForClaim } from "../shared/verifier-runtime";
import { LeanVerifierRuntime, type LeanCommandExecutor } from "./lean-verifier";

const directories: string[] = [];

afterEach(async () => Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

async function request() {
  const evidenceDirectory = await mkdtemp(join(tmpdir(), "quick-study-lean-test-"));
  directories.push(evidenceDirectory);
  return {
    runId: "run-1",
    evidenceDirectory,
    ...formalizationForClaim("For every natural number n, n + 0 = n.")!
  };
}

function scripted(...results: Array<Awaited<ReturnType<LeanCommandExecutor>>>): LeanCommandExecutor {
  return async () => {
    const result = results.shift();
    if (!result) throw new Error("Unexpected Lean invocation.");
    return result;
  };
}

describe("LeanVerifierRuntime", () => {
  it("leaves an unsupported exact claim without an invented formal translation", () => {
    expect(formalizationForClaim("Every continuous function is differentiable.")).toBeNull();
  });

  it("accepts an exact statement with the pinned bundled version and preserves its proof evidence", async () => {
    const runtime = new LeanVerifierRuntime("/bundle/bin/lean", scripted(
      { stdout: "Lean (version 4.29.1, aarch64-apple-darwin)", stderr: "", exitCode: 0, signal: null },
      { stdout: "", stderr: "", exitCode: 0, signal: null }
    ));

    const result = await runtime.run(await request());

    expect(result).toMatchObject({ outcome: "accepted", environment: BUNDLED_LEAN_ENVIRONMENT });
    expect(await readFile(result.evidenceLocation, "utf8")).toContain("theorem quickStudyNatAddZero");
  });

  it.each([
    ["rejection", { stdout: "", stderr: "type mismatch", exitCode: 1, signal: null }, "rejected"],
    ["timeout", { stdout: "", stderr: "timed out", exitCode: null, signal: "SIGTERM", timedOut: true }, "timedOut"],
    ["cancellation", { stdout: "", stderr: "cancelled", exitCode: null, signal: "SIGTERM", cancelled: true }, "cancelled"],
    ["tool crash", { stdout: "", stderr: "segmentation fault", exitCode: null, signal: "SIGSEGV" }, "crashed"]
  ] as const)("reports %s without treating it as mathematical disproof", async (_label, commandResult, outcome) => {
    const runtime = new LeanVerifierRuntime("/bundle/bin/lean", scripted(
      { stdout: "Lean (version 4.29.1, aarch64-apple-darwin)", stderr: "", exitCode: 0, signal: null },
      commandResult
    ));
    expect(await runtime.run(await request())).toMatchObject({ outcome, diagnostics: expect.any(String) });
  });

  it("reports an unavailable checker", async () => {
    const runtime = new LeanVerifierRuntime("/missing/lean", async () => {
      const error = Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" });
      throw error;
    });
    expect(await runtime.run(await request())).toMatchObject({ outcome: "unavailable" });
  });

  it("rejects malformed command output", async () => {
    const runtime = new LeanVerifierRuntime("/bundle/bin/lean", async () => ({ stdout: 42 } as never));
    expect(await runtime.run(await request())).toMatchObject({ outcome: "malformedOutput" });
  });

  it("refuses a different Lean version before checking the proof", async () => {
    const runtime = new LeanVerifierRuntime("/bundle/bin/lean", scripted(
      { stdout: "Lean (version 4.28.0, aarch64-apple-darwin)", stderr: "", exitCode: 0, signal: null }
    ));
    expect(await runtime.run(await request())).toMatchObject({ outcome: "versionMismatch" });
  });
});
