import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import {
  ModelAccessError,
  type AuthenticationState,
  type ModelAccessCause,
  type ModelRuntime,
  type ModelRuntimeEvent,
  type RuntimeAccessDecision,
  type RuntimeAccessRequest,
  type TeachingSourceContext,
  type SessionProposal
} from "./model-runtime";
import { sessionAccessPolicyLabel, type SessionAccessPolicy } from "./session-access";
export type { SessionAccessPolicy } from "./session-access";

const MAX_TEACHING_SOURCE_CONTEXT_CHARACTERS = 60_000;

export type SessionStatus = "active" | "paused";

export interface SessionAccessScope {
  policy: SessionAccessPolicy;
  sourceIds: string[];
  allowsBroadLocalRead: boolean;
  allowsSourceModification: false;
}

export interface SessionAccessRequest {
  id: string;
  requestedPolicy: Exclude<SessionAccessPolicy, "focused">;
  reason: string;
  exactScope: string;
  intendedAction: string;
  status: "pending" | "approved" | "denied" | "narrowed";
  decidedPolicy: SessionAccessPolicy | null;
}

export type ModelAccessState =
  | { status: "available" }
  | { status: "unavailable"; cause: ModelAccessCause; message: string };

export interface PendingQuestion {
  id: string;
  text: string;
}

export type SourceAnchorPaletteAction = "explain" | "question" | "annotate" | "addToLearningTrail";

export interface SourceTextLocation {
  startOffset: number;
  endOffset: number;
  exactText: string;
  prefix: string;
  suffix: string;
}

export interface NormalizedSourceRegionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type SourceAnchorSelection =
  | ({ kind: "text" } & SourceTextLocation)
  | ({
      kind: "equation";
      equationIndex: number;
    } & SourceTextLocation)
  | {
      kind: "diagramRegion";
      bounds: NormalizedSourceRegionBounds;
    };

export interface SourceAnchor {
  id: string;
  sourceId: string;
  selection: SourceAnchorSelection;
}

export interface SourceAnchorRequest {
  id: string;
  sourceAnchorId: string;
  action: SourceAnchorPaletteAction;
}

export interface SubmittedPendingQuestion {
  id: string;
  text: string;
  teachingCard: TeachingCardState;
}

export interface TeachingCardState {
  status: "idle" | "streaming" | "completed" | "stopped" | "failed";
  content: string;
  error: string | null;
  retryable: boolean;
}

export interface SessionSearchResult {
  sessionId: string;
  learningGoal: string;
  sessionTarget: string;
  workspaceName: string;
  missionName: string;
}

export interface SourceIndexBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SourceIndexRegion {
  kind: "text" | "equation";
  text: string;
  bounds: SourceIndexBounds;
  sourceStartOffset?: number;
  sourceEndOffset?: number;
}

export interface SourceIndexPage {
  pageNumber: number;
  width: number;
  height: number;
  thumbnailDataUrl: string;
  regions: SourceIndexRegion[];
}

export interface SourceIndexExtraction {
  extractionMethod: "embeddedText" | "pdfText" | "ocr";
  pages: SourceIndexPage[];
}

export interface SourceIndexSummary {
  sourceId: string;
  status: "ready" | "cleared" | "unavailable";
  extractionMethod: SourceIndexExtraction["extractionMethod"] | null;
  pageCount: number;
  equationCount: number;
  error: string | null;
}

export interface SourceSearchResult {
  id: string;
  sourceId: string;
  sourceName: string;
  workspaceName: string;
  locationLabel: string;
  preview: string;
  thumbnailDataUrl: string;
  match: {
    pageNumber: number;
    bounds: SourceIndexBounds;
    kind: SourceIndexRegion["kind"];
    sourceStartOffset?: number;
    sourceEndOffset?: number;
  };
}

export type OpenedSourceSearchResult = LinkedSourceView & {
  highlight?: {
    pageNumber: number;
    exactText: string;
    bounds: SourceIndexBounds;
    thumbnailDataUrl: string;
    sourceStartOffset?: number;
    sourceEndOffset?: number;
  };
};

interface CachedSourceIndexRegion extends Omit<SourceIndexRegion, "text"> {
  termHashes: string[];
}

interface CachedSourceIndexPage extends Omit<SourceIndexPage, "regions"> {
  regions: CachedSourceIndexRegion[];
}

interface SourceIndexDocument {
  sourceId: string;
  sourceName: string;
  workspaceId: string;
  fingerprint: SourceFingerprint;
  extractionMethod: SourceIndexExtraction["extractionMethod"];
  pages: CachedSourceIndexPage[];
}

export interface QuickStudyHome {
  workspace: {
    id: "quick-study-workspace";
    kind: "system";
    name: "Quick Study";
  };
  mission: {
    id: "quick-study-unfiled-mission";
    kind: "unfiled";
    workspaceId: "quick-study-workspace";
  };
}

export interface StudyWorkspace {
  id: string;
  kind: "system" | "named";
  name: string;
  context: WorkspaceContext;
}

export interface WorkspaceContext {
  sourceIds: string[];
  learnerContextIds: string[];
  primaryFolderSourceId: string | null;
}

export interface SourceFingerprint {
  size: number;
  modifiedAtMs: number;
  contentHash?: string;
}

export type LocalSourceAccessGrant = { kind: "securityScopedBookmark"; bookmarkData: string } | null;

export interface SelectedLocalSource {
  name: string;
  resourceType: "file" | "folder";
  lastKnownPath: string;
  canonicalPath: string;
  accessGrant: LocalSourceAccessGrant;
  fingerprint: SourceFingerprint;
}

export interface LinkedSource {
  id: string;
  kind: "linkedSource";
  role: "primaryFolder" | "externalAttachment";
  workspaceId: string;
  name: string;
  resourceType: "file" | "folder";
  link: {
    lastKnownPath: string;
    canonicalPath: string;
    accessGrant: LocalSourceAccessGrant;
    fingerprint: SourceFingerprint;
    accessStatus: "available" | "unavailable";
    error: string | null;
  };
}

export interface ManagedAsset {
  id: string;
  kind: "managedAsset";
  workspaceId: string;
  name: string;
  mediaType: "text/plain";
  content: string;
}

export type WorkspaceSource = LinkedSource | ManagedAsset;

export interface AvailableLinkedSourceView {
  sourceId: string;
  resourceType: "file" | "folder";
  content: string;
  mediaType: "text/plain" | "application/pdf" | "image/png" | "image/jpeg" | "inode/directory" | "application/octet-stream";
  fingerprint: SourceFingerprint;
}

export interface LocalSourceAccess {
  read(source: LinkedSource): Promise<AvailableLinkedSourceView>;
  extractForIndex(source: LinkedSource): Promise<SourceIndexExtraction>;
}

export type LinkedSourceView =
  | ({ status: "available" } & AvailableLinkedSourceView)
  | { status: "unavailable"; sourceId: string; error: string };

export interface StudyMission {
  id: string;
  kind: "unfiled" | "named";
  workspaceId: string;
  name: string;
}

export interface StudyLocation {
  workspaceId: string;
  missionId: string;
}

export interface LearningSession {
  id: string;
  workspaceId: string;
  missionId: string;
  mathematics: string;
  sourceIds: string[];
  learningGoal: string;
  sessionTarget: string;
  status: SessionStatus;
  activityOrder: number;
  returnContext: {
    label: string;
    nextAction: string;
  };
  proposal: {
    scope: string;
    initialTeachingDirection: string;
    status: "accepted" | "awaitingConfirmation";
    confirmationReason: string | null;
  };
  teachingCard: TeachingCardState;
  teachingCardHistory: TeachingCardState[];
  submittedPendingQuestions: SubmittedPendingQuestion[];
  currentTeachingInput: { kind: "sessionIntake"; text: string } | { kind: "pendingQuestion"; submissionId: string; text: string };
  pendingQuestion: PendingQuestion | null;
  accessPolicy: SessionAccessPolicy;
  accessRequests: SessionAccessRequest[];
  pendingFullAccessConfirmation: boolean;
  sourceAnchors: SourceAnchor[];
  sourceAnchorRequests: SourceAnchorRequest[];
  activeSourceAnchorId: string | null;
}

export interface LearningApplicationState {
  screen: "dashboard" | "workbench";
  quickStudy: QuickStudyHome;
  workspaces: StudyWorkspace[];
  missions: StudyMission[];
  sessions: LearningSession[];
  sources: WorkspaceSource[];
  sourceIndexes: SourceIndexSummary[];
  activeSessionId: string | null;
  resumeSessionId: string | null;
  navigation: {
    workspaceId: string;
    missionId: string | null;
  };
  activityOrder: number;
  authentication: {
    status: "signedOut" | "signingIn" | "signedIn" | "failed";
    method: "chatgpt" | "apiKey" | null;
    accountLabel: string | null;
    loginUrl: string | null;
    error: string | null;
  };
  intakeError: string | null;
  runtimeAvailable: boolean;
  modelAccess: ModelAccessState;
  accessConfirmationPreference: {
    confirmFullAccess: boolean;
  };
}

export type LearnerAction =
  | { type: "startQuickStudy"; mathematics: string; location?: StudyLocation }
  | { type: "submitSessionIntake"; mathematics: string; location?: StudyLocation }
  | { type: "confirmSessionProposal" }
  | { type: "cancelModelWork" }
  | { type: "cancelSessionModelWork"; sessionId: string }
  | { type: "retryModelWork" }
  | { type: "startChatGptLogin" }
  | { type: "loginWithApiKey"; apiKey: string }
  | { type: "refreshAuthentication" }
  | { type: "savePendingQuestion"; text: string }
  | { type: "editPendingQuestion"; text: string }
  | { type: "discardPendingQuestion" }
  | { type: "submitPendingQuestion" }
  | { type: "addSourceToSession"; sourceId: string }
  | {
      type: "createSourceAnchor";
      sourceId: string;
      selection: SourceAnchorSelection;
      paletteAction: SourceAnchorPaletteAction;
    }
  | { type: "selectSessionAccessPolicy"; policy: SessionAccessPolicy }
  | { type: "setFullAccessConfirmation"; enabled: boolean }
  | { type: "decideFullAccessConfirmation"; decision: "confirm" | "cancel" }
  | {
      type: "decideAccessRequest";
      requestId: string;
      decision: "approve" | "deny" | "narrow";
      narrowedPolicy?: SessionAccessPolicy;
    }
  | {
      type: "reviseSessionProposal";
      learningGoal: string;
      scope: string;
      initialTeachingDirection: string;
    }
  | {
      type: "applySessionProposalRevision";
      learningGoal: string;
      scope: string;
      initialTeachingDirection: string;
    }
  | { type: "editLearningGoal"; value: string }
  | { type: "editSessionTarget"; value: string }
  | { type: "leaveSession" }
  | { type: "resumeSession"; sessionId: string }
  | { type: "createWorkspace"; name: string }
  | { type: "renameWorkspace"; workspaceId: string; name: string }
  | { type: "createMission"; workspaceId: string; name: string }
  | { type: "navigateToWorkspace"; workspaceId: string }
  | ({ type: "navigateToMission" } & StudyLocation)
  | ({ type: "fileSession"; sessionId: string } & StudyLocation);

