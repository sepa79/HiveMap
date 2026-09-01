/**
 * Responsibility: Validate and clone storage-domain records shared by explicit store adapters.
 * Must not: Perform IO, select a backend, repair invalid data, or implement runtime semantics.
 * Contract: Supplies deterministic validation, keys, comparisons, search scoring, and immutable clones.
 */
import { validateGraphProposal, validateCapturePolicy, validateFeedbackEvents } from "@hivemap/capture";
import { validateCategoryAssignments, validateCategoryCatalog, type CategoryAssignmentTargetIndex } from "@hivemap/categories";
import { validateGraph, type SemanticGraph } from "@hivemap/graph-core";
import { validateProjection, type Projection } from "@hivemap/projections";
import {
  assertCanonicalRepositoryLocation,
  RepositoryLocationValidationError,
  validateScanState,
} from "@hivemap/scans";

import type {
  ConceptEmbeddingRecord,
  RepositoryChunkRecord,
  RepositoryDependencyRecord,
  RepositoryFileRecord,
  RepositoryIndexRecord,
  RepositoryIndexStage,
  RepositoryReferenceRecord,
  RepositorySymbolRecord,
  WorkspaceRecord,
  WorkspaceState,
} from "./contracts.js";
import { StorageError } from "./storage-error.js";

export function validateWorkspaceState(state: WorkspaceState): void {
  validateWorkspaceRecord(state.workspace);
  assertNonEmpty("graphId", state.graphId);
  validateGraph(state.graph);
  validateCategoryCatalog(state.categoryCatalog);
  validateCategoryAssignments(state.categoryAssignments, state.categoryCatalog, createTargetIndex(state.graph, state.projections));
  validateCapturePolicy(state.capturePolicy);
  validateFeedbackEvents(state.feedbackEvents);
  for (const proposal of state.proposals) {
    validateGraphProposal(proposal);
  }
  for (const projection of state.projections) {
    validateProjection(projection, state.graph);
  }
  validateScanState(state.scanProfiles, state.scanRuns, state.graph);
}

export function createTargetIndex(graph: SemanticGraph, projections: readonly Projection[]): CategoryAssignmentTargetIndex {
  return {
    nodeIds: graph.nodes.map((node) => node.id),
    edgeIds: graph.edges.map((edge) => edge.id),
    projectionIds: projections.map((projection) => projection.id),
  };
}

export function serializeVector(values: readonly number[]): string {
  if (values.length === 0) {
    throw new StorageError("embedding must contain at least one value");
  }
  for (const value of values) {
    if (!Number.isFinite(value)) {
      throw new StorageError("embedding values must be finite numbers");
    }
  }
  return `[${values.join(",")}]`;
}

export function normalizeTimestampText(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new StorageError(`Invalid timestamp from storage: ${value}`);
  }
  return new Date(timestamp).toISOString();
}

export function cloneWorkspaceState(state: WorkspaceState): WorkspaceState {
  return structuredClone(state);
}

export function cloneWorkspaceRecord(workspace: WorkspaceRecord): WorkspaceRecord {
  return structuredClone(workspace);
}

export function cloneConceptEmbeddingRecord(record: ConceptEmbeddingRecord): ConceptEmbeddingRecord {
  return structuredClone(record);
}

export function cloneRepositoryIndexRecord(record: RepositoryIndexRecord): RepositoryIndexRecord {
  return structuredClone(record);
}

export function compareWorkspaceRecords(left: WorkspaceRecord, right: WorkspaceRecord): number {
  const byName = left.name.localeCompare(right.name);
  return byName !== 0 ? byName : left.id.localeCompare(right.id);
}

export function compareRepositoryIndexRecords(left: RepositoryIndexRecord, right: RepositoryIndexRecord): number {
  const leftRequested = Date.parse(left.requestedAt);
  const rightRequested = Date.parse(right.requestedAt);
  if (leftRequested !== rightRequested) {
    return rightRequested - leftRequested;
  }
  return left.id.localeCompare(right.id);
}

