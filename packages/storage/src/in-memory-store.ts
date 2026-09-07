/**
 * Responsibility: Provide an isolated in-memory HiveMapStore adapter for tests and transient runtimes.
 * Must not: Perform IO, silently repair state, or diverge from the shared HiveMapStore contract.
 * Contract: Clones validated records at the boundary and preserves repository-index ownership invariants.
 */
import type {
  ConceptEmbeddingRecord,
  HiveMapStore,
  RepositoryChunkRecord,
  RepositoryDependencyRecord,
  RepositoryFileRecord,
  RepositoryIndexRecord,
  RepositoryReferenceRecord,
  RepositorySearchMatchRecord,
  RepositorySymbolRecord,
  SimilarConceptMatchRecord,
  WorkspaceRecord,
  WorkspaceState,
} from "./contracts.js";
import { StorageError } from "./storage-error.js";
import {
  assertNonEmpty,
  assertRepositoryIndexContentOwnership,
  cloneConceptEmbeddingRecord,
  cloneRepositoryIndexRecord,
  cloneWorkspaceRecord,
  cloneWorkspaceState,
  compareRepositoryIndexRecords,
  compareWorkspaceRecords,
  conceptEmbeddingKey,
  cosineSimilarity,
  isDefined,
  repositoryIndexKey,
  scoreTextMatch,
  tokenizeSearchQuery,
  trimSnippet,
  validateConceptEmbeddingRecord,
  validateRepositoryChunkRecord,
  validateRepositoryDependencyRecord,
  validateRepositoryFileRecord,
  validateRepositoryIndexRecord,
  validateRepositoryReferenceRecord,
  validateRepositorySymbolRecord,
  validateWorkspaceState,
} from "./store-support.js";

export class InMemoryHiveMapStore implements HiveMapStore {
  private readonly workspaces = new Map<string, WorkspaceState>();
  private readonly conceptEmbeddings = new Map<string, ConceptEmbeddingRecord>();
  private readonly repositoryIndexes = new Map<string, RepositoryIndexRecord>();
  private readonly repositoryFiles = new Map<string, RepositoryFileRecord[]>();
  private readonly repositoryChunks = new Map<string, RepositoryChunkRecord[]>();
  private readonly repositorySymbols = new Map<string, RepositorySymbolRecord[]>();
  private readonly repositoryReferences = new Map<string, RepositoryReferenceRecord[]>();
  private readonly repositoryDependencies = new Map<string, RepositoryDependencyRecord[]>();

  async initialize(): Promise<void> {}

  async checkConnection(): Promise<void> {}

  async close(): Promise<void> {}

  async listWorkspaces(): Promise<WorkspaceRecord[]> {
    return [...this.workspaces.values()]
      .map((state) => cloneWorkspaceRecord(state.workspace))
      .sort(compareWorkspaceRecords);
  }

  async getWorkspaceRecord(workspaceId: string): Promise<WorkspaceRecord> {
    assertNonEmpty("workspaceId", workspaceId);
    const state = this.workspaces.get(workspaceId);
    if (state === undefined) {
      throw new StorageError(`Workspace not found: ${workspaceId}`);
    }
    return cloneWorkspaceRecord(state.workspace);
  }

  async workspaceExists(workspaceId: string): Promise<boolean> {
    assertNonEmpty("workspaceId", workspaceId);
    return this.workspaces.has(workspaceId);
  }

  async deleteWorkspace(workspaceId: string): Promise<void> {
    assertNonEmpty("workspaceId", workspaceId);
    if (!this.workspaces.delete(workspaceId)) {
      throw new StorageError(`Workspace not found: ${workspaceId}`);
    }
    this.deleteRepositoryIndexData(workspaceId);
  }

  async saveWorkspaceState(state: WorkspaceState): Promise<void> {
    validateWorkspaceState(state);
    this.workspaces.set(state.workspace.id, cloneWorkspaceState(state));
    this.pruneConceptEmbeddings(state);
  }

