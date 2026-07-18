import { createHash } from "node:crypto";
import { basename, extname, join, relative, sep } from "node:path";
import type {
  AvailableLinkedSourceView,
  LinkedSource,
  LocalSourceAccess,
  SelectedLocalSource,
  SourceIndexExtraction,
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
  extractText?(path: string): Promise<string>;
  createThumbnail?(path: string): Promise<string>;
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

  async extractForIndex(source: LinkedSource): Promise<SourceIndexExtraction> {
    const stopAccess = source.link.accessGrant
      ? this.dependencies.startAccessingSecurityScopedResource(source.link.accessGrant.bookmarkData)
      : null;
    try {
      const view = await this.read(source);
      const extractionMethod = view.mediaType === "text/plain"
        ? "embeddedText"
        : view.mediaType === "application/pdf"
          ? "pdfText"
          : view.mediaType === "image/png" || view.mediaType === "image/jpeg"
            ? "ocr"
            : null;
      if (!extractionMethod) throw new Error("This source type does not have indexable mathematical content.");
      const extractedText = view.mediaType === "text/plain"
        ? view.content
        : await this.dependencies.extractText?.(source.link.lastKnownPath);
      if (!extractedText?.trim() || extractedText.trim() === "(null)") {
        throw new Error(view.mediaType === "application/pdf"
          ? "No searchable text could be extracted from this PDF."
          : "No text could be recognized in this image.");
      }
      let thumbnailDataUrl = EMPTY_THUMBNAIL_DATA_URL;
      try {
        thumbnailDataUrl = await this.dependencies.createThumbnail?.(source.link.lastKnownPath)
          ?? EMPTY_THUMBNAIL_DATA_URL;
      } catch {
        // Search remains useful when Quick Look cannot thumbnail a supported text source.
      }
      return sourceIndexExtraction(extractedText, extractionMethod, thumbnailDataUrl);
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

const EMPTY_THUMBNAIL_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X2NDWQAAAABJRU5ErkJggg==";

function sourceIndexExtraction(
  content: string,
  extractionMethod: SourceIndexExtraction["extractionMethod"],
  thumbnailDataUrl: string
): SourceIndexExtraction {
  let pageStartOffset = 0;
  return {
    extractionMethod,
    pages: content.split("\f").map((pageText, pageIndex) => {
      const lines = [...pageText.matchAll(/[^\r\n]+/g)];
      const lineHeight = 1 / Math.max(lines.length, 1);
      const regions = lines.flatMap((lineMatch, lineIndex) => {
        const line = lineMatch[0];
        const trimmed = line.trim();
        const leadingWhitespace = line.indexOf(trimmed);
        const startOffset = pageStartOffset + lineMatch.index + Math.max(leadingWhitespace, 0);
        if (!trimmed) return [];
        const bounds = {
          x: 0.05,
          y: lineIndex * lineHeight,
          width: 0.9,
          height: Math.min(lineHeight, 0.08)
        };
        const offsets = extractionMethod === "embeddedText"
          ? { sourceStartOffset: startOffset, sourceEndOffset: startOffset + trimmed.length }
          : {};
        const textRegion = { kind: "text" as const, text: trimmed, bounds, ...offsets };
        const equations = [...trimmed.matchAll(/\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^$\n]+?\$|\\\([\s\S]+?\\\)/g)].map((match) => {
          const equationStart = match.index;
          const equationWidth = Math.max(0.03, Math.min(0.9, match[0].length / Math.max(trimmed.length, 1) * 0.9));
          return {
            kind: "equation" as const,
            text: match[0],
            bounds: {
              x: Math.min(0.95 - equationWidth, 0.05 + equationStart / Math.max(trimmed.length, 1) * 0.9),
              y: bounds.y,
              width: equationWidth,
              height: bounds.height
            },
            ...(extractionMethod === "embeddedText" ? {
              sourceStartOffset: startOffset + equationStart,
              sourceEndOffset: startOffset + equationStart + match[0].length
            } : {})
          };
        });
        return [textRegion, ...equations];
      });
      pageStartOffset += pageText.length + 1;
      return {
        pageNumber: pageIndex + 1,
        width: 1000,
        height: 1400,
        thumbnailDataUrl,
        regions
      };
    })
  };
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
