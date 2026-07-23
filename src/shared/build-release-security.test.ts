import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// @ts-expect-error The release helper is an executable-side JavaScript module.
import { assertRealDirectory, assertRealFile } from "../../scripts/release-integrity.mjs";

const root = process.cwd();

describe("build and release security contract", () => {
  it("pins every third-party workflow action and limits the verification token", async () => {
    const workflow = await readFile(join(root, ".github/workflows/macos-ci.yml"), "utf8");
    const actionRefs = [...workflow.matchAll(/^\s+- uses: ([^\s]+)\s+# v\d+$/gm)].map((match) => match[1]);

    expect(actionRefs).toHaveLength(7);
    expect(actionRefs.every((ref) => /^[^@]+@[0-9a-f]{40}$/.test(ref))).toBe(true);
    expect(workflow).toMatch(/permissions:\s*\{\}/);
    expect(workflow).toMatch(/verify:\n\s+permissions:\n\s+contents: read/);
  });

  it("exposes the dependency and Swift security checks as repository commands", async () => {
    const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    const remediation = await readFile(join(
      root,
      "docs/security/build-release-security-remediation-2026-07-23.md"
    ), "utf8");

    expect(packageJson.scripts["security:dependencies"]).toBe(
      "npm audit --omit=dev --audit-level=high"
    );
    expect(packageJson.scripts["security:swift"]).toBe(
      "xcrun swiftc -warnings-as-errors -typecheck native/source-index-extractor.swift -framework AppKit -framework Foundation -framework ImageIO -framework PDFKit -framework Vision && xcrun swiftc -warnings-as-errors -typecheck native/source-bookmark-helper.swift -framework Foundation && xcrun swiftc -warnings-as-errors -typecheck tests/fixtures/create-scanned-pdf.swift -framework AppKit -framework Foundation -framework PDFKit"
    );
    expect(remediation).toContain("npm audit --omit=dev --audit-level=high");
    expect(remediation).toContain("development-only");
    expect(remediation).toContain("review-by");
  });

  it("rejects a symlink in the packaged application root", async () => {
    const directory = await mkdtemp(join(tmpdir(), "clarifold-release-security-"));
    const realDirectory = join(directory, "real.app");
    const linkedDirectory = join(directory, "linked.app");
    const realFile = join(directory, "archive.zip");
    const linkedFile = join(directory, "linked.zip");
    await mkdir(join(realDirectory, "Contents"), { recursive: true });
    await writeFile(join(realDirectory, "Contents", "Info.plist"), "placeholder");
    await writeFile(realFile, "placeholder");
    await symlink(realDirectory, linkedDirectory, "dir");
    await symlink(realFile, linkedFile, "file");

    await expect(assertRealDirectory(realDirectory, "application root")).resolves.toBeUndefined();
    await expect(assertRealDirectory(linkedDirectory, "application root"))
      .rejects.toThrow("must not be a symbolic link");
    await expect(assertRealFile(realFile, "beta archive")).resolves.toBeUndefined();
    await expect(assertRealFile(linkedFile, "beta archive"))
      .rejects.toThrow("must not be a symbolic link");

    await rm(directory, { recursive: true, force: true });
  });
});