  async replaceWorkspaceState(state: WorkspaceState): Promise<void> {
    validateWorkspaceState(state);
    if (!this.workspaces.has(state.workspace.id)) {
      throw new StorageError(`Workspace not found for replacement: ${state.workspace.id}`);
    }
    this.deleteRepositoryIndexData(state.workspace.id);
    this.workspaces.set(state.workspace.id, cloneWorkspaceState(state));
    this.pruneConceptEmbeddings(state);
  }

  async loadWorkspaceState(workspaceId: string): Promise<WorkspaceState> {
    assertNonEmpty("workspaceId", workspaceId);
    const state = this.workspaces.get(workspaceId);
    if (state === undefined) {
      throw new StorageError(`Workspace not found: ${workspaceId}`);
    }
    return cloneWorkspaceState(state);
  }

  async upsertConceptEmbedding(record: ConceptEmbeddingRecord): Promise<void> {
    validateConceptEmbeddingRecord(record);
    this.conceptEmbeddings.set(conceptEmbeddingKey(record.workspaceId, record.nodeId, record.model), cloneConceptEmbeddingRecord(record));
  }

  async getConceptEmbedding(workspaceId: string, nodeId: string, model: string): Promise<ConceptEmbeddingRecord | undefined> {
    assertNonEmpty("workspaceId", workspaceId);
    assertNonEmpty("nodeId", nodeId);
    assertNonEmpty("model", model);
    const record = this.conceptEmbeddings.get(conceptEmbeddingKey(workspaceId, nodeId, model));
    return record === undefined ? undefined : cloneConceptEmbeddingRecord(record);
  }

  async listSimilarConceptEmbeddings(
    workspaceId: string,
    nodeId: string,
    model: string,
    limit: number,
  ): Promise<SimilarConceptMatchRecord[]> {
    assertNonEmpty("workspaceId", workspaceId);
    assertNonEmpty("nodeId", nodeId);
    assertNonEmpty("model", model);
    if (!Number.isInteger(limit) || limit < 1) {
      throw new StorageError("limit must be a positive integer");
    }

    const source = this.conceptEmbeddings.get(conceptEmbeddingKey(workspaceId, nodeId, model));
    if (source === undefined) {
      return [];
    }

    return [...this.conceptEmbeddings.values()]
      .filter((candidate) => candidate.workspaceId === workspaceId && candidate.model === model && candidate.nodeId !== nodeId)
      .map((candidate) => ({
        nodeId: candidate.nodeId,
        score: cosineSimilarity(source.embedding, candidate.embedding),
        contentDigest: candidate.contentDigest,
        updatedAt: candidate.updatedAt,
      }))
      .sort((left, right) => right.score - left.score || left.nodeId.localeCompare(right.nodeId))
      .slice(0, limit)
      .map((match) => ({ ...match }));
  }

  async listRepositoryIndexes(workspaceId: string): Promise<RepositoryIndexRecord[]> {
    assertNonEmpty("workspaceId", workspaceId);
    return [...this.repositoryIndexes.values()]
      .filter((record) => record.workspaceId === workspaceId)
      .sort(compareRepositoryIndexRecords)
      .map((record) => cloneRepositoryIndexRecord(record));
  }

  async getRepositoryIndex(workspaceId: string, indexId: string): Promise<RepositoryIndexRecord> {
    assertNonEmpty("workspaceId", workspaceId);
    assertNonEmpty("indexId", indexId);
    const record = this.repositoryIndexes.get(repositoryIndexKey(workspaceId, indexId));
    if (record === undefined) {
      throw new StorageError(`Repository index not found: ${workspaceId}/${indexId}`);
    }
    return cloneRepositoryIndexRecord(record);
  }

  async upsertRepositoryIndex(record: RepositoryIndexRecord): Promise<void> {
    validateRepositoryIndexRecord(record);
    if (!this.workspaces.has(record.workspaceId)) {
      throw new StorageError(`Workspace not found: ${record.workspaceId}`);
    }
    this.repositoryIndexes.set(repositoryIndexKey(record.workspaceId, record.id), cloneRepositoryIndexRecord(record));
  }

