import { basename } from "node:path";
import type { LinkedSource, SelectedLocalSource, SourceFingerprint } from "../shared/learning-application";

interface FileStat {
  size: number;
  mtimeMs: number;
  isFile(): boolean;
  isDirectory(): boolean;
}

interface SourceAccessDependencies {
  showOpenDialog(options: {
    properties: Array<"openFile" | "openDirectory">;
    securityScopedBookmarks: true;
    title: string;
    buttonLabel: string;
  }): Promise<{ canceled: boolean; filePaths: string[]; bookmarks?: string[] }>;
  stat(path: string): Promise<FileStat>;
  readFile(path: string, encoding: "utf8"): Promise<string>;
  readdir(path: string): Promise<string[]>;
  startAccessingSecurityScopedResource(bookmarkData: string): () => void;
}

export interface LinkedSourceView {
  sourceId: string;
  resourceType: "file" | "folder";
  content: string;
  fingerprint: SourceFingerprint;
}

export class MacOsSourceAccess {
  constructor(private readonly dependencies: SourceAccessDependencies) {}

  async select(resourceType: "file" | "folder"): Promise<SelectedLocalSource | null> {
    const result = await this.dependencies.showOpenDialog({
      properties: [resourceType === "file" ? "openFile" : "openDirectory"],
      securityScopedBookmarks: true,
      title: resourceType === "file" ? "Choose an External Attachment" : "Choose a Primary Folder",
      buttonLabel: resourceType === "file" ? "Link Attachment" : "Link Primary Folder"
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return this.describePath(result.filePaths[0], resourceType, result.bookmarks?.[0]);
  }

  async selectDirectPath(path: string, resourceType: "file" | "folder"): Promise<SelectedLocalSource> {
    return this.describePath(path, resourceType);
  }

  async read(source: LinkedSource): Promise<LinkedSourceView> {
    const stopAccess = source.link.accessGrant.kind === "securityScopedBookmark"
      ? this.dependencies.startAccessingSecurityScopedResource(source.link.accessGrant.bookmarkData)
      : null;
    try {
      const stat = await this.dependencies.stat(source.link.lastKnownPath);
      const content = source.resourceType === "file"
        ? await this.dependencies.readFile(source.link.lastKnownPath, "utf8")
        : (await this.dependencies.readdir(source.link.lastKnownPath)).sort().join("\n");
      return {
        sourceId: source.id,
        resourceType: source.resourceType,
        content,
        fingerprint: fingerprint(stat)
      };
    } finally {
      stopAccess?.();
    }
  }

  private async describePath(
    path: string,
    resourceType: "file" | "folder",
    bookmarkData?: string
  ): Promise<SelectedLocalSource> {
    const stat = await this.dependencies.stat(path);
    if (resourceType === "file" ? !stat.isFile() : !stat.isDirectory()) {
      throw new Error(resourceType === "file" ? "Choose an existing file." : "Choose an existing folder.");
    }
    return {
      name: basename(path),
      resourceType,
      lastKnownPath: path,
      accessGrant: bookmarkData
        ? { kind: "securityScopedBookmark", bookmarkData }
        : { kind: "directPath" },
      fingerprint: fingerprint(stat)
    };
  }
}

function fingerprint(stat: FileStat): SourceFingerprint {
  return { size: stat.size, modifiedAtMs: stat.mtimeMs };
}