export class LearningApplication {
  private state: LearningApplicationState = initialState();
  private readonly statePath: string;
  private readonly sourceIndexPath: string;
  private modelRuntime: ModelRuntime | null;
  private persistence = Promise.resolve();
  private sourceIndexWork = Promise.resolve();
  private readonly modelWorks = new Map<string, { controller: AbortController; promise: Promise<void> }>();
  private readonly accessDecisionWaiters = new Map<string, (decision: RuntimeAccessDecision) => void>();
  private readonly stateListeners = new Set<(state: LearningApplicationState) => void>();
  private agentWorkLogs: Record<string, Array<ModelRuntimeEvent & { sequence: number }>> = {};
  private sourceIndexDocuments = new Map<string, SourceIndexDocument>();
  private sourceSearchResults = new Map<string, SourceSearchResult>();

  private constructor(
    dataDirectory: string,
    modelRuntime: ModelRuntime | null,
    private readonly sourceAccess: LocalSourceAccess | null
  ) {
    this.statePath = join(dataDirectory, "learning-application.json");
    this.sourceIndexPath = join(dataDirectory, "source-index.json");
    this.modelRuntime = modelRuntime;
  }

  static async launch(
    dataDirectory: string,
    modelRuntime: ModelRuntime | null = null,
    sourceAccess: LocalSourceAccess | null = null
  ): Promise<LearningApplication> {
    const application = new LearningApplication(dataDirectory, modelRuntime, sourceAccess);
    try {
      const stored = JSON.parse(await readFile(application.statePath, "utf8")) as Record<string, unknown>;
      const { agentWorkLogs, ...storedState } = stored;
      const persisted = migratePersistedState(storedState);
      application.agentWorkLogs = migrateAgentWorkLogs(agentWorkLogs);
      for (const session of persisted.sessions) {
        if (session.status === "active") session.status = "paused";
        session.pendingFullAccessConfirmation = false;
        for (const request of session.accessRequests) {
          if (request.status === "pending") request.status = "denied";
        }
        if (session.teachingCard.status === "streaming") {
          replaceTeachingCard(session, interruptedTeachingCard(session.teachingCard.content));
        }
      }
      persisted.activeSessionId = null;
      persisted.resumeSessionId = mostRecentSessionId(persisted.sessions);
      persisted.screen = "dashboard";
      application.state = persisted;
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }
    await application.loadSourceIndexCache();
    if (modelRuntime) {
      application.state.runtimeAvailable = true;
      try {
        application.updateAuthentication(await modelRuntime.getAuthentication());
      } catch (error) {
        application.state.authentication = failedAuthentication(null, error);
        application.applyModelAccessFailure(error);
      }
    } else {
      application.state.runtimeAvailable = false;
      const error = new Error("Codex Runtime is unavailable. Restart Codex and try again.");
      application.state.authentication = failedAuthentication(null, error);
      application.state.modelAccess = unavailableModelAccess(error);
    }
    return application;
  }

  getState(): LearningApplicationState {
    return structuredClone(this.state);
  }

  getSessionAccessScope(sessionId: string): SessionAccessScope {
    const session = this.requireSession(sessionId);
    const workspace = this.requireWorkspace(session.workspaceId);
    const sourceIds = session.accessPolicy === "focused"
      ? session.sourceIds
      : session.accessPolicy === "workspace"
        ? [...session.sourceIds, ...workspace.context.sourceIds]
        : this.state.sources.map((source) => source.id);
    return {
      policy: session.accessPolicy,
      sourceIds: [...new Set(sourceIds)],
      allowsBroadLocalRead: session.accessPolicy === "full",
      allowsSourceModification: false
    };
  }

  async requestSessionAccess(
    sessionId: string,
    request: Pick<SessionAccessRequest, "requestedPolicy" | "reason" | "exactScope" | "intendedAction">
  ): Promise<LearningApplicationState> {
    const session = this.requireSession(sessionId);
    this.addAccessRequest(session, request);
    return this.publishAndPersist();
  }