  async listRepositoryIndexFiles(workspaceId: string, indexId: string): Promise<RepositoryFileRecord[]> {
    assertNonEmpty("workspaceId", workspaceId);
    assertNonEmpty("indexId", indexId);
    const key = repositoryIndexKey(workspaceId, indexId);
    if (!this.repositoryIndexes.has(key)) {
      throw new StorageError(`Repository index not found: ${workspaceId}/${indexId}`);
    }
    return structuredClone(this.repositoryFiles.get(key) ?? []);
  }

  async listRepositoryIndexChunks(workspaceId: string, indexId: string): Promise<RepositoryChunkRecord[]> {
    assertNonEmpty("workspaceId", workspaceId);
    assertNonEmpty("indexId", indexId);
    const key = repositoryIndexKey(workspaceId, indexId);
    if (!this.repositoryIndexes.has(key)) {
      throw new StorageError(`Repository index not found: ${workspaceId}/${indexId}`);
    }
    return structuredClone(this.repositoryChunks.get(key) ?? []);
  }

  async listRepositoryIndexSymbols(workspaceId: string, indexId: string): Promise<RepositorySymbolRecord[]> {
    assertNonEmpty("workspaceId", workspaceId);
    assertNonEmpty("indexId", indexId);
    const key = repositoryIndexKey(workspaceId, indexId);
    if (!this.repositoryIndexes.has(key)) {
      throw new StorageError(`Repository index not found: ${workspaceId}/${indexId}`);
    }
    return structuredClone(this.repositorySymbols.get(key) ?? []);
  }

  async listRepositoryIndexReferences(workspaceId: string, indexId: string): Promise<RepositoryReferenceRecord[]> {
    assertNonEmpty("workspaceId", workspaceId);
    assertNonEmpty("indexId", indexId);
    const key = repositoryIndexKey(workspaceId, indexId);
    if (!this.repositoryIndexes.has(key)) {
      throw new StorageError(`Repository index not found: ${workspaceId}/${indexId}`);
    }
    return structuredClone(this.repositoryReferences.get(key) ?? []);
  }

  async listRepositoryIndexDependencies(workspaceId: string, indexId: string): Promise<RepositoryDependencyRecord[]> {
    assertNonEmpty("workspaceId", workspaceId);
    assertNonEmpty("indexId", indexId);
    const key = repositoryIndexKey(workspaceId, indexId);
    if (!this.repositoryIndexes.has(key)) {
      throw new StorageError(`Repository index not found: ${workspaceId}/${indexId}`);
    }
    return structuredClone(this.repositoryDependencies.get(key) ?? []);
  }

  async replaceRepositoryIndexContents(
    workspaceId: string,
    indexId: string,
    files: RepositoryFileRecord[],
    chunks: RepositoryChunkRecord[],
    symbols: RepositorySymbolRecord[] = [],
    references: RepositoryReferenceRecord[] = [],
    dependencies: RepositoryDependencyRecord[] = [],
  ): Promise<void> {
    assertNonEmpty("workspaceId", workspaceId);
    assertNonEmpty("indexId", indexId);
    if (!this.workspaces.has(workspaceId)) {
      throw new StorageError(`Workspace not found: ${workspaceId}`);
    }
    const key = repositoryIndexKey(workspaceId, indexId);
    if (!this.repositoryIndexes.has(key)) {
      throw new StorageError(`Repository index not found: ${workspaceId}/${indexId}`);
    }
    for (const file of files) {
      validateRepositoryFileRecord(file);
      assertRepositoryIndexContentOwnership("repository file", workspaceId, indexId, file.workspaceId, file.indexId);
    }
    for (const chunk of chunks) {
      validateRepositoryChunkRecord(chunk);
      assertRepositoryIndexContentOwnership("repository chunk", workspaceId, indexId, chunk.workspaceId, chunk.indexId);
    }
    for (const symbol of symbols) {
      validateRepositorySymbolRecord(symbol);
      assertRepositoryIndexContentOwnership("repository symbol", workspaceId, indexId, symbol.workspaceId, symbol.indexId);
    }
    for (const reference of references) {
      validateRepositoryReferenceRecord(reference);
      assertRepositoryIndexContentOwnership("repository reference", workspaceId, indexId, reference.workspaceId, reference.indexId);
    }
    for (const dependency of dependencies) {
      validateRepositoryDependencyRecord(dependency);
      assertRepositoryIndexContentOwnership("repository dependency", workspaceId, indexId, dependency.workspaceId, dependency.indexId);
    }
    this.repositoryFiles.set(key, structuredClone(files));
    this.repositoryChunks.set(key, structuredClone(chunks));
    this.repositorySymbols.set(key, structuredClone(symbols));
    this.repositoryReferences.set(key, structuredClone(references));
    this.repositoryDependencies.set(key, structuredClone(dependencies));
  }

