// @vitest-environment node

import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

describe("macOS beta release contract", () => {
  it("makes a versioned zip and validates an installed copy in the smoke lane", async () => {
    const packageJson = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8"));
    const forgeConfig = require(join(process.cwd(), "forge.config.js"));

    expect(forgeConfig.packagerConfig).toMatchObject({
      appBundleId: "com.jeromequeck.quick-study",
      appCategoryType: "public.app-category.education"
    });
    expect(forgeConfig.makers).toEqual([
      expect.objectContaining({ name: "@electron-forge/maker-zip" })
    ]);
    expect(forgeConfig.packagerConfig.ignore.some((pattern: RegExp) =>
      pattern.test("/node_modules/.cache/quick-study-lean/archive.zip"))).toBe(true);
    expect(forgeConfig.packagerConfig.ignore.some((pattern: RegExp) =>
      pattern.test("/out/Quick Study-darwin-arm64/Quick Study.app"))).toBe(true);
    expect(forgeConfig.packagerConfig.ignore.some((pattern: RegExp) =>
      pattern.test("/test-results/installed-beta/Quick Study.app"))).toBe(true);
    expect(packageJson.scripts["make:beta"]).toBe(
      "electron-forge make --platform=darwin --skip-package"
    );
    expect(packageJson.scripts["test:smoke"]).toContain("install-beta-for-smoke.mjs");
    expect(packageJson.scripts.verify).toContain("npm run make:beta && npm run test:smoke");
  });
});