  subscribe(listener: (state: LearningApplicationState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  searchSessions(query: string): SessionSearchResult[] {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];
    return this.state.sessions.flatMap((session) => {
      const workspace = this.state.workspaces.find((candidate) => candidate.id === session.workspaceId);
      const mission = this.state.missions.find((candidate) => candidate.id === session.missionId);
      if (!workspace || !mission) return [];
      const searchable = [session.learningGoal, session.sessionTarget, workspace.name, mission.name]
        .join(" ")
        .toLocaleLowerCase();
      if (!terms.every((term) => searchable.includes(term))) return [];
      return [{
        sessionId: session.id,
        learningGoal: session.learningGoal,
        sessionTarget: session.sessionTarget,
        workspaceName: workspace.name,
        missionName: mission.name
      }];
    });
  }

  searchSourceIndex(workspaceId: string, query: string): Promise<SourceSearchResult[]> {
    return this.serializeSourceIndexOperation(() => this.searchSourceIndexNow(workspaceId, query));
  }

  private async searchSourceIndexNow(workspaceId: string, query: string): Promise<SourceSearchResult[]> {
    this.requireWorkspace(workspaceId);
    if (query.length > 500) throw new Error("Source Index search is limited to 500 characters.");
    const terms = searchTerms(query);
    const termHashes = terms.map(sourceIndexTermHash);
    if (terms.length === 0) return [];
    this.sourceSearchResults.clear();
    const workspace = this.requireWorkspace(workspaceId);
    const results: SourceSearchResult[] = [];
    const seenLocations = new Set<string>();
    for (const document of this.sourceIndexDocuments.values()) {
      if (document.workspaceId !== workspaceId || this.sourceIndexStatus(document.sourceId)?.status !== "ready") continue;
      const source = this.state.sources.find((candidate): candidate is LinkedSource =>
        candidate.id === document.sourceId && candidate.kind === "linkedSource"
      );
      if (!source) continue;
      const view = await this.openLinkedSource(document.sourceId);
      if (view.status === "unavailable") {
        await this.markSourceIndexUnavailable(document.sourceId, view.error);
        continue;
      }
      const hasCachedMatch = document.pages.some((page) => page.regions.some(
        (region) => termHashes.every((termHash) => region.termHashes.includes(termHash))
      ));
      if (!hasCachedMatch) continue;
      let liveExtraction: SourceIndexExtraction;
      try {
        liveExtraction = validatedSourceIndexExtraction(await this.sourceAccess!.extractForIndex(source));
      } catch (error) {
        await this.markSourceIndexUnavailable(document.sourceId, usefulSourceError(error));
        continue;
      }
      for (const page of document.pages) {
        for (const region of page.regions) {
          if (!termHashes.every((termHash) => region.termHashes.includes(termHash))) continue;
          const livePage = liveExtraction.pages.find((candidate) => candidate.pageNumber === page.pageNumber);
          const liveRegion = livePage?.regions.find((candidate) => sameIndexMatch(candidate, {
            pageNumber: page.pageNumber,
            bounds: region.bounds,
            kind: region.kind,
            ...(region.sourceStartOffset === undefined ? {} : { sourceStartOffset: region.sourceStartOffset }),
            ...(region.sourceEndOffset === undefined ? {} : { sourceEndOffset: region.sourceEndOffset })
          }));
          if (!livePage || !liveRegion) continue;
          const locationKey = [document.sourceId, page.pageNumber, region.bounds.x, region.bounds.y,
            region.bounds.width, region.bounds.height, region.sourceStartOffset, region.sourceEndOffset].join(":");
          if (seenLocations.has(locationKey)) continue;
          seenLocations.add(locationKey);
          const result: SourceSearchResult = {
            id: crypto.randomUUID(),
            sourceId: document.sourceId,
            sourceName: document.sourceName,
            workspaceName: workspace.name,
            locationLabel: `Page ${page.pageNumber}`,
            preview: searchPreview(liveRegion.text, terms),
            thumbnailDataUrl: livePage.thumbnailDataUrl,
            match: {
              pageNumber: page.pageNumber,
              bounds: region.bounds,
              kind: region.kind,
              ...(region.sourceStartOffset === undefined ? {} : { sourceStartOffset: region.sourceStartOffset }),
              ...(region.sourceEndOffset === undefined ? {} : { sourceEndOffset: region.sourceEndOffset })
            }
          };
          results.push(result);
          this.sourceSearchResults.set(result.id, result);
        }
      }
    }
    return results;
  }

  indexSource(sourceId: string): Promise<LearningApplicationState> {
    return this.serializeSourceIndexOperation(() => this.indexSourceNow(sourceId));
  }

  private async indexSourceNow(sourceId: string): Promise<LearningApplicationState> {
    const source = this.state.sources.find((candidate): candidate is LinkedSource =>
      candidate.id === sourceId && candidate.kind === "linkedSource"
    );
    if (!source) throw new Error("Choose an indexable Linked Source.");
    try {
      const view = await this.openLinkedSource(sourceId);
      if (view.status === "unavailable") return this.markSourceIndexUnavailable(sourceId, view.error);
      const extraction = validatedSourceIndexExtraction(await this.sourceAccess!.extractForIndex(source));
      const document: SourceIndexDocument = {
        sourceId,
        sourceName: source.name,
        workspaceId: source.workspaceId,
        fingerprint: source.link.fingerprint,
        extractionMethod: extraction.extractionMethod,
        pages: extraction.pages.map((page) => ({
          ...page,
          regions: page.regions.map(({ text, ...region }) => ({
            ...region,
            termHashes: [...new Set(searchTerms(text).map(sourceIndexTermHash))]
          }))
        }))
      };
      this.sourceIndexDocuments.set(sourceId, document);
      this.removeSourceSearchResults(sourceId);
      this.upsertSourceIndexSummary({
        sourceId,
        status: "ready",
        extractionMethod: extraction.extractionMethod,
        pageCount: extraction.pages.length,
        equationCount: extraction.pages.flatMap((page) => page.regions).filter((region) => region.kind === "equation").length,
        error: null
      });
      await this.persistSourceIndexCache();
      return this.publishAndPersist();
    } catch (error) {
      return this.markSourceIndexUnavailable(sourceId, usefulSourceError(error));
    }
  }

  clearSourceIndex(sourceId: string): Promise<LearningApplicationState> {
    return this.serializeSourceIndexOperation(() => this.clearSourceIndexNow(sourceId));
  }

  private async clearSourceIndexNow(sourceId: string): Promise<LearningApplicationState> {
    if (!this.state.sources.some((source) => source.id === sourceId)) throw new Error("Choose an existing source.");
    this.sourceIndexDocuments.delete(sourceId);
    this.removeSourceSearchResults(sourceId);
    this.upsertSourceIndexSummary({
      sourceId,
      status: "cleared",
      extractionMethod: null,
      pageCount: 0,
      equationCount: 0,
      error: null
    });
    await this.persistSourceIndexCache();
    return this.publishAndPersist();
  }

  rebuildSourceIndex(sourceId: string): Promise<LearningApplicationState> {
    return this.indexSource(sourceId);
  }

  openSourceSearchResult(resultId: string): Promise<OpenedSourceSearchResult> {
    return this.serializeSourceIndexOperation(() => this.openSourceSearchResultNow(resultId));
  }

  private async openSourceSearchResultNow(resultId: string): Promise<OpenedSourceSearchResult> {
    const result = this.sourceSearchResults.get(resultId);
    if (!result || this.sourceIndexStatus(result.sourceId)?.status !== "ready") {
      throw new Error("Search this Source Index again before opening the result.");
    }
    const view = await this.openLinkedSource(result.sourceId);
    if (view.status === "unavailable") return view;
    const source = this.state.sources.find((candidate): candidate is LinkedSource =>
      candidate.id === result.sourceId && candidate.kind === "linkedSource"
    );
    if (!source) throw new Error("Search this Source Index again before opening the result.");
    let extraction: SourceIndexExtraction;
    try {
      extraction = validatedSourceIndexExtraction(await this.sourceAccess!.extractForIndex(source));
    } catch (error) {
      await this.markSourceIndexUnavailable(result.sourceId, usefulSourceError(error));
      throw error;
    }
    const page = extraction.pages.find((candidate) => candidate.pageNumber === result.match.pageNumber);
    const region = page?.regions.find((candidate) => sameIndexMatch(candidate, result.match));
    if (!page || !region) throw new Error("Search this Source Index again before opening the result.");
    return {
      ...view,
      highlight: {
        pageNumber: result.match.pageNumber,
        exactText: region.text,
        bounds: region.bounds,
        thumbnailDataUrl: page.thumbnailDataUrl,
        ...(region.sourceStartOffset === undefined ? {} : { sourceStartOffset: region.sourceStartOffset }),
        ...(region.sourceEndOffset === undefined ? {} : { sourceEndOffset: region.sourceEndOffset })
      }
    };
  }

  async restoreModelRuntime(modelRuntime: ModelRuntime): Promise<LearningApplicationState> {
    if (this.modelRuntime && this.modelRuntime !== modelRuntime) {
      await this.modelRuntime.shutdown().catch(() => undefined);
    }
    this.modelRuntime = modelRuntime;
    this.state.runtimeAvailable = true;
    try {
      this.updateAuthentication(await modelRuntime.getAuthentication());
    } catch (error) {
      this.state.authentication = failedAuthentication(null, error);
      this.applyModelAccessFailure(error);
    }
    return this.publishAndPersist();
  }

  async reportModelRuntimeFailure(error: unknown): Promise<LearningApplicationState> {
    this.state.runtimeAvailable = false;
    this.state.modelAccess = unavailableModelAccess(
      error instanceof ModelAccessError ? error : new ModelAccessError("runtime", usefulRuntimeError(error))
    );
    return this.publishAndPersist();
  }

  async linkPrimaryFolder(
    workspaceId: string,
    selection: SelectedLocalSource
  ): Promise<LearningApplicationState> {
    const workspace = this.requireWorkspace(workspaceId);
    if (selection.resourceType !== "folder") throw new Error("Choose a folder for the Primary Folder.");
    if (workspace.context.primaryFolderSourceId) throw new Error("This Study Workspace already has a Primary Folder.");
    this.requireSourcePlacement(workspace, "primaryFolder", selection.canonicalPath);
    const source = linkedSource(workspaceId, "primaryFolder", selection);
    this.state.sources.push(source);
    workspace.context.primaryFolderSourceId = source.id;
    workspace.context.sourceIds.push(source.id);
    return this.publishAndPersist();
  }

  async linkExternalAttachment(
    workspaceId: string,
    selection: SelectedLocalSource
  ): Promise<LearningApplicationState> {
    const workspace = this.requireWorkspace(workspaceId);
    if (selection.resourceType !== "file") throw new Error("Choose a file for an External Attachment.");
    this.requireSourcePlacement(workspace, "externalAttachment", selection.canonicalPath);
    const source = linkedSource(workspaceId, "externalAttachment", selection);
    this.state.sources.push(source);
    workspace.context.sourceIds.push(source.id);
    return this.publishAndPersist();
  }

  async openLinkedSource(sourceId: string): Promise<LinkedSourceView> {
    const source = this.state.sources.find(
      (candidate): candidate is LinkedSource => candidate.id === sourceId && candidate.kind === "linkedSource"
    );
    if (!source) throw new Error("Choose an existing Linked Source.");
    if (!this.sourceAccess) throw new Error("Local source access is unavailable.");
    try {
      const view = await this.sourceAccess.read(source);
      if (!sameFingerprint(source.link.fingerprint, view.fingerprint)) {
        const message = "This source has changed since it was linked. Its original association is retained, but changed-source recovery is not available yet.";
        source.link.accessStatus = "unavailable";
        source.link.error = message;
        await this.publishAndPersist();
        return { status: "unavailable", sourceId, error: message };
      }
      source.link.accessStatus = "available";
      source.link.error = null;
      await this.publishAndPersist();
      return { status: "available", ...view };
    } catch (error) {
      const message = usefulSourceError(error);
      source.link.accessStatus = "unavailable";
      source.link.error = message;
      await this.publishAndPersist();
      return { status: "unavailable", sourceId, error: message };
    }
  }

  async waitForModelWork(): Promise<void> {
    await Promise.all([...this.modelWorks.values()].map((work) => work.promise));
    await this.persistence;
  }

  async shutdown(): Promise<void> {
    for (const session of this.state.sessions) {
      for (const request of session.accessRequests) {
        if (request.status !== "pending") continue;
        request.status = "denied";
        this.resolveAccessDecision(request.id, { status: "denied", policy: session.accessPolicy });
      }
    }
    const activeWorks = [...this.modelWorks.entries()];
    for (const [sessionId, work] of activeWorks) {
      const session = this.requireSession(sessionId);
      replaceTeachingCard(session, interruptedTeachingCard(session.teachingCard.content));
      work.controller.abort();
    }
    if (activeWorks.length > 0) {
      this.emitState();
      this.queuePersistence();
    }
    await Promise.all(activeWorks.map(([sessionId]) => this.modelRuntime?.cancelTeaching(sessionId).catch(() => undefined)));
    await this.waitForModelWork();
    await this.modelRuntime?.shutdown();
  }

  async submit(action: LearnerAction): Promise<LearningApplicationState> {
    switch (action.type) {
      case "createWorkspace": {
        const workspace: StudyWorkspace = {
          id: crypto.randomUUID(),
          kind: "named",
          name: requiredName(action.name, "Study Workspace"),
          context: emptyWorkspaceContext()
        };
        this.state.workspaces.push(workspace);
        this.state.navigation = { workspaceId: workspace.id, missionId: null };
        this.state.screen = "dashboard";
        break;
      }
      case "renameWorkspace": {
        const workspace = this.state.workspaces.find((candidate) => candidate.id === action.workspaceId);
        if (!workspace || workspace.kind !== "named") throw new Error("Choose a named Study Workspace to rename.");
        workspace.name = requiredName(action.name, "Study Workspace");
        break;
      }
      case "createMission": {
        this.requireNamedWorkspace(action.workspaceId);
        const mission: StudyMission = {
          id: crypto.randomUUID(),
          kind: "named",
          workspaceId: action.workspaceId,
          name: requiredName(action.name, "Study Mission")
        };
        this.state.missions.push(mission);
        this.state.navigation = { workspaceId: action.workspaceId, missionId: mission.id };
        break;
      }
      case "createSourceAnchor": {
        const session = this.requireActiveSession();
        if (!isSourceAnchorPaletteAction(action.paletteAction)) throw new Error("Choose an available Selection Palette action.");
        const source = this.state.sources.find((candidate) => candidate.id === action.sourceId);
        if (!source || !session.sourceIds.includes(source.id)) {
          throw new Error("Choose a source attached to the active Learning Session.");
        }
        const selection = await this.validatedSourceAnchorSelection(action.selection, source);
        const anchor: SourceAnchor = {
          id: crypto.randomUUID(),
          sourceId: source.id,
          selection
        };
        session.sourceAnchors.push(anchor);
        session.sourceAnchorRequests.push({
          id: crypto.randomUUID(),
          sourceAnchorId: anchor.id,
          action: action.paletteAction
        });
        session.activeSourceAnchorId = anchor.id;
        session.activityOrder = this.nextActivityOrder();
        this.state.resumeSessionId = session.id;
        break;
      }
      case "addSourceToSession": {
        const session = this.requireActiveSession();
        const source = this.state.sources.find((candidate) => candidate.id === action.sourceId);
        if (!source || source.workspaceId !== session.workspaceId || source.kind !== "linkedSource" || source.resourceType !== "file") {
          throw new Error("Choose a Linked Source file in the active Study Workspace.");
        }
        if (!session.sourceIds.includes(source.id)) session.sourceIds.push(source.id);
        break;
      }
      case "navigateToWorkspace": {
        const workspace = this.state.workspaces.find((candidate) => candidate.id === action.workspaceId);
        if (!workspace) throw new Error("Choose an existing Study Workspace.");
        if (this.state.activeSessionId) this.pauseActiveSessionAndMakeResumable();
        const currentMission = this.state.missions.find(
          (mission) => mission.id === this.state.navigation.missionId && mission.workspaceId === workspace.id
        );
        const firstMission = this.state.missions.find((mission) => mission.workspaceId === workspace.id);
        this.state.navigation = {
          workspaceId: workspace.id,
          missionId: currentMission?.id ?? firstMission?.id ?? null
        };
        this.state.screen = "dashboard";
        break;
      }
      case "navigateToMission": {
        this.requireMission(action.workspaceId, action.missionId);
        if (this.state.activeSessionId) this.pauseActiveSessionAndMakeResumable();
        this.state.navigation = { workspaceId: action.workspaceId, missionId: action.missionId };
        this.state.screen = "dashboard";
        break;
      }
      case "startQuickStudy": {
        const mathematics = action.mathematics.trim();
        if (!mathematics) throw new Error("Typed mathematics is required to start Quick Study.");
        this.pauseActiveSession();
        const location = this.resolveIntakeLocation(action.location);
        const managedAsset = this.createManagedTextAsset(location.workspaceId, mathematics);
        const session: LearningSession = {
          id: crypto.randomUUID(),
          workspaceId: location.workspaceId,
          missionId: location.missionId,
          mathematics,
          sourceIds: [managedAsset.id],
          learningGoal: `Understand ${mathematics}`,
          sessionTarget: "Work through the key mathematical idea",
          status: "active",
          activityOrder: this.nextActivityOrder(),
          returnContext: {
            label: "Your typed mathematics",
            nextAction: "Continue working through the key idea"
          },
          proposal: defaultAcceptedProposal(),
          teachingCard: emptyTeachingCard(),
          teachingCardHistory: [],
          submittedPendingQuestions: [],
          currentTeachingInput: { kind: "sessionIntake", text: mathematics },
          pendingQuestion: null,
          accessPolicy: location.accessPolicy,
          accessRequests: [],
          pendingFullAccessConfirmation: false,
          sourceAnchors: [],
          sourceAnchorRequests: [],
          activeSourceAnchorId: null
        };
        this.state.sessions.push(session);
        this.state.activeSessionId = session.id;
        this.state.resumeSessionId = session.id;
        this.state.navigation = { workspaceId: session.workspaceId, missionId: session.missionId };
        this.state.screen = "workbench";
        break;
      }
      case "submitSessionIntake": {
        const mathematics = action.mathematics.trim();
        if (!mathematics) throw new Error("Typed mathematics is required to start Quick Study.");
        this.requireModelAccess();
        let proposal: SessionProposal;
        const pendingLog: Array<ModelRuntimeEvent & { sequence: number }> = [];
        const proposalAttemptId = `proposal:${crypto.randomUUID()}`;
        this.agentWorkLogs[proposalAttemptId] = pendingLog;
        const runtime = this.modelRuntime!;
        try {
          proposal = await runtime.proposeSession(mathematics, (event) => {
            pendingLog.push({ ...event, sequence: pendingLog.length + 1 });
          });
          this.state.intakeError = null;
        } catch (error) {
          const message = usefulRuntimeError(error);
          pendingLog.push({
            type: "turnFailed",
            threadId: "unavailable",
            turnId: null,
            detail: error instanceof Error ? error.message : String(error),
            sequence: pendingLog.length + 1
          });
          this.state.intakeError = message;
          this.recordModelAccessLoss(error);
          break;
        }
        this.pauseActiveSession();
        const location = this.resolveIntakeLocation(action.location);
        const managedAsset = this.createManagedTextAsset(location.workspaceId, mathematics);
        const session: LearningSession = {
          id: crypto.randomUUID(),
          workspaceId: location.workspaceId,
          missionId: location.missionId,
          mathematics,
          sourceIds: [managedAsset.id],
          learningGoal: proposal.learningGoal,
          sessionTarget: proposal.scope,
          status: "active",
          activityOrder: this.nextActivityOrder(),
          returnContext: {
            label: "Your typed mathematics",
            nextAction: proposal.initialTeachingDirection
          },
          proposal: {
            scope: proposal.scope,
            initialTeachingDirection: proposal.initialTeachingDirection,
            status: proposal.requiresConfirmation ? "awaitingConfirmation" : "accepted",
            confirmationReason: proposal.confirmationReason
          },
          teachingCard: emptyTeachingCard(),
          teachingCardHistory: [],
          submittedPendingQuestions: [],
          currentTeachingInput: { kind: "sessionIntake", text: mathematics },
          pendingQuestion: null,
          accessPolicy: location.accessPolicy,
          accessRequests: [],
          pendingFullAccessConfirmation: false,
          sourceAnchors: [],
          sourceAnchorRequests: [],
          activeSourceAnchorId: null
        };
        this.agentWorkLogs[session.id] = pendingLog;
        delete this.agentWorkLogs[proposalAttemptId];
        this.state.sessions.push(session);
        this.state.activeSessionId = session.id;
        this.state.resumeSessionId = session.id;
        this.state.navigation = { workspaceId: session.workspaceId, missionId: session.missionId };
        this.state.screen = "workbench";
        if (!proposal.requiresConfirmation) await this.beginTeaching(session);
        break;
      }
      case "reviseSessionProposal": {
        const session = this.requireActiveSession();
        this.reviseProposal(session, action);
        break;
      }
      case "applySessionProposalRevision": {
        const session = this.requireActiveSession();
        const changed = this.reviseProposal(session, action);
        if (changed && this.modelWorks.has(session.id) && !await this.stopModelWork(session)) break;
        if (changed) await this.beginTeaching(session);
        break;
      }
      case "confirmSessionProposal": {
        const session = this.requireActiveSession();
        if (session.proposal.status !== "awaitingConfirmation") {
          throw new Error("This Session Proposal does not need confirmation.");
        }
        await this.beginTeaching(session);
        break;
      }
      case "cancelModelWork": {
        const session = this.requireActiveSession();
        await this.stopModelWork(session);
        break;
      }
      case "cancelSessionModelWork": {
        await this.stopModelWork(this.requireSession(action.sessionId));
        break;
      }
      case "retryModelWork": {
        const session = this.requireActiveSession();
        this.requireModelAccess();
        if (!session.teachingCard.retryable) throw new Error("This Teaching Card is not ready to retry.");
        if (this.modelWorks.has(session.id)) throw new Error("Restart Codex before retrying this Teaching Card.");
        const input = session.currentTeachingInput;
        const submission = input.kind === "pendingQuestion"
          ? session.submittedPendingQuestions.find((candidate) => candidate.id === input.submissionId) ?? null
          : null;
        await this.beginTeaching(session, input.text, submission);
        break;
      }
      case "startChatGptLogin": {
        if (!this.modelRuntime) throw new Error("Codex is unavailable.");
        try {
          const login = await this.modelRuntime.startChatGptLogin();
          this.state.authentication = {
            status: "signingIn",
            method: "chatgpt",
            accountLabel: null,
            loginUrl: login.authUrl,
            error: null
          };
        } catch (error) {
          this.state.authentication = failedAuthentication("chatgpt", error);
        }
        break;
      }
      case "loginWithApiKey": {
        if (!this.modelRuntime) throw new Error("Codex is unavailable.");
        if (!action.apiKey.trim()) throw new Error("An OpenAI API key is required.");
        try {
          await this.modelRuntime.loginWithApiKey(action.apiKey);
          this.updateAuthentication(await this.modelRuntime.getAuthentication());
        } catch (error) {
          this.state.authentication = failedAuthentication("apiKey", error);
          this.applyModelAccessFailure(error);
        }
        break;
      }
      case "refreshAuthentication": {
        if (!this.modelRuntime) throw new Error("Codex is unavailable.");
        try {
          this.updateAuthentication(await this.modelRuntime.getAuthentication());
        } catch (error) {
          this.state.authentication = failedAuthentication(null, error);
          this.applyModelAccessFailure(error);
        }
        break;
      }
      case "savePendingQuestion": {
        if (this.state.modelAccess.status === "available") {
          throw new Error("Submit the Ask Bar question while model access is available.");
        }
        const session = this.requireActiveSession();
        session.pendingQuestion = { id: crypto.randomUUID(), text: requiredText(action.text, "Pending Question") };
        session.activityOrder = this.nextActivityOrder();
        this.state.resumeSessionId = session.id;
        break;
      }
      case "editPendingQuestion": {
        const session = this.requireActiveSession();
        if (!session.pendingQuestion) throw new Error("There is no Pending Question to edit.");
        session.pendingQuestion.text = requiredText(action.text, "Pending Question");
        session.activityOrder = this.nextActivityOrder();
        this.state.resumeSessionId = session.id;
        break;
      }
      case "discardPendingQuestion": {
        const session = this.requireActiveSession();
        if (!session.pendingQuestion) throw new Error("There is no Pending Question to discard.");
        session.pendingQuestion = null;
        break;
      }
      case "submitPendingQuestion": {
        this.requireModelAccess();
        const session = this.requireActiveSession();
        if (!session.pendingQuestion) throw new Error("There is no Pending Question to submit.");
        const question = { ...session.pendingQuestion };
        const submission: SubmittedPendingQuestion = {
          ...question,
          teachingCard: emptyTeachingCard()
        };
        await this.beginTeaching(session, question.text, submission);
        session.pendingQuestion = null;
        break;
      }
      case "setFullAccessConfirmation": {
        this.state.accessConfirmationPreference.confirmFullAccess = action.enabled;
        break;
      }
      case "selectSessionAccessPolicy": {
        const session = this.requireActiveSession();
        if (session.accessRequests.some((candidate) => candidate.status === "pending")) {
          throw new Error("Decide the current Access Request before changing the Session Access Policy.");
        }
        if (action.policy === session.accessPolicy) break;
        if (action.policy === "full" && this.state.accessConfirmationPreference.confirmFullAccess) {
          session.pendingFullAccessConfirmation = true;
          break;
        }
        await this.changeSessionAccessPolicy(session, action.policy);
        break;
      }
      case "decideFullAccessConfirmation": {
        const session = this.requireActiveSession();
        if (!session.pendingFullAccessConfirmation) throw new Error("There is no pending Full Access confirmation.");
        session.pendingFullAccessConfirmation = false;
        if (action.decision === "confirm") await this.changeSessionAccessPolicy(session, "full");
        break;
      }
      case "decideAccessRequest": {
        const session = this.requireActiveSession();
        const request = session.accessRequests.find((candidate) => candidate.id === action.requestId);
        if (!request || request.status !== "pending") throw new Error("Choose a pending Access Request in this Learning Session.");
        if (action.decision === "deny") {
          request.status = "denied";
          request.decidedPolicy = null;
          this.resolveAccessDecision(request.id, { status: "denied", policy: session.accessPolicy });
          break;
        }
        const decidedPolicy = action.decision === "approve" ? request.requestedPolicy : action.narrowedPolicy;
        if (!decidedPolicy) throw new Error("Choose the narrowed Session Access Policy.");
        if (action.decision === "narrow" && (accessPolicyRank(decidedPolicy) <= accessPolicyRank(session.accessPolicy)
          || accessPolicyRank(decidedPolicy) >= accessPolicyRank(request.requestedPolicy))) {
          throw new Error("A narrowed policy must be broader than the current policy and narrower than the request.");
        }
        await this.changeSessionAccessPolicy(session, decidedPolicy, true);
        request.status = action.decision === "approve" ? "approved" : "narrowed";
        request.decidedPolicy = decidedPolicy;
        this.resolveAccessDecision(request.id, { status: request.status, policy: decidedPolicy });
        break;
      }
      case "resumeSession": {
        const session = this.requireSession(action.sessionId);
        this.pauseActiveSession();
        session.status = "active";
        session.activityOrder = this.nextActivityOrder();
        this.state.activeSessionId = session.id;
        this.state.resumeSessionId = session.id;
        this.state.navigation = { workspaceId: session.workspaceId, missionId: session.missionId };
        this.state.screen = "workbench";
        break;
      }
      case "leaveSession": {
        const session = this.pauseActiveSessionAndMakeResumable();
        this.state.navigation = { workspaceId: session.workspaceId, missionId: session.missionId };
        this.state.screen = "dashboard";
        break;
      }
      case "editLearningGoal": {
        const session = this.requireActiveSession();
        session.learningGoal = action.value;
        session.activityOrder = this.nextActivityOrder();
        this.state.resumeSessionId = session.id;
        break;
      }
      case "editSessionTarget": {
        const session = this.requireActiveSession();
        session.sessionTarget = action.value;
        session.activityOrder = this.nextActivityOrder();
        this.state.resumeSessionId = session.id;
        break;
      }
      case "fileSession": {
        const session = this.requireSession(action.sessionId);
        this.requireNamedWorkspace(action.workspaceId);
        this.requireMission(action.workspaceId, action.missionId);
        if (session.workspaceId !== this.state.quickStudy.workspace.id) {
          throw new Error("Only Quick Study sessions can be filed.");
        }
        const originalWorkspace = this.requireWorkspace(session.workspaceId);
        const destinationWorkspace = this.requireWorkspace(action.workspaceId);
        for (const sourceId of session.sourceIds) {
          const source = this.state.sources.find((candidate) => candidate.id === sourceId);
          if (!source || source.workspaceId !== originalWorkspace.id) continue;
          source.workspaceId = destinationWorkspace.id;
          originalWorkspace.context.sourceIds = originalWorkspace.context.sourceIds.filter((id) => id !== sourceId);
          if (!destinationWorkspace.context.sourceIds.includes(sourceId)) destinationWorkspace.context.sourceIds.push(sourceId);
        }
        session.workspaceId = action.workspaceId;
        session.missionId = action.missionId;
        session.activityOrder = this.nextActivityOrder();
        this.state.resumeSessionId = session.id;
        this.state.navigation = { workspaceId: action.workspaceId, missionId: action.missionId };
        break;
      }
    }

    const state = this.getState();
    this.emitState(state);
    this.persistence = this.persistence.catch(() => undefined).then(() => this.persist(state));
    await this.persistence;
    return this.getState();
  }

  private async persist(state: LearningApplicationState): Promise<void> {
    const directory = dirname(this.statePath);
    const temporaryPath = `${this.statePath}.temporary`;
    await mkdir(directory, { recursive: true });
    await writeFile(temporaryPath, JSON.stringify({ ...state, agentWorkLogs: this.agentWorkLogs }, null, 2), "utf8");
    await rename(temporaryPath, this.statePath);
  }

  private async loadSourceIndexCache(): Promise<void> {
    try {
      const stored = JSON.parse(await readFile(this.sourceIndexPath, "utf8")) as unknown;
      const documents = validatedSourceIndexDocuments(stored);
      this.sourceIndexDocuments = new Map(documents.map((document) => [document.sourceId, document]));
    } catch (error) {
      if (!isMissingFile(error)) {
        this.sourceIndexDocuments.clear();
        await this.persistSourceIndexCache().catch(() => undefined);
      }
    }
    const sourceIds = new Set(this.state.sources.map((source) => source.id));
    this.state.sourceIndexes = this.state.sourceIndexes.filter((summary) => sourceIds.has(summary.sourceId));
    for (const summary of this.state.sourceIndexes) {
      if (summary.status === "ready" && !this.sourceIndexDocuments.has(summary.sourceId)) {
        Object.assign(summary, { status: "cleared", extractionMethod: null, pageCount: 0, equationCount: 0, error: null });
      }
    }
    for (const sourceId of this.sourceIndexDocuments.keys()) {
      const source = this.state.sources.find((candidate) => candidate.id === sourceId);
      const document = this.sourceIndexDocuments.get(sourceId);
      if (!sourceIds.has(sourceId) || this.sourceIndexStatus(sourceId)?.status !== "ready"
        || source?.kind !== "linkedSource" || !document || !sameFingerprint(source.link.fingerprint, document.fingerprint)) {
        this.sourceIndexDocuments.delete(sourceId);
        const summary = this.sourceIndexStatus(sourceId);
        if (summary?.status === "ready") {
          Object.assign(summary, { status: "cleared", extractionMethod: null, pageCount: 0, equationCount: 0, error: null });
        }
      }
    }
  }

  private async persistSourceIndexCache(): Promise<void> {
    const directory = dirname(this.sourceIndexPath);
    const temporaryPath = `${this.sourceIndexPath}.temporary`;
    await mkdir(directory, { recursive: true });
    await writeFile(temporaryPath, JSON.stringify([...this.sourceIndexDocuments.values()], null, 2), "utf8");
    await rename(temporaryPath, this.sourceIndexPath);
  }

  private sourceIndexStatus(sourceId: string): SourceIndexSummary | undefined {
    return this.state.sourceIndexes.find((summary) => summary.sourceId === sourceId);
  }

  private upsertSourceIndexSummary(summary: SourceIndexSummary): void {
    const index = this.state.sourceIndexes.findIndex((candidate) => candidate.sourceId === summary.sourceId);
    if (index === -1) this.state.sourceIndexes.push(summary);
    else this.state.sourceIndexes[index] = summary;
  }

  private removeSourceSearchResults(sourceId: string): void {
    for (const [resultId, result] of this.sourceSearchResults) {
      if (result.sourceId === sourceId) this.sourceSearchResults.delete(resultId);
    }
  }

  private async markSourceIndexUnavailable(sourceId: string, error: string): Promise<LearningApplicationState> {
    this.sourceIndexDocuments.delete(sourceId);
    this.removeSourceSearchResults(sourceId);
    this.upsertSourceIndexSummary({
      sourceId,
      status: "unavailable",
      extractionMethod: null,
      pageCount: 0,
      equationCount: 0,
      error
    });
    await this.persistSourceIndexCache();
    return this.publishAndPersist();
  }

  private serializeSourceIndexOperation<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = this.sourceIndexWork.catch(() => undefined).then(operation);
    this.sourceIndexWork = result.then(() => undefined, () => undefined);
    return result;
  }