export function assertNonEmpty(fieldName: string, value: string): void {
  if (value.trim().length === 0) {
    throw new StorageError(`${fieldName} must be non-empty`);
  }
}

export function validateConceptEmbeddingRecord(record: ConceptEmbeddingRecord): void {
  assertNonEmpty("workspaceId", record.workspaceId);
  assertNonEmpty("nodeId", record.nodeId);
  assertNonEmpty("model", record.model);
  assertNonEmpty("contentDigest", record.contentDigest);
  assertNonEmpty("createdAt", record.createdAt);
  assertNonEmpty("updatedAt", record.updatedAt);
  normalizeTimestampText(record.createdAt);
  normalizeTimestampText(record.updatedAt);
  serializeVector(record.embedding);
}

export function validateRepositoryIndexRecord(record: RepositoryIndexRecord): void {
  assertNonEmpty("workspaceId", record.workspaceId);
  assertNonEmpty("id", record.id);
  try {
    assertCanonicalRepositoryLocation(record.repositoryUrl);
  } catch (error) {
    if (error instanceof RepositoryLocationValidationError) {
      throw new StorageError(error.message);
    }
    throw error;
  }
  if (record.requestedRef !== undefined) {
    assertNonEmpty("requestedRef", record.requestedRef);
  }
  if (record.resolvedCommit !== undefined) {
    assertNonEmpty("resolvedCommit", record.resolvedCommit);
  }
  if (record.mode !== "safe" && record.mode !== "deep") {
    throw new StorageError(`Unsupported repository index mode: ${record.mode}`);
  }
  if (!REPOSITORY_INDEX_STAGES.has(record.stage)) {
    throw new StorageError(`Unsupported repository index stage: ${record.stage}`);
  }
  assertNonEmpty("requestedAt", record.requestedAt);
  assertNonEmpty("updatedAt", record.updatedAt);
  normalizeTimestampText(record.requestedAt);
  normalizeTimestampText(record.updatedAt);
  assertNonEmpty("actor.agentId", record.actor.agentId);
  assertNonEmpty("actor.tool", record.actor.tool);

  const isTerminalStage = record.stage === "completed" || record.stage === "failed" || record.stage === "cancelled";
  if (record.completedAt !== undefined) {
    normalizeTimestampText(record.completedAt);
  }
  if (isTerminalStage !== (record.completedAt !== undefined)) {
    throw new StorageError("repository index terminal stages must match completedAt presence");
  }

  if (record.stage === "failed") {
    if (record.failure === undefined) {
      throw new StorageError("repository index failed stage requires failure details");
    }
    assertNonEmpty("failure.code", record.failure.code);
    assertNonEmpty("failure.message", record.failure.message);
  } else if (record.failure !== undefined) {
    throw new StorageError("repository index failure details are only valid for failed stage");
  }

  if (record.stats !== undefined) {
    if (!Number.isInteger(record.stats.fileCount) || record.stats.fileCount < 0) {
      throw new StorageError("repository index stats.fileCount must be a non-negative integer");
    }
    if (!Number.isInteger(record.stats.chunkCount) || record.stats.chunkCount < 0) {
      throw new StorageError("repository index stats.chunkCount must be a non-negative integer");
    }
    if (!Number.isInteger(record.stats.indexedBytes) || record.stats.indexedBytes < 0) {
      throw new StorageError("repository index stats.indexedBytes must be a non-negative integer");
    }
  }
}

export function validateRepositoryFileRecord(record: RepositoryFileRecord): void {
  assertNonEmpty("workspaceId", record.workspaceId);
  assertNonEmpty("indexId", record.indexId);
  assertNonEmpty("path", record.path);
  assertNonEmpty("language", record.language);
  assertNonEmpty("sourceKind", record.sourceKind);
  assertNonEmpty("contentHash", record.contentHash);
  if (!Number.isInteger(record.byteSize) || record.byteSize < 0) {
    throw new StorageError("byteSize must be a non-negative integer");
  }
}

