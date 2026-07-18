import { createHash } from "node:crypto";
import { basename, extname, join, relative, sep } from "node:path";
import type {
  AvailableLinkedSourceView,
  LinkedSource,
  LocalSourceAccess,
  SelectedLocalSource,
  SourceFingerprint
} from "../shared/learning-application";

const MAX_SOURCE_VIEW_BYTES = 25 * 1024 * 1024;

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
  realpath(path: string): Promise<string>;
  readFile(path: string): Promise<Buffer>;
  readdir(path: string): Promise<string[]>;
  startAccessingSecurityScopedResource(bookmarkData: string): () => void;
}

export class MacOsSourceAccess implements LocalSourceAccess {
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

  async read(source: LinkedSource): Promise<AvailableLinkedSourceView> {
    const stopAccess = source.link.accessGrant
      ? this.dependencies.startAccessingSecurityScopedResource(source.link.accessGrant.bookmarkData)
      : null;
    try {
      const stat = await this.dependencies.stat(source.link.lastKnownPath);
      if (source.resourceType === "file" && stat.size > MAX_SOURCE_VIEW_BYTES) {
        throw new Error("This source is too large for the read-only preview.");
      }
      const mediaType = source.resourceType === "folder" ? "text/plain" : sourceMediaType(source.name);
      const content = source.resourceType === "folder"
        ? await this.readSupportedFolder(source.link.lastKnownPath)
        : sourceContent(await this.dependencies.readFile(source.link.lastKnownPath), mediaType);
      return {
        sourceId: source.id,
        resourceType: source.resourceType,
        content,
        mediaType,
        fingerprint: fingerprint(stat, source.resourceType === "folder" ? content : undefined)
      };
    } finally {
      stopAccess?.();
    }
  }

  private async readSupportedFolder(rootPath: string): Promise<string> {
    const canonicalRoot = await this.dependencies.realpath(rootPath);
    const sections: string[] = [];
    const visitedDirectories = new Set<string>();
    let totalBytes = 0;
    const visit = async (directoryPath: string): Promise<void> => {
      const canonicalDirectory = await this.dependencies.realpath(directoryPath);
      if (visitedDirectories.has(canonicalDirectory)) return;
      visitedDirectories.add(canonicalDirectory);
      for (const name of (await this.dependencies.readdir(directoryPath)).sort()) {
        const candidatePath = join(directoryPath, name);
        const canonicalPath = await this.dependencies.realpath(candidatePath);
        const relativePath = relative(canonicalRoot, canonicalPath);
        if (relativePath === "" || relativePath === ".." || relativePath.startsWith(`..${sep}`)) continue;
        const stat = await this.dependencies.stat(canonicalPath);
        if (stat.isDirectory()) {
          await visit(canonicalPath);
          continue;
        }
        if (!stat.isFile() || sourceMediaType(name) !== "text/plain") continue;
        totalBytes += stat.size;
        if (totalBytes > MAX_SOURCE_VIEW_BYTES) {
          throw new Error("This folder's supported files are too large for the read-only preview.");
        }
        const content = await this.dependencies.readFile(canonicalPath);
        sections.push(`--- ${relativePath} ---\n${content.toString("utf8")}`);
      }
    };
    await visit(canonicalRoot);
    return sections.join("\n\n");
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
      name: basename(path) || path,
      resourceType,
      lastKnownPath: path,
      canonicalPath: await this.dependencies.realpath(path),
      accessGrant: bookmarkData
        ? { kind: "securityScopedBookmark", bookmarkData }
        : null,
      fingerprint: fingerprint(stat, resourceType === "folder" ? await this.readSupportedFolder(path) : undefined)
    };
  }
}

function fingerprint(stat: FileStat, content?: string): SourceFingerprint {
  return {
    size: stat.size,
    modifiedAtMs: stat.mtimeMs,
    ...(content === undefined ? {} : { contentHash: createHash("sha256").update(content).digest("hex") })
  };
}

function sourceMediaType(name: string): AvailableLinkedSourceView["mediaType"] {
  switch (extname(name).toLocaleLowerCase()) {
    case ".pdf": return "application/pdf";
    case ".png": return "image/png";
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".txt":
    case ".md":
    case ".tex":
    case ".lean":
    case ".csv": return "text/plain";
    default: return "application/octet-stream";
  }
}

function sourceContent(content: Buffer, mediaType: AvailableLinkedSourceView["mediaType"]): string {
  return mediaType === "text/plain"
    ? content.toString("utf8")
    : `data:${mediaType};base64,${content.toString("base64")}`;
}