  private async beginTeaching(
    session: LearningSession,
    mathematics = session.mathematics,
    submission: SubmittedPendingQuestion | null = null
  ): Promise<void> {
    this.requireModelAccess();
    if (this.modelWorks.has(session.id)) throw new Error("Model teaching is already active for this Learning Session.");
    const sourceContext = await this.buildTeachingSourceContext(session);
    if (submission) {
      if (session.currentTeachingInput.kind === "sessionIntake" && session.teachingCard.status !== "idle") {
        session.teachingCardHistory.push(structuredClone(session.teachingCard));
      }
      if (!session.submittedPendingQuestions.some((candidate) => candidate.id === submission.id)) {
        session.submittedPendingQuestions.push(submission);
      }
      session.currentTeachingInput = { kind: "pendingQuestion", submissionId: submission.id, text: submission.text };
    } else {
      session.currentTeachingInput = { kind: "sessionIntake", text: mathematics };
    }
    const controller = new AbortController();
    session.proposal.status = "accepted";
    replaceTeachingCard(session, { status: "streaming", content: "", error: null, retryable: false });
    const runtime = this.modelRuntime!;
    const promise = runtime.streamTeaching({
      sessionId: session.id,
      mathematics,
      learningGoal: session.learningGoal,
      scope: session.proposal.scope,
      initialTeachingDirection: session.proposal.initialTeachingDirection,
      accessScope: this.getSessionAccessScope(session.id),
      sourceContext,
      onAccessRequest: (request) => controller.signal.aborted
        ? Promise.resolve({ status: "denied", policy: session.accessPolicy })
        : this.handleRuntimeAccessRequest(session, request),
      signal: controller.signal,
      onDelta: (delta) => {
        if (controller.signal.aborted || session.teachingCard.status !== "streaming") return;
        session.teachingCard.content += delta;
        this.emitState();
        this.queuePersistence();
      },
      onRuntimeEvent: (event) => {
        if (controller.signal.aborted) return;
        const log = this.agentWorkLogs[session.id] ??= [];
        log.push({ ...event, sequence: log.length + 1 });
        this.queuePersistence();
      }
    }).then(() => {
      if (controller.signal.aborted) return;
      if (session.teachingCard.status === "streaming") {
        session.teachingCard.status = "completed";
        session.returnContext.nextAction = "Review the Teaching Card and continue from the point that needs work";
      }
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      const message = usefulRuntimeError(error);
      replaceTeachingCard(session, {
        ...session.teachingCard,
        status: "failed",
        error: message,
        retryable: true
      });
      this.recordModelAccessLoss(error);
    }).finally(() => {
      if (this.modelWorks.get(session.id)?.promise === promise) this.modelWorks.delete(session.id);
      this.queuePersistence();
      this.emitState();
    });
    this.modelWorks.set(session.id, { controller, promise });
  }