export function validateRepositoryChunkRecord(record: RepositoryChunkRecord): void {
  assertNonEmpty("workspaceId", record.workspaceId);
  assertNonEmpty("indexId", record.indexId);
  assertNonEmpty("id", record.id);
  assertNonEmpty("filePath", record.filePath);
  assertNonEmpty("language", record.language);
  assertNonEmpty("sourceKind", record.sourceKind);
  assertNonEmpty("text", record.text);
  assertNonEmpty("contentHash", record.contentHash);
  if (!Number.isInteger(record.startLine) || record.startLine < 1) {
    throw new StorageError("startLine must be a positive integer");
  }
  if (!Number.isInteger(record.endLine) || record.endLine < record.startLine) {
    throw new StorageError("endLine must be greater than or equal to startLine");
  }
}

export function validateRepositorySymbolRecord(record: RepositorySymbolRecord): void {
  assertNonEmpty("workspaceId", record.workspaceId);
  assertNonEmpty("indexId", record.indexId);
  assertNonEmpty("key", record.key);
  assertNonEmpty("filePath", record.filePath);
  assertNonEmpty("language", record.language);
  assertNonEmpty("name", record.name);
  assertNonEmpty("qualifiedName", record.qualifiedName);
  assertNonEmpty("kind", record.kind);
  assertNonEmpty("producerTool", record.producerTool);
  assertNonEmpty("producerVersion", record.producerVersion);
  if (record.parentSymbolKey !== undefined) {
    assertNonEmpty("parentSymbolKey", record.parentSymbolKey);
  }
  if (!Number.isInteger(record.startLine) || record.startLine < 1) {
    throw new StorageError("repository symbol startLine must be a positive integer");
  }
  if (!Number.isInteger(record.startColumn) || record.startColumn < 0) {
    throw new StorageError("repository symbol startColumn must be a non-negative integer");
  }
  if (!Number.isInteger(record.endLine) || record.endLine < record.startLine) {
    throw new StorageError("repository symbol endLine must be greater than or equal to startLine");
  }
  if (!Number.isInteger(record.endColumn) || record.endColumn < 0) {
    throw new StorageError("repository symbol endColumn must be a non-negative integer");
  }
}

export function validateRepositoryReferenceRecord(record: RepositoryReferenceRecord): void {
  assertNonEmpty("workspaceId", record.workspaceId);
  assertNonEmpty("indexId", record.indexId);
  assertNonEmpty("key", record.key);
  assertNonEmpty("filePath", record.filePath);
  assertNonEmpty("language", record.language);
  assertNonEmpty("sourceKind", record.sourceKind);
  assertNonEmpty("kind", record.kind);
  assertNonEmpty("targetText", record.targetText);
  assertNonEmpty("resolutionConfidence", record.resolutionConfidence);
  assertNonEmpty("producerTool", record.producerTool);
  assertNonEmpty("producerVersion", record.producerVersion);
  if (record.resolvedSymbolKey !== undefined) {
    assertNonEmpty("resolvedSymbolKey", record.resolvedSymbolKey);
  }
  if (!Number.isInteger(record.startLine) || record.startLine < 1) {
    throw new StorageError("repository reference startLine must be a positive integer");
  }
  if (!Number.isInteger(record.startColumn) || record.startColumn < 0) {
    throw new StorageError("repository reference startColumn must be a non-negative integer");
  }
  if (!Number.isInteger(record.endLine) || record.endLine < record.startLine) {
    throw new StorageError("repository reference endLine must be greater than or equal to startLine");
  }
  if (!Number.isInteger(record.endColumn) || record.endColumn < 0) {
    throw new StorageError("repository reference endColumn must be a non-negative integer");
  }
}