  async searchRepositoryIndex(workspaceId: string, indexId: string, query: string, limit: number): Promise<RepositorySearchMatchRecord[]> {
    assertNonEmpty("workspaceId", workspaceId);
    assertNonEmpty("indexId", indexId);
    assertNonEmpty("query", query);
    if (!Number.isInteger(limit) || limit < 1) {
      throw new StorageError("limit must be a positive integer");
    }
    const key = repositoryIndexKey(workspaceId, indexId);
    if (!this.repositoryIndexes.has(key)) {
      throw new StorageError(`Repository index not found: ${workspaceId}/${indexId}`);
    }

    const normalizedTerms = tokenizeSearchQuery(query);
    const fileMatches = (this.repositoryFiles.get(key) ?? [])
      .map((file) => {
        const haystack = `${file.path}\n${file.language}\n${file.sourceKind}`.toLocaleLowerCase();
        const score = scoreTextMatch(haystack, normalizedTerms);
        if (score === 0) {
          return undefined;
        }
        return {
          kind: "file" as const,
          filePath: file.path,
          language: file.language,
          sourceKind: file.sourceKind,
          score,
          snippet: file.path,
        };
      })
      .filter(isDefined);

    const chunkMatches = (this.repositoryChunks.get(key) ?? [])
      .map((chunk) => {
        const haystack = `${chunk.filePath}\n${chunk.text}`.toLocaleLowerCase();
        const score = scoreTextMatch(haystack, normalizedTerms);
        if (score === 0) {
          return undefined;
        }
        return {
          kind: "chunk" as const,
          filePath: chunk.filePath,
          language: chunk.language,
          sourceKind: chunk.sourceKind,
          score,
          snippet: trimSnippet(chunk.text, normalizedTerms),
          startLine: chunk.startLine,
          endLine: chunk.endLine,
        };
      })
      .filter(isDefined);

    return [...chunkMatches, ...fileMatches]
      .sort((left, right) => right.score - left.score || left.filePath.localeCompare(right.filePath))
      .slice(0, limit)
      .map((match) => ({ ...match }));
  }

  private pruneConceptEmbeddings(state: WorkspaceState): void {
    const validNodeIds = new Set(state.graph.nodes.filter((node) => node.type === "concept").map((node) => node.id));
    for (const [key, record] of this.conceptEmbeddings.entries()) {
      if (record.workspaceId === state.workspace.id && !validNodeIds.has(record.nodeId)) {
        this.conceptEmbeddings.delete(key);
      }
    }
  }

  private deleteRepositoryIndexData(workspaceId: string): void {
    for (const key of [...this.repositoryIndexes.keys()]) {
      if (key.startsWith(`${workspaceId}\u0000`)) {
        this.repositoryIndexes.delete(key);
        this.repositoryFiles.delete(key);
        this.repositoryChunks.delete(key);
        this.repositorySymbols.delete(key);
        this.repositoryReferences.delete(key);
        this.repositoryDependencies.delete(key);
      }
    }
  }
}