  private async validatedSourceAnchorSelection(
    selection: SourceAnchorSelection,
    source: WorkspaceSource
  ): Promise<SourceAnchorSelection> {
    const validated = validatedSourceAnchorSelection(selection, source);
    if (source.kind === "managedAsset") return validated;
    if (!this.sourceAccess) throw new Error("Local source access is unavailable.");
    const view = await this.sourceAccess.read(source);
    if (!sameFingerprint(source.link.fingerprint, view.fingerprint)) {
      throw new Error("This source changed before the Source Anchor could be saved.");
    }
    if (selection.kind === "diagramRegion") return validated;
    if (view.mediaType !== "text/plain") {
      throw new Error("Text and equation anchors require an accessible text Source Layer.");
    }
    if (!matchesSourceTextLocation(view.content, selection)) {
      throw new Error("The selected source text no longer matches this Source Layer.");
    }
    return validated;
  }

  private async buildTeachingSourceContext(session: LearningSession): Promise<TeachingSourceContext[]> {
    const contexts: TeachingSourceContext[] = [];
    let remainingCharacters = MAX_TEACHING_SOURCE_CONTEXT_CHARACTERS;
    const addContext = (context: TeachingSourceContext) => {
      if (remainingCharacters <= 0) return;
      const content = context.content.slice(0, remainingCharacters);
      contexts.push({ ...context, content });
      remainingCharacters -= content.length;
    };
    for (const sourceId of this.getSessionAccessScope(session.id).sourceIds) {
      const source = this.state.sources.find((candidate) => candidate.id === sourceId);
      if (!source) continue;
      if (source.kind === "managedAsset") {
        addContext({ sourceId, name: source.name, mediaType: source.mediaType, content: source.content });
        continue;
      }
      if (!this.sourceAccess) continue;
      try {
        const view = await this.sourceAccess.read(source);
        if (!sameFingerprint(source.link.fingerprint, view.fingerprint)) continue;
        addContext({ sourceId, name: source.name, mediaType: view.mediaType, content: view.content });
      } catch {
        // Unavailable Linked Sources remain associated but cannot enter model context.
      }
    }
    return contexts;
  }

  private async handleRuntimeAccessRequest(
    session: LearningSession,
    details: RuntimeAccessRequest
  ): Promise<RuntimeAccessDecision> {
    const request = this.addAccessRequest(session, details);
    const decision = new Promise<RuntimeAccessDecision>((resolve) => {
      this.accessDecisionWaiters.set(request.id, resolve);
    });
    await this.publishAndPersist();
    return decision;
  }

  private addAccessRequest(
    session: LearningSession,
    request: Pick<SessionAccessRequest, "requestedPolicy" | "reason" | "exactScope" | "intendedAction">
  ): SessionAccessRequest {
    if (accessPolicyRank(request.requestedPolicy) <= accessPolicyRank(session.accessPolicy)) {
      throw new Error("An Access Request must ask for broader authority than the current Session Access Policy.");
    }
    if (session.accessRequests.some((candidate) => candidate.status === "pending")) {
      throw new Error("Decide the current Access Request before requesting another elevation.");
    }
    const accessRequest: SessionAccessRequest = {
      id: crypto.randomUUID(),
      requestedPolicy: request.requestedPolicy,
      reason: requiredText(request.reason, "Access Request reason"),
      exactScope: requiredText(request.exactScope, "Access Request scope"),
      intendedAction: requiredText(request.intendedAction, "Access Request intended action"),
      status: "pending",
      decidedPolicy: null
    };
    session.accessRequests.push(accessRequest);
    return accessRequest;
  }

  private resolveAccessDecision(requestId: string, decision: RuntimeAccessDecision): void {
    this.accessDecisionWaiters.get(requestId)?.(decision);
    this.accessDecisionWaiters.delete(requestId);
  }

  private denyPendingAccessRequests(session: LearningSession): void {
    for (const request of session.accessRequests) {
      if (request.status !== "pending") continue;
      request.status = "denied";
      request.decidedPolicy = null;
      this.resolveAccessDecision(request.id, { status: "denied", policy: session.accessPolicy });
    }
  }

  private async changeSessionAccessPolicy(
    session: LearningSession,
    policy: SessionAccessPolicy,
    preservePendingAccessRequest = false
  ): Promise<void> {
    if (policy === session.accessPolicy) return;
    const input = session.currentTeachingInput;
    const submission = input.kind === "pendingQuestion"
      ? session.submittedPendingQuestions.find((candidate) => candidate.id === input.submissionId) ?? null
      : null;
    const restartTeaching = this.modelWorks.has(session.id);
    if (restartTeaching && !await this.stopModelWork(session, !preservePendingAccessRequest)) {
      throw new Error(`Codex did not confirm interruption. ${sessionAccessPolicyLabel(session.accessPolicy)} remains active.`);
    }
    session.accessPolicy = policy;
    if (restartTeaching) await this.beginTeaching(session, input.text, submission);
  }

  private async stopModelWork(session: LearningSession, denyPendingRequests = true): Promise<boolean> {
    const work = this.modelWorks.get(session.id);
    if (!this.modelRuntime || !work) throw new Error("There is no active model work to stop.");
    if (denyPendingRequests) this.denyPendingAccessRequests(session);
    replaceTeachingCard(session, interruptedTeachingCard(session.teachingCard.content));
    work.controller.abort();
    try {
      await this.modelRuntime.cancelTeaching(session.id);
      if (this.modelWorks.get(session.id) === work) this.modelWorks.delete(session.id);
      return true;
    } catch {
      session.teachingCard.error = "Teaching is stopped locally, but Codex did not confirm interruption. Restart Codex before retrying.";
      return false;
    }
  }

