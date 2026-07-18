import { describe, expect, it, vi } from "vitest";
import type { LinkedSource } from "../shared/learning-application";
import { MacOsSourceAccess } from "./source-access";

describe("macOS source access", () => {
  it("requests a read-only security-scoped bookmark for a selected file", async () => {
    const showOpenDialog = vi.fn().mockResolvedValue({
      canceled: false,
      filePaths: ["/Users/learner/notes/lecture.pdf"],
      bookmarks: ["opaque-bookmark"]
    });
    const access = new MacOsSourceAccess({
      showOpenDialog,
      stat: vi.fn().mockResolvedValue(fileStat()),
      readFile: vi.fn(),
      readdir: vi.fn(),
      startAccessingSecurityScopedResource: vi.fn()
    });

    const selected = await access.select("file");

    expect(showOpenDialog).toHaveBeenCalledWith(expect.objectContaining({
      properties: ["openFile"],
      securityScopedBookmarks: true
    }));
    expect(selected).toMatchObject({
      name: "lecture.pdf",
      resourceType: "file",
      lastKnownPath: "/Users/learner/notes/lecture.pdf",
      accessGrant: { kind: "securityScopedBookmark", bookmarkData: "opaque-bookmark" },
      fingerprint: { size: 128, modifiedAtMs: 1234 }
    });
  });

  it("balances security-scoped access around a read-only file view", async () => {
    const stopAccess = vi.fn();
    const readFile = vi.fn().mockResolvedValue("A compact space admits a finite subcover.");
    const startAccess = vi.fn().mockReturnValue(stopAccess);
    const access = new MacOsSourceAccess({
      showOpenDialog: vi.fn(),
      stat: vi.fn().mockResolvedValue(fileStat()),
      readFile,
      readdir: vi.fn(),
      startAccessingSecurityScopedResource: startAccess
    });

    const view = await access.read(linkedFile());

    expect(startAccess).toHaveBeenCalledWith("opaque-bookmark");
    expect(readFile).toHaveBeenCalledWith("/Users/learner/notes/lecture.txt", "utf8");
    expect(stopAccess).toHaveBeenCalledOnce();
    expect(view.content).toContain("finite subcover");
  });

  it("stops security-scoped access when reading fails", async () => {
    const stopAccess = vi.fn();
    const access = new MacOsSourceAccess({
      showOpenDialog: vi.fn(),
      stat: vi.fn().mockResolvedValue(fileStat()),
      readFile: vi.fn().mockRejectedValue(new Error("volume unavailable")),
      readdir: vi.fn(),
      startAccessingSecurityScopedResource: vi.fn().mockReturnValue(stopAccess)
    });

    await expect(access.read(linkedFile())).rejects.toThrow("volume unavailable");
    expect(stopAccess).toHaveBeenCalledOnce();
  });
});

function fileStat() {
  return { size: 128, mtimeMs: 1234, isFile: () => true, isDirectory: () => false };
}

function linkedFile(): LinkedSource {
  return {
    id: "source-1",
    kind: "linkedSource",
    role: "externalAttachment",
    workspaceId: "workspace-1",
    name: "lecture.txt",
    resourceType: "file",
    link: {
      lastKnownPath: "/Users/learner/notes/lecture.txt",
      accessGrant: { kind: "securityScopedBookmark", bookmarkData: "opaque-bookmark" },
      fingerprint: { size: 128, modifiedAtMs: 1234 },
      accessStatus: "available",
      error: null
    }
  };
}
