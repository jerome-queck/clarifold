import assert from "node:assert/strict";
import test from "node:test";

import { verifyWorkspace } from "./verify-workspace.mjs";

test("accepts a clean Clarifold workspace with the supported toolchain", () => {
  const result = verifyWorkspace({
    rootDirectory: "/workspace/Clarifold",
    repositoryRoot: "/workspace/Clarifold",
    retiredDirectory: "/workspace/Retired",
    retiredDirectoryExists: false,
    originUrl: "https://github.com/jerome-queck/clarifold.git",
    branch: "main",
    status: "",
    nodeVersion: "v24.18.0",
    npmVersion: "11.16.0",
    availableCommands: ["git", "node", "npm", "gh"],
    availablePaths: ["AGENTS.md", "package.json", "package-lock.json", ".agents/skills"],
    retiredPathReferences: [
      { path: "docs/adr/0029-name-the-product-clarifold.md", line: 11 },
    ],
  });

  assert.deepEqual(result, { ok: true, errors: [] });
});

test("reports every failed final-workspace contract without collapsing the causes", () => {
  const result = verifyWorkspace({
    rootDirectory: "/workspace/Legacy",
    repositoryRoot: "/workspace/Legacy",
    retiredDirectory: "/workspace/Clarifold",
    retiredDirectoryExists: true,
    originUrl: "git@github.com:someone/else.git",
    branch: "codex/104-rename-clarifold-workspace",
    status: " M README.md",
    nodeVersion: "v26.5.0",
    npmVersion: "10.8.2",
    availableCommands: ["git", "node"],
    availablePaths: ["package.json"],
    retiredPathReferences: [
      { path: "docs/adr/0029-name-the-product-clarifold.md", line: 11 },
      { path: "scripts/local-launch.sh", line: 4 },
    ],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [
    "workspace directory must be named Clarifold (got Legacy)",
    "retired workspace directory still exists: /workspace/Clarifold",
    "origin must be https://github.com/jerome-queck/clarifold.git (got git@github.com:someone/else.git)",
    "workspace must be on main (got codex/104-rename-clarifold-workspace)",
    "workspace must be clean",
    "Node.js must be major version 22 or 24 (got v26.5.0)",
    "npm must be major version 11 (got 10.8.2)",
    "required commands are unavailable: npm, gh",
    "required workspace surfaces are missing: AGENTS.md, package-lock.json, .agents/skills",
    "tracked files reference the retired workspace path outside approved historical records: scripts/local-launch.sh:4",
  ]);
});