  private reviseProposal(
    session: LearningSession,
    revision: { learningGoal: string; scope: string; initialTeachingDirection: string }
  ): boolean {
    const learningGoal = requiredName(revision.learningGoal, "Learning Goal");
    const scope = requiredName(revision.scope, "Session scope");
    const initialTeachingDirection = requiredName(revision.initialTeachingDirection, "Teaching direction");
    const changed = learningGoal !== session.learningGoal
      || scope !== session.proposal.scope
      || initialTeachingDirection !== session.proposal.initialTeachingDirection;
    session.learningGoal = learningGoal;
    session.sessionTarget = scope;
    session.proposal.scope = scope;
    session.proposal.initialTeachingDirection = initialTeachingDirection;
    session.returnContext.nextAction = initialTeachingDirection;
    session.activityOrder = this.nextActivityOrder();
    this.state.resumeSessionId = session.id;
    return changed;
  }

  private recordModelAccessLoss(error: unknown): void {
    if (!(error instanceof ModelAccessError)) return;
    const modelAccess: Extract<ModelAccessState, { status: "unavailable" }> = {
      status: "unavailable",
      cause: error.cause,
      message: error.message
    };
    this.state.modelAccess = modelAccess;
    if (modelAccess.cause === "runtime") this.state.runtimeAvailable = false;
    if (modelAccess.cause === "authentication" || modelAccess.cause === "runtime") {
      this.state.authentication = {
        status: "failed",
        method: this.state.authentication.method,
        accountLabel: null,
        loginUrl: null,
        error: error.message
      };
    }
  }

  private applyModelAccessFailure(error: unknown): void {
    const modelAccess = unavailableModelAccess(error);
    this.state.modelAccess = modelAccess;
    if (modelAccess.cause === "runtime") this.state.runtimeAvailable = false;
  }

  private updateAuthentication(authentication: AuthenticationState): void {
    this.state.authentication = authenticationView(authentication);
    this.state.modelAccess = authentication.status === "signedIn"
      ? { status: "available" }
      : { status: "unavailable", cause: "authentication", message: authenticationMessage(authentication) };
  }

  private requireModelAccess(): void {
    if (!this.modelRuntime || this.state.modelAccess.status === "unavailable") {
      throw new Error(this.state.modelAccess.status === "unavailable"
        ? this.state.modelAccess.message
        : "Connect a Model Runtime before starting model-backed teaching.");
    }
  }

  private emitState(state = this.getState()): void {
    for (const listener of this.stateListeners) listener(state);
  }

  private queuePersistence(): void {
    const state = this.getState();
    this.persistence = this.persistence.catch(() => undefined).then(() => this.persist(state));
  }

  private async publishAndPersist(): Promise<LearningApplicationState> {
    const state = this.getState();
    this.emitState(state);
    this.persistence = this.persistence.catch(() => undefined).then(() => this.persist(state));
    await this.persistence;
    return state;
  }

  private requireActiveSession(): LearningSession {
    if (!this.state.activeSessionId) throw new Error("Resume a Learning Session before editing it.");
    return this.requireSession(this.state.activeSessionId);
  }

  private requireSession(sessionId: string): LearningSession {
    const session = this.state.sessions.find((candidate) => candidate.id === sessionId);
    if (!session) throw new Error("Choose an existing Learning Session.");
    return session;
  }

  private requireNamedWorkspace(workspaceId: string): StudyWorkspace {
    const workspace = this.state.workspaces.find((candidate) => candidate.id === workspaceId);
    if (!workspace || workspace.kind !== "named") throw new Error("Choose a named Study Workspace.");
    return workspace;
  }

  private requireWorkspace(workspaceId: string): StudyWorkspace {
    const workspace = this.state.workspaces.find((candidate) => candidate.id === workspaceId);
    if (!workspace) throw new Error("Choose an existing Study Workspace.");
    return workspace;
  }

  private requireSourcePlacement(
    workspace: StudyWorkspace,
    role: LinkedSource["role"],
    path: string
  ): void {
    const linkedSources = this.state.sources.filter(
      (candidate): candidate is LinkedSource => candidate.workspaceId === workspace.id && candidate.kind === "linkedSource"
    );
    if (role === "externalAttachment") {
      const primaryFolder = linkedSources.find((source) => source.role === "primaryFolder");
      if (primaryFolder && pathIsInside(path, primaryFolder.link.canonicalPath)) {
        throw new Error("This file is already covered by the Primary Folder.");
      }
      return;
    }
    if (linkedSources.some((source) => source.role === "externalAttachment" && pathIsInside(source.link.canonicalPath, path))) {
      throw new Error("An existing External Attachment is already inside this Primary Folder.");
    }
  }

  private createManagedTextAsset(workspaceId: string, content: string): ManagedAsset {
    const workspace = this.requireWorkspace(workspaceId);
    const asset: ManagedAsset = {
      id: crypto.randomUUID(),
      kind: "managedAsset",
      workspaceId,
      name: "Typed mathematics",
      mediaType: "text/plain",
      content
    };
    this.state.sources.push(asset);
    workspace.context.sourceIds.push(asset.id);
    return asset;
  }

  private requireMission(workspaceId: string, missionId: string): StudyMission {
    const mission = this.state.missions.find(
      (candidate) => candidate.id === missionId && candidate.workspaceId === workspaceId
    );
    if (!mission) throw new Error("Choose a Study Mission in this Study Workspace.");
    return mission;
  }

  private resolveIntakeLocation(location?: StudyLocation): StudyLocation & { accessPolicy: SessionAccessPolicy } {
    if (!location) {
      return {
        workspaceId: this.state.quickStudy.workspace.id,
        missionId: this.state.quickStudy.mission.id,
        accessPolicy: "focused"
      };
    }
    const workspace = this.requireNamedWorkspace(location.workspaceId);
    const mission = this.requireMission(workspace.id, location.missionId);
    return { workspaceId: workspace.id, missionId: mission.id, accessPolicy: "workspace" };
  }

  private pauseActiveSession(): void {
    if (!this.state.activeSessionId) return;
    this.requireSession(this.state.activeSessionId).status = "paused";
  }

  private pauseActiveSessionAndMakeResumable(): LearningSession {
    const session = this.requireActiveSession();
    session.status = "paused";
    session.activityOrder = this.nextActivityOrder();
    this.state.resumeSessionId = session.id;
    this.state.activeSessionId = null;
    return session;
  }

  private nextActivityOrder(): number {
    this.state.activityOrder += 1;
    return this.state.activityOrder;
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function requiredName(value: string, subject: string): string {
  const name = value.trim();
  if (!name) throw new Error(`${subject} name is required.`);
  return name;
}

function requiredText(value: string, subject: string): string {
  const text = value.trim();
  if (!text) throw new Error(`${subject} text is required.`);
  return text;
}

function accessPolicyRank(policy: SessionAccessPolicy): number {
  return { focused: 0, workspace: 1, full: 2 }[policy];
}

function usefulRuntimeError(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Codex could not complete this Teaching Card. Check authentication and try again.";
}

function usefulSourceError(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "The source is missing or access is no longer available.";
}

function sameFingerprint(left: SourceFingerprint, right: SourceFingerprint): boolean {
  return left.size === right.size && left.modifiedAtMs === right.modifiedAtMs
    && left.contentHash === right.contentHash;
}

function pathIsInside(path: string, folderPath: string): boolean {
  const relation = relative(folderPath, path);
  return relation !== "" && relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation);
}

function mostRecentSessionId(sessions: LearningSession[]): string | null {
  return sessions.reduce<LearningSession | null>(
    (latest, session) => (!latest || session.activityOrder > latest.activityOrder ? session : latest),
    null
  )?.id ?? null;
}

function migratePersistedState(value: unknown): LearningApplicationState {
  if (!value || typeof value !== "object") throw new Error("Stored Learning Application state is invalid.");
  const stored = value as Record<string, unknown>;
  if (Array.isArray(stored.sessions)) {
    const current = value as LearningApplicationState;
    current.workspaces = current.workspaces.map((workspace) => ({
      ...workspace,
      context: {
        ...(workspace.context ?? emptyWorkspaceContext()),
        primaryFolderSourceId: workspace.context?.primaryFolderSourceId ?? null
      }
    }));
    current.sources = migrateWorkspaceSources(current.sources);
    current.sourceIndexes = migrateSourceIndexSummaries(stored.sourceIndexes);
    current.authentication ??= signedOutAuthentication();
    current.intakeError ??= null;
    current.runtimeAvailable ??= false;
    current.modelAccess ??= {
      status: "unavailable",
      cause: "runtime",
      message: "Codex Runtime is unavailable. Restart Codex and try again."
    };
    current.accessConfirmationPreference = migrateAccessConfirmationPreference(stored.accessConfirmationPreference);
    current.sessions = current.sessions.map((session) => ({
      ...session,
      sourceIds: session.sourceIds ?? [],
      proposal: session.proposal ?? defaultAcceptedProposal(),
      teachingCard: session.teachingCard ?? emptyTeachingCard(),
      teachingCardHistory: session.teachingCardHistory ?? [],
      submittedPendingQuestions: session.submittedPendingQuestions ?? [],
      currentTeachingInput: session.currentTeachingInput ?? { kind: "sessionIntake", text: session.mathematics },
      pendingQuestion: session.pendingQuestion ?? null,
      accessPolicy: migrateSessionAccessPolicy(session.accessPolicy),
      accessRequests: migrateAccessRequests(session.accessRequests),
      pendingFullAccessConfirmation: false,
      sourceAnchors: migrateSourceAnchors(session.sourceAnchors),
      sourceAnchorRequests: migrateSourceAnchorRequests(session.sourceAnchorRequests),
      activeSourceAnchorId: typeof session.activeSourceAnchorId === "string" ? session.activeSourceAnchorId : null
    }));
    attachManagedSourcesToLegacySessions(current);
    for (const session of current.sessions) validateSessionSourceAnchorReferences(current, session);
    return current;
  }

  if (!("session" in stored)) throw new Error("Stored Learning Application state uses an unsupported version.");
  const legacy = value as {
    session: Omit<LearningSession, "activityOrder"> | null;
  };
  const migrated = initialState();
  if (legacy.session) {
    const session: LearningSession = {
      ...legacy.session,
      sourceIds: [],
      status: "paused",
      activityOrder: 1,
      proposal: defaultAcceptedProposal(),
      teachingCard: emptyTeachingCard(),
      teachingCardHistory: [],
      submittedPendingQuestions: [],
      currentTeachingInput: { kind: "sessionIntake", text: legacy.session.mathematics },
      pendingQuestion: null,
      accessPolicy: "focused",
      accessRequests: [],
      pendingFullAccessConfirmation: false,
      sourceAnchors: [],
      sourceAnchorRequests: [],
      activeSourceAnchorId: null
    };
    migrated.sessions.push(session);
    attachManagedSourcesToLegacySessions(migrated);
    validateSessionSourceAnchorReferences(migrated, session);
    migrated.resumeSessionId = session.id;
    migrated.navigation = { workspaceId: session.workspaceId, missionId: session.missionId };
    migrated.activityOrder = 1;
  }
  return migrated;
}

function migrateAgentWorkLogs(value: unknown): Record<string, Array<ModelRuntimeEvent & { sequence: number }>> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Array<ModelRuntimeEvent & { sequence: number }>>
    : {};
}

function migrateAccessConfirmationPreference(value: unknown): LearningApplicationState["accessConfirmationPreference"] {
  if (value === undefined) return { confirmFullAccess: true };
  if (!isRecord(value) || typeof value.confirmFullAccess !== "boolean") {
    throw new Error("Stored Access Confirmation Preference is invalid.");
  }
  return { confirmFullAccess: value.confirmFullAccess };
}

