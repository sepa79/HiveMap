/**
 * Responsibility: Define the backend-neutral HiveMap persistence port and persisted record shapes.
 * Must not: Perform IO, select a backend, expose SQL rows, or implement runtime semantics.
 * Contract: All store adapters preserve these explicit validated domain shapes.
 */
import type { CapturePolicy, FeedbackEvent, GraphProposal } from "@hivemap/capture";
import type { CategoryAssignment, CategoryCatalog } from "@hivemap/categories";
import type { SemanticGraph } from "@hivemap/graph-core";
import type { Projection } from "@hivemap/projections";
import type { ScanProfile, ScanRun } from "@hivemap/scans";

export type WorkspaceRecord = {
  id: string;
  slug?: string;
  name: string;
  archived?: boolean;
  createdAt: string;
  updatedAt?: string;
};

export type WorkspaceState = {
  workspace: WorkspaceRecord;
  graphId: string;
  graph: SemanticGraph;
  categoryCatalog: CategoryCatalog;
  categoryAssignments: CategoryAssignment[];
  capturePolicy: CapturePolicy;
  feedbackEvents: FeedbackEvent[];
  proposals: GraphProposal[];
  projections: Projection[];
  scanProfiles: ScanProfile[];
  scanRuns: ScanRun[];
};

export type ConceptEmbeddingRecord = {
  workspaceId: string;
  nodeId: string;
  model: string;
  contentDigest: string;
  embedding: number[];
  createdAt: string;
  updatedAt: string;
};

export type SimilarConceptMatchRecord = {
  nodeId: string;
  score: number;
  contentDigest: string;
  updatedAt: string;
};

export type RepositoryIndexMode = "safe" | "deep";

export type RepositoryIndexStage =
  | "requested"
  | "resolving_ref"
  | "checking_out"
  | "discovering"
  | "indexing_syntax"
  | "running_rules"
  | "embedding_changed_chunks"
  | "normalizing"
  | "completed"
  | "failed"
  | "cancelled";

export type RepositoryIndexRecord = {
  id: string;
  workspaceId: string;
  repositoryUrl: string;
  requestedRef?: string;
  resolvedCommit?: string;
  mode: RepositoryIndexMode;
  stage: RepositoryIndexStage;
  requestedAt: string;
  updatedAt: string;
  completedAt?: string;
  actor: {
    agentId: string;
    tool: string;
  };
  failure?: {
    code: string;
    message: string;
  };
  stats?: {
    fileCount: number;
    chunkCount: number;
    indexedBytes: number;
  };
};

export type RepositoryFileRecord = {
  workspaceId: string;
  indexId: string;
  path: string;
  language: string;
  sourceKind: string;
  contentHash: string;
  byteSize: number;
};

export type RepositoryChunkRecord = {
  workspaceId: string;
  indexId: string;
  id: string;
  filePath: string;
  language: string;
  sourceKind: string;
  startLine: number;
  endLine: number;
  text: string;
  contentHash: string;
};

export type RepositorySymbolRecord = {
  workspaceId: string;
  indexId: string;
  key: string;
  filePath: string;
  language: string;
  name: string;
  qualifiedName: string;
  kind: string;
  parentSymbolKey?: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  isExported: boolean;
  isPublic: boolean;
  producerTool: string;
  producerVersion: string;
};

export type RepositoryReferenceRecord = {
  workspaceId: string;
  indexId: string;
  key: string;
  filePath: string;
  language: string;
  sourceKind: string;
  kind: string;
  targetText: string;
  resolvedSymbolKey?: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  resolutionConfidence: string;
  producerTool: string;
  producerVersion: string;
};

export type RepositoryDependencyRecord = {
  workspaceId: string;
  indexId: string;
  key: string;
  filePath: string;
  language: string;
  sourceKind: string;
  kind: string;
  targetText: string;
  targetFilePath?: string;
  targetSymbolKey?: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  resolutionConfidence: string;
  producerTool: string;
  producerVersion: string;
};

export type RepositorySearchMatchRecord = {
  kind: "file" | "chunk";
  filePath: string;
  language: string;
  sourceKind: string;
  score: number;
  snippet: string;
  startLine?: number;
  endLine?: number;
};

export interface HiveMapStore {
  initialize(): Promise<void>;
  checkConnection(): Promise<void>;
  close(): Promise<void>;
  listWorkspaces(): Promise<WorkspaceRecord[]>;
  getWorkspaceRecord(workspaceId: string): Promise<WorkspaceRecord>;
  workspaceExists(workspaceId: string): Promise<boolean>;
  deleteWorkspace(workspaceId: string): Promise<void>;
  saveWorkspaceState(state: WorkspaceState): Promise<void>;
  replaceWorkspaceState(state: WorkspaceState): Promise<void>;
  loadWorkspaceState(workspaceId: string): Promise<WorkspaceState>;
  upsertConceptEmbedding(record: ConceptEmbeddingRecord): Promise<void>;
  getConceptEmbedding(workspaceId: string, nodeId: string, model: string): Promise<ConceptEmbeddingRecord | undefined>;
  listSimilarConceptEmbeddings(
    workspaceId: string,
    nodeId: string,
    model: string,
    limit: number,
  ): Promise<SimilarConceptMatchRecord[]>;
  listRepositoryIndexes(workspaceId: string): Promise<RepositoryIndexRecord[]>;
  getRepositoryIndex(workspaceId: string, indexId: string): Promise<RepositoryIndexRecord>;
  upsertRepositoryIndex(record: RepositoryIndexRecord): Promise<void>;
  listRepositoryIndexFiles(workspaceId: string, indexId: string): Promise<RepositoryFileRecord[]>;
  listRepositoryIndexChunks(workspaceId: string, indexId: string): Promise<RepositoryChunkRecord[]>;
  listRepositoryIndexSymbols(workspaceId: string, indexId: string): Promise<RepositorySymbolRecord[]>;
  listRepositoryIndexReferences(workspaceId: string, indexId: string): Promise<RepositoryReferenceRecord[]>;
  listRepositoryIndexDependencies(workspaceId: string, indexId: string): Promise<RepositoryDependencyRecord[]>;
  replaceRepositoryIndexContents(
    workspaceId: string,
    indexId: string,
    files: RepositoryFileRecord[],
    chunks: RepositoryChunkRecord[],
    symbols?: RepositorySymbolRecord[],
    references?: RepositoryReferenceRecord[],
    dependencies?: RepositoryDependencyRecord[],
  ): Promise<void>;
  searchRepositoryIndex(workspaceId: string, indexId: string, query: string, limit: number): Promise<RepositorySearchMatchRecord[]>;
}

export type HiveMapStoreRuntimeConfig = { backend: "postgres"; connectionString: string };