export function validateRepositoryDependencyRecord(record: RepositoryDependencyRecord): void {
  assertNonEmpty("workspaceId", record.workspaceId);
  assertNonEmpty("indexId", record.indexId);
  assertNonEmpty("key", record.key);
  assertNonEmpty("filePath", record.filePath);
  assertNonEmpty("language", record.language);
  assertNonEmpty("sourceKind", record.sourceKind);
  assertNonEmpty("kind", record.kind);
  assertNonEmpty("targetText", record.targetText);
  assertNonEmpty("resolutionConfidence", record.resolutionConfidence);
  assertNonEmpty("producerTool", record.producerTool);
  assertNonEmpty("producerVersion", record.producerVersion);
  if (record.targetFilePath !== undefined) {
    assertNonEmpty("targetFilePath", record.targetFilePath);
  }
  if (record.targetSymbolKey !== undefined) {
    assertNonEmpty("targetSymbolKey", record.targetSymbolKey);
  }
  if (!Number.isInteger(record.startLine) || record.startLine < 1) {
    throw new StorageError("repository dependency startLine must be a positive integer");
  }
  if (!Number.isInteger(record.startColumn) || record.startColumn < 0) {
    throw new StorageError("repository dependency startColumn must be a non-negative integer");
  }
  if (!Number.isInteger(record.endLine) || record.endLine < record.startLine) {
    throw new StorageError("repository dependency endLine must be greater than or equal to startLine");
  }
  if (!Number.isInteger(record.endColumn) || record.endColumn < 0) {
    throw new StorageError("repository dependency endColumn must be a non-negative integer");
  }
}

export function conceptEmbeddingKey(workspaceId: string, nodeId: string, model: string): string {
  return `${workspaceId}\u0000${nodeId}\u0000${model}`;
}

export function repositoryIndexKey(workspaceId: string, indexId: string): string {
  return `${workspaceId}\u0000${indexId}`;
}

export function assertRepositoryIndexContentOwnership(
  recordKind: string,
  workspaceId: string,
  indexId: string,
  recordWorkspaceId: string,
  recordIndexId: string,
): void {
  if (recordWorkspaceId !== workspaceId || recordIndexId !== indexId) {
    throw new StorageError(`${recordKind} ownership must match replaceRepositoryIndexContents target`);
  }
}

export function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  if (left.length !== right.length) {
    throw new StorageError("embedding vectors must have matching dimensions");
  }
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index]!;
    const rightValue = right[index]!;
    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }
  if (leftNorm === 0 || rightNorm === 0) {
    throw new StorageError("embedding vectors must not be zero-norm");
  }
  return dot / Math.sqrt(leftNorm * rightNorm);
}

export function validateWorkspaceRecord(workspace: WorkspaceRecord): void {
  assertNonEmpty("workspace.id", workspace.id);
  assertNonEmpty("workspace.name", workspace.name);
  assertNonEmpty("workspace.createdAt", workspace.createdAt);

  if (workspace.slug !== undefined) {
    assertNonEmpty("workspace.slug", workspace.slug);
  }

  if (workspace.updatedAt !== undefined) {
    assertNonEmpty("workspace.updatedAt", workspace.updatedAt);
  }
}

export const REPOSITORY_INDEX_STAGES = new Set<RepositoryIndexStage>([
  "requested",
  "resolving_ref",
  "checking_out",
  "discovering",
  "indexing_syntax",
  "running_rules",
  "embedding_changed_chunks",
  "normalizing",
  "completed",
  "failed",
  "cancelled",
]);

export function tokenizeSearchQuery(query: string): string[] {
  return query
    .toLocaleLowerCase()
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function scoreTextMatch(haystack: string, terms: readonly string[]): number {
  let score = 0;
  for (const term of terms) {
    let fromIndex = 0;
    while (true) {
      const matchIndex = haystack.indexOf(term, fromIndex);
      if (matchIndex === -1) {
        break;
      }
      score += 1;
      fromIndex = matchIndex + term.length;
    }
  }
  return score;
}

export function trimSnippet(text: string, terms: readonly string[]): string {
  const normalized = text.toLocaleLowerCase();
  const firstTerm = terms.find((term) => normalized.includes(term));
  if (firstTerm === undefined) {
    return text.slice(0, 280);
  }
  const index = normalized.indexOf(firstTerm);
  const start = Math.max(0, index - 80);
  return text.slice(start, start + 280);
}

export function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