function migrateSessionAccessPolicy(value: unknown): SessionAccessPolicy {
  if (value === undefined) return "focused";
  if (value === "focused" || value === "workspace" || value === "full") return value;
  throw new Error("Stored Session Access Policy is invalid.");
}

function migrateAccessRequests(value: unknown): SessionAccessRequest[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("Stored Access Request is invalid.");
  return value.map((candidate) => {
    if (!isRecord(candidate) || typeof candidate.id !== "string"
      || (candidate.requestedPolicy !== "workspace" && candidate.requestedPolicy !== "full")
      || typeof candidate.reason !== "string" || !candidate.reason.trim()
      || typeof candidate.exactScope !== "string" || !candidate.exactScope.trim()
      || typeof candidate.intendedAction !== "string" || !candidate.intendedAction.trim()
      || !["pending", "approved", "denied", "narrowed"].includes(String(candidate.status))
      || !(candidate.decidedPolicy === null || ["focused", "workspace", "full"].includes(String(candidate.decidedPolicy)))) {
      throw new Error("Stored Access Request is invalid.");
    }
    const hasDecision = candidate.status === "approved" || candidate.status === "narrowed";
    if (hasDecision !== (candidate.decidedPolicy !== null)) throw new Error("Stored Access Request is invalid.");
    return candidate as unknown as SessionAccessRequest;
  });
}

function defaultAcceptedProposal(): LearningSession["proposal"] {
  return {
    scope: "Work through the key mathematical idea",
    initialTeachingDirection: "Continue working through the key idea",
    status: "accepted",
    confirmationReason: null
  };
}

function emptyTeachingCard(): LearningSession["teachingCard"] {
  return { status: "idle", content: "", error: null, retryable: false };
}

function interruptedTeachingCard(content: string): LearningSession["teachingCard"] {
  return {
    status: "stopped",
    content,
    error: "Teaching stopped. You can retry without losing this Learning Session.",
    retryable: true
  };
}

function replaceTeachingCard(session: LearningSession, teachingCard: TeachingCardState): void {
  session.teachingCard = teachingCard;
  if (session.currentTeachingInput.kind !== "pendingQuestion") return;
  const submissionId = session.currentTeachingInput.submissionId;
  const submission = session.submittedPendingQuestions.find(
    (candidate) => candidate.id === submissionId
  );
  if (submission) submission.teachingCard = teachingCard;
}

function emptyWorkspaceContext(): WorkspaceContext {
  return { sourceIds: [], learnerContextIds: [], primaryFolderSourceId: null };
}

function linkedSource(
  workspaceId: string,
  role: LinkedSource["role"],
  selection: SelectedLocalSource
): LinkedSource {
  return {
    id: crypto.randomUUID(),
    kind: "linkedSource",
    role,
    workspaceId,
    name: selection.name,
    resourceType: selection.resourceType,
    link: {
      lastKnownPath: selection.lastKnownPath,
      canonicalPath: selection.canonicalPath,
      accessGrant: selection.accessGrant,
      fingerprint: selection.fingerprint,
      accessStatus: "available",
      error: null
    }
  };
}

function migrateWorkspaceSources(value: unknown): WorkspaceSource[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("Stored sources are invalid.");
  return value.map((candidate) => {
    if (!isRecord(candidate) || typeof candidate.id !== "string" || typeof candidate.workspaceId !== "string"
      || typeof candidate.name !== "string" || !candidate.name.trim()) {
      throw new Error("Stored source is invalid.");
    }
    if (candidate.kind === "managedAsset") {
      if (candidate.mediaType !== "text/plain" || typeof candidate.content !== "string") {
        throw new Error("Stored Managed Asset is invalid.");
      }
      return candidate as unknown as ManagedAsset;
    }
    if (candidate.kind !== "linkedSource" || !["primaryFolder", "externalAttachment"].includes(String(candidate.role))
      || !["file", "folder"].includes(String(candidate.resourceType)) || !isRecord(candidate.link)
      || typeof candidate.link.lastKnownPath !== "string" || !isAbsolute(candidate.link.lastKnownPath)
      || !(candidate.link.canonicalPath === undefined
        || (typeof candidate.link.canonicalPath === "string" && isAbsolute(candidate.link.canonicalPath)))
      || !validAccessGrant(candidate.link.accessGrant) || !validFingerprint(candidate.link.fingerprint)
      || !["available", "unavailable"].includes(String(candidate.link.accessStatus))
      || !(candidate.link.error === null || typeof candidate.link.error === "string")) {
      throw new Error("Stored Linked Source is invalid.");
    }
    const source = candidate as unknown as LinkedSource;
    source.link.canonicalPath = typeof candidate.link.canonicalPath === "string"
      ? candidate.link.canonicalPath
      : candidate.link.lastKnownPath as string;
    return source;
  });
}

function migrateSourceIndexSummaries(value: unknown): SourceIndexSummary[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("Stored Source Index status is invalid.");
  return value.map((candidate) => {
    if (!isRecord(candidate) || typeof candidate.sourceId !== "string"
      || !["ready", "cleared", "unavailable"].includes(String(candidate.status))
      || !(candidate.extractionMethod === null || ["embeddedText", "pdfText", "ocr"].includes(String(candidate.extractionMethod)))
      || !Number.isInteger(candidate.pageCount) || (candidate.pageCount as number) < 0
      || !Number.isInteger(candidate.equationCount) || (candidate.equationCount as number) < 0
      || !(candidate.error === null || typeof candidate.error === "string")) {
      throw new Error("Stored Source Index status is invalid.");
    }
    return candidate as unknown as SourceIndexSummary;
  });
}

function validatedSourceIndexDocuments(value: unknown): SourceIndexDocument[] {
  if (!Array.isArray(value)) throw new Error("Stored Source Index cache is invalid.");
  const documents = value.map((candidate) => {
    if (!isRecord(candidate) || typeof candidate.sourceId !== "string" || typeof candidate.sourceName !== "string"
      || typeof candidate.workspaceId !== "string" || !validFingerprint(candidate.fingerprint)) {
      throw new Error("Stored Source Index cache is invalid.");
    }
    if (!["embeddedText", "pdfText", "ocr"].includes(String(candidate.extractionMethod))
      || !Array.isArray(candidate.pages) || candidate.pages.length === 0 || candidate.pages.length > 10_000) {
      throw new Error("Stored Source Index cache is invalid.");
    }
    const pages = validatedCachedSourceIndexPages(candidate.pages);
    return {
      sourceId: candidate.sourceId,
      sourceName: candidate.sourceName,
      workspaceId: candidate.workspaceId,
      fingerprint: candidate.fingerprint,
      extractionMethod: candidate.extractionMethod as SourceIndexExtraction["extractionMethod"],
      pages
    };
  });
  if (new Set(documents.map((document) => document.sourceId)).size !== documents.length) {
    throw new Error("Stored Source Index cache is invalid.");
  }
  return documents;
}

function validatedCachedSourceIndexPages(value: unknown[]): CachedSourceIndexPage[] {
  const pageNumbers = new Set<number>();
  return value.map((candidate) => {
    if (!isRecord(candidate) || !Number.isInteger(candidate.pageNumber) || (candidate.pageNumber as number) < 1
      || typeof candidate.width !== "number" || !Number.isFinite(candidate.width) || candidate.width <= 0
      || typeof candidate.height !== "number" || !Number.isFinite(candidate.height) || candidate.height <= 0
      || typeof candidate.thumbnailDataUrl !== "string"
      || !/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(candidate.thumbnailDataUrl)
      || candidate.thumbnailDataUrl.length > 750_000 || !Array.isArray(candidate.regions)) {
      throw new Error("Stored Source Index cache is invalid.");
    }
    const pageNumber = candidate.pageNumber as number;
    if (pageNumbers.has(pageNumber)) throw new Error("Stored Source Index cache is invalid.");
    pageNumbers.add(pageNumber);
    const regions = candidate.regions.map((region) => {
      if (!isRecord(region) || (region.kind !== "text" && region.kind !== "equation")
        || !validSourceIndexBounds(region.bounds) || !Array.isArray(region.termHashes)
        || region.termHashes.some((hash) => typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash))) {
        throw new Error("Stored Source Index cache is invalid.");
      }
      const hasStart = region.sourceStartOffset !== undefined;
      const hasEnd = region.sourceEndOffset !== undefined;
      if (hasStart !== hasEnd || (hasStart && (!Number.isInteger(region.sourceStartOffset)
        || !Number.isInteger(region.sourceEndOffset) || (region.sourceStartOffset as number) < 0
        || (region.sourceEndOffset as number) <= (region.sourceStartOffset as number)))) {
        throw new Error("Stored Source Index cache is invalid.");
      }
      return {
        kind: region.kind as SourceIndexRegion["kind"],
        bounds: region.bounds as unknown as SourceIndexBounds,
        termHashes: [...new Set(region.termHashes as string[])],
        ...(hasStart ? {
          sourceStartOffset: region.sourceStartOffset as number,
          sourceEndOffset: region.sourceEndOffset as number
        } : {})
      };
    });
    return {
      pageNumber,
      width: candidate.width as number,
      height: candidate.height as number,
      thumbnailDataUrl: candidate.thumbnailDataUrl as string,
      regions
    };
  });
}

function validatedSourceIndexExtraction(value: unknown): SourceIndexExtraction {
  if (!isRecord(value) || !["embeddedText", "pdfText", "ocr"].includes(String(value.extractionMethod))
    || !Array.isArray(value.pages) || value.pages.length === 0 || value.pages.length > 10_000) {
    throw new Error("Extracted Source Index content is invalid.");
  }
  const pageNumbers = new Set<number>();
  const pages = value.pages.map((candidate) => {
    if (!isRecord(candidate) || !Number.isInteger(candidate.pageNumber) || (candidate.pageNumber as number) < 1
      || typeof candidate.width !== "number" || !Number.isFinite(candidate.width) || candidate.width <= 0
      || typeof candidate.height !== "number" || !Number.isFinite(candidate.height) || candidate.height <= 0
      || typeof candidate.thumbnailDataUrl !== "string"
      || !/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(candidate.thumbnailDataUrl)
      || candidate.thumbnailDataUrl.length > 750_000 || !Array.isArray(candidate.regions)) {
      throw new Error("Extracted Source Index page is invalid.");
    }
    const pageNumber = candidate.pageNumber as number;
    if (pageNumbers.has(pageNumber)) throw new Error("Extracted Source Index page is invalid.");
    pageNumbers.add(pageNumber);
    const regions = candidate.regions.map((region) => validatedSourceIndexRegion(region));
    return {
      pageNumber,
      width: candidate.width as number,
      height: candidate.height as number,
      thumbnailDataUrl: candidate.thumbnailDataUrl as string,
      regions
    };
  });
  return {
    extractionMethod: value.extractionMethod as SourceIndexExtraction["extractionMethod"],
    pages
  };
}

function validatedSourceIndexRegion(value: unknown): SourceIndexRegion {
  if (!isRecord(value) || (value.kind !== "text" && value.kind !== "equation")
    || typeof value.text !== "string" || !value.text.trim() || value.text.length > 60_000
    || !validSourceIndexBounds(value.bounds)) {
    throw new Error("Extracted Source Index region is invalid.");
  }
  const hasStart = value.sourceStartOffset !== undefined;
  const hasEnd = value.sourceEndOffset !== undefined;
  if (hasStart !== hasEnd || (hasStart && (!Number.isInteger(value.sourceStartOffset)
    || !Number.isInteger(value.sourceEndOffset) || (value.sourceStartOffset as number) < 0
    || (value.sourceEndOffset as number) <= (value.sourceStartOffset as number)))) {
    throw new Error("Extracted Source Index region is invalid.");
  }
  return {
    kind: value.kind,
    text: value.text,
    bounds: value.bounds as unknown as SourceIndexBounds,
    ...(hasStart ? {
      sourceStartOffset: value.sourceStartOffset as number,
      sourceEndOffset: value.sourceEndOffset as number
    } : {})
  };
}

function validSourceIndexBounds(value: unknown): value is SourceIndexBounds {
  if (!isRecord(value)) return false;
  const coordinates = [value.x, value.y, value.width, value.height];
  return coordinates.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))
    && (value.x as number) >= 0 && (value.y as number) >= 0
    && (value.width as number) > 0 && (value.height as number) > 0
    && (value.x as number) + (value.width as number) <= 1
    && (value.y as number) + (value.height as number) <= 1;
}

function searchTerms(query: string): string[] {
  return query.toLocaleLowerCase().split(/[^\p{L}\p{N}_]+/u).filter(Boolean);
}

function sourceIndexTermHash(term: string): string {
  return createHash("sha256").update(term).digest("hex");
}

function searchPreview(text: string, terms: string[]): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= 180) return normalized;
  const firstMatch = Math.max(0, ...terms.map((term) => normalized.toLocaleLowerCase().indexOf(term)));
  const start = Math.max(0, firstMatch - 60);
  const end = Math.min(normalized.length, start + 180);
  return `${start > 0 ? "…" : ""}${normalized.slice(start, end)}${end < normalized.length ? "…" : ""}`;
}

function sameIndexMatch(region: SourceIndexRegion, match: SourceSearchResult["match"]): boolean {
  return region.kind === match.kind && region.bounds.x === match.bounds.x && region.bounds.y === match.bounds.y
    && region.bounds.width === match.bounds.width && region.bounds.height === match.bounds.height
    && region.sourceStartOffset === match.sourceStartOffset && region.sourceEndOffset === match.sourceEndOffset;
}

function migrateSourceAnchors(value: unknown): SourceAnchor[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("Stored Source Anchors are invalid.");
  return value.map((candidate) => {
    if (!isRecord(candidate) || typeof candidate.id !== "string" || typeof candidate.sourceId !== "string"
    ) {
      throw new Error("Stored Source Anchor is invalid.");
    }
    return {
      id: candidate.id,
      sourceId: candidate.sourceId,
      selection: validatedSourceAnchorSelection(candidate.selection)
    };
  });
}

function migrateSourceAnchorRequests(value: unknown): SourceAnchorRequest[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("Stored Source Anchor requests are invalid.");
  return value.map((candidate) => {
    if (!isRecord(candidate) || typeof candidate.id !== "string" || typeof candidate.sourceAnchorId !== "string"
      || !isSourceAnchorPaletteAction(candidate.action)) {
      throw new Error("Stored Source Anchor request is invalid.");
    }
    return candidate as unknown as SourceAnchorRequest;
  });
}

function attachManagedSourcesToLegacySessions(state: LearningApplicationState): void {
  for (const session of state.sessions) {
    if (session.sourceIds.length > 0) continue;
    const source: ManagedAsset = {
      id: `migrated-source-${session.id}`,
      kind: "managedAsset",
      workspaceId: session.workspaceId,
      name: "Typed mathematics",
      mediaType: "text/plain",
      content: session.mathematics
    };
    state.sources.push(source);
    session.sourceIds.push(source.id);
    const workspace = state.workspaces.find((candidate) => candidate.id === session.workspaceId);
    if (workspace && !workspace.context.sourceIds.includes(source.id)) workspace.context.sourceIds.push(source.id);
  }
}

function validateSessionSourceAnchorReferences(state: LearningApplicationState, session: LearningSession): void {
  const anchorsById = new Map(session.sourceAnchors.map((anchor) => [anchor.id, anchor]));
  const sourceIds = new Set(session.sourceIds);
  const stateSources = new Map(state.sources.map((source) => [source.id, source]));
  const requestsAreValid = session.sourceAnchorRequests.every((request) => anchorsById.has(request.sourceAnchorId));
  const anchorsAreValid = session.sourceAnchors.every((anchor) => {
    const source = stateSources.get(anchor.sourceId);
    return sourceIds.has(anchor.sourceId) && source?.workspaceId === session.workspaceId;
  });
  const activeAnchorIsValid = session.activeSourceAnchorId === null || anchorsById.has(session.activeSourceAnchorId);
  const identifiersAreUnique = anchorsById.size === session.sourceAnchors.length
    && new Set(session.sourceAnchorRequests.map((request) => request.id)).size === session.sourceAnchorRequests.length;
  if (!requestsAreValid || !anchorsAreValid || !activeAnchorIsValid || !identifiersAreUnique) {
    throw new Error("Stored Source Anchor references are invalid.");
  }
}

function validatedSourceAnchorSelection(value: unknown, source?: WorkspaceSource): SourceAnchorSelection {
  if (!isRecord(value)) throw new Error("Choose a valid source region.");
  if (value.kind === "diagramRegion") {
    if (!isRecord(value.bounds)) throw new Error("Choose a bounded diagram region.");
    const bounds = value.bounds;
    if (![bounds.x, bounds.y, bounds.width, bounds.height].every(
      (coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate)
    ) || (bounds.x as number) < 0 || (bounds.y as number) < 0
      || (bounds.width as number) <= 0 || (bounds.height as number) <= 0
      || (bounds.x as number) + (bounds.width as number) > 1
      || (bounds.y as number) + (bounds.height as number) > 1) {
      throw new Error("Diagram-region bounds must be normalized within the Source Layer.");
    }
    return {
      kind: "diagramRegion",
      bounds: {
        x: bounds.x as number,
        y: bounds.y as number,
        width: bounds.width as number,
        height: bounds.height as number
      }
    };
  }
  if (value.kind !== "text" && value.kind !== "equation") throw new Error("Choose a valid source region.");
  const startOffset = value.startOffset;
  const endOffset = value.endOffset;
  if (!Number.isInteger(startOffset) || !Number.isInteger(endOffset)
    || (startOffset as number) < 0 || (endOffset as number) <= (startOffset as number)
    || typeof value.exactText !== "string" || value.exactText.length !== (endOffset as number) - (startOffset as number)
    || typeof value.prefix !== "string" || typeof value.suffix !== "string"
    || value.prefix.length > 32 || value.suffix.length > 32) {
    throw new Error("Text and equation anchors require a precise non-empty source range.");
  }
  const location: SourceTextLocation = {
    startOffset: startOffset as number,
    endOffset: endOffset as number,
    exactText: value.exactText,
    prefix: value.prefix,
    suffix: value.suffix
  };
  if (source?.kind === "managedAsset" && !matchesSourceTextLocation(source.content, location)) {
    throw new Error("The selected source text no longer matches this Source Layer.");
  }
  if (value.kind === "text") return { kind: "text", ...location };
  if (!Number.isInteger(value.equationIndex) || (value.equationIndex as number) < 0) {
    throw new Error("An equation anchor requires its equation location.");
  }
  return { kind: "equation", equationIndex: value.equationIndex as number, ...location };
}

function matchesSourceTextLocation(
  content: string,
  selection: SourceTextLocation
): boolean {
  return content.slice(selection.startOffset, selection.endOffset) === selection.exactText
    && content.slice(Math.max(0, selection.startOffset - selection.prefix.length), selection.startOffset) === selection.prefix
    && content.slice(selection.endOffset, selection.endOffset + selection.suffix.length) === selection.suffix;
}

export function isSourceAnchorPaletteAction(value: unknown): value is SourceAnchorPaletteAction {
  return value === "explain" || value === "question" || value === "annotate" || value === "addToLearningTrail";
}

export function isSourceAnchorSelection(value: unknown): value is SourceAnchorSelection {
  try {
    validatedSourceAnchorSelection(value);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validAccessGrant(value: unknown): value is LocalSourceAccessGrant {
  return value === null || (isRecord(value) && value.kind === "securityScopedBookmark"
    && typeof value.bookmarkData === "string" && Boolean(value.bookmarkData));
}

function validFingerprint(value: unknown): value is SourceFingerprint {
  return isRecord(value) && typeof value.size === "number" && Number.isFinite(value.size) && value.size >= 0
    && typeof value.modifiedAtMs === "number" && Number.isFinite(value.modifiedAtMs) && value.modifiedAtMs >= 0
    && (value.contentHash === undefined
      || (typeof value.contentHash === "string" && /^[a-f0-9]{64}$/.test(value.contentHash)));
}

function initialState(): LearningApplicationState {
  return {
    screen: "dashboard",
    quickStudy: {
      workspace: { id: "quick-study-workspace", kind: "system", name: "Quick Study" },
      mission: {
        id: "quick-study-unfiled-mission",
        kind: "unfiled",
        workspaceId: "quick-study-workspace"
      }
    },
    workspaces: [{
      id: "quick-study-workspace",
      kind: "system",
      name: "Quick Study",
      context: emptyWorkspaceContext()
    }],
    missions: [
      {
        id: "quick-study-unfiled-mission",
        kind: "unfiled",
        workspaceId: "quick-study-workspace",
        name: "Unfiled"
      }
    ],
    sessions: [],
    sources: [],
    sourceIndexes: [],
    activeSessionId: null,
    resumeSessionId: null,
    navigation: {
      workspaceId: "quick-study-workspace",
      missionId: "quick-study-unfiled-mission"
    },
    activityOrder: 0,
    authentication: signedOutAuthentication(),
    intakeError: null,
    runtimeAvailable: false,
    modelAccess: {
      status: "unavailable",
      cause: "runtime",
      message: "Codex Runtime is unavailable. Restart Codex and try again."
    },
    accessConfirmationPreference: { confirmFullAccess: true }
  };
}

function unavailableModelAccess(error: unknown): Extract<ModelAccessState, { status: "unavailable" }> {
  const message = usefulRuntimeError(error);
  return {
    status: "unavailable",
    cause: error instanceof ModelAccessError ? error.cause : "runtime",
    message
  };
}

function authenticationMessage(authentication: Exclude<AuthenticationState, { status: "signedIn" }>): string {
  if (authentication.status === "failed") return authentication.error;
  if (authentication.status === "signingIn") return "Finish Codex authentication to restore model teaching.";
  return "Codex authentication is required for model teaching.";
}

function authenticationView(authentication: AuthenticationState): LearningApplicationState["authentication"] {
  switch (authentication.status) {
    case "signedOut":
      return signedOutAuthentication();
    case "signingIn":
      return {
        status: "signingIn",
        method: authentication.method,
        accountLabel: null,
        loginUrl: null,
        error: null
      };
    case "signedIn":
      return {
        status: "signedIn",
        method: authentication.method,
        accountLabel: authentication.accountLabel,
        loginUrl: null,
        error: null
      };
    case "failed":
      return {
        status: "failed",
        method: authentication.method,
        accountLabel: null,
        loginUrl: null,
        error: authentication.error
      };
  }
}

function signedOutAuthentication(): LearningApplicationState["authentication"] {
  return { status: "signedOut", method: null, accountLabel: null, loginUrl: null, error: null };
}

function failedAuthentication(
  method: "chatgpt" | "apiKey" | null,
  error: unknown
): LearningApplicationState["authentication"] {
  return {
    status: "failed",
    method,
    accountLabel: null,
    loginUrl: null,
    error: usefulRuntimeError(error)
  };
}
