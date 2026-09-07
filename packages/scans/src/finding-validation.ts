/**
 * Responsibility: Define finding contracts and validate finding-node shape, graph references, updates, and evidence snapshots.
 * Must not: Mutate scan runs, persist graph state, apply graph commands, or implement transport behavior.
 * Contract: Findings are scan-owned graph nodes whose affected targets resolve to active non-finding graph nodes.
 */
import {
  validateProjectSourceRef,
  type GraphNode,
  type ProjectSourceRef,
  type SemanticGraph,
} from "@hivemap/graph-core";

import { ScanValidationError } from "./scan-validation-error.js";

export const FINDING_KIND_VALUES = [
  "conflict",
  "stale",
  "missing",
  "ambiguous",
  "broken-reference",
  "duplicate-authority",
  "implementation-drift",
  "quality-problem",
  "architecture-risk",
  "runtime-risk",
  "authority-gap",
  "test-gap",
  "deployment-risk",
] as const;
export type FindingKind = (typeof FINDING_KIND_VALUES)[number];

export const FINDING_SEVERITY_VALUES = ["low", "normal", "high", "critical"] as const;
export type FindingSeverity = (typeof FINDING_SEVERITY_VALUES)[number];

export const FINDING_CONFIDENCE_VALUES = ["low", "medium", "high"] as const;
export type FindingConfidence = (typeof FINDING_CONFIDENCE_VALUES)[number];

export const FINDING_STATUS_VALUES = [
  "open",
  "acknowledged",
  "proposed-fix",
  "resolved",
  "accepted",
  "unverifiable",
] as const;
export type FindingStatus = (typeof FINDING_STATUS_VALUES)[number];

export type FindingClaim = {
  sourceRefIndex: number;
  claim: string;
};

export type FindingMetadata = {
  fingerprint: string;
  kind: FindingKind;
  severity: FindingSeverity;
  confidence: FindingConfidence;
  status: FindingStatus;
  originScanId: string;
  criterionIds: string[];
  claims: FindingClaim[];
  affectedNodeIds: string[];
  expectedOwner?: string;
  recommendedAction?: string;
  resolutionEvidence?: string;
};

export type FindingNodeInput = {
  id: string;
  label: string;
  notes: string;
  fingerprint: string;
  kind: FindingKind;
  severity: FindingSeverity;
  confidence: FindingConfidence;
  status?: FindingStatus;
  criterionIds: string[];
  sources: Array<{
    sourceRef: ProjectSourceRef;
    claim: string;
  }>;
  affectedNodeIds: string[];
  expectedOwner?: string;
  recommendedAction?: string;
  resolutionEvidence?: string;
};

export type FindingNodeUpdate = {
  notes?: string;
  severity?: FindingSeverity;
  confidence?: FindingConfidence;
  status?: FindingStatus;
  expectedOwner?: string;
  recommendedAction?: string;
  resolutionEvidence?: string;
};

export type FindingEvidence = {
  nodeId: string;
  label: string;
  notes: string;
  sourceRefs: ProjectSourceRef[];
  finding: FindingMetadata;
};

export function createFindingNode(scanId: string, input: FindingNodeInput): GraphNode {
  assertNonEmpty("scanId", scanId);
  const sourceRefs = input.sources.map((source) => source.sourceRef);
  const finding: FindingMetadata = {
    fingerprint: input.fingerprint,
    kind: input.kind,
    severity: input.severity,
    confidence: input.confidence,
    status: input.status ?? "open",
    originScanId: scanId,
    criterionIds: input.criterionIds,
    claims: input.sources.map((source, index) => ({ sourceRefIndex: index, claim: source.claim })),
    affectedNodeIds: input.affectedNodeIds,
  };
  if (input.expectedOwner !== undefined) finding.expectedOwner = input.expectedOwner;
  if (input.recommendedAction !== undefined) finding.recommendedAction = input.recommendedAction;
  if (input.resolutionEvidence !== undefined) finding.resolutionEvidence = input.resolutionEvidence;

  const node: GraphNode = {
    id: input.id,
    label: input.label,
    type: "finding",
    notes: input.notes,
    metadata: { sourceRefs, finding },
  };
  validateFindingNode(node);
  return node;
}

export function validateFindingNode(node: GraphNode): void {
  if (node.type !== "finding") {
    throw new ScanValidationError(`Finding node must use type finding: ${node.id}`);
  }
  assertNonEmpty("finding node id", node.id);
  assertNonEmpty("finding node label", node.label);
  assertNonEmpty("finding node notes", node.notes ?? "");
  const metadata = node.metadata;
  if (metadata === undefined || !isObject(metadata.finding)) {
    throw new ScanValidationError(`Finding node ${node.id} must contain metadata.finding`);
  }
  const finding = metadata.finding as FindingMetadata;
  assertNonEmpty("finding.fingerprint", finding.fingerprint);
  if (!FINDING_KIND_VALUES.includes(finding.kind)) throw new ScanValidationError(`Unknown finding kind: ${finding.kind}`);
  if (!FINDING_SEVERITY_VALUES.includes(finding.severity)) throw new ScanValidationError(`Unknown finding severity: ${finding.severity}`);
  if (!FINDING_CONFIDENCE_VALUES.includes(finding.confidence)) throw new ScanValidationError(`Unknown finding confidence: ${finding.confidence}`);
  if (!FINDING_STATUS_VALUES.includes(finding.status)) throw new ScanValidationError(`Unknown finding status: ${finding.status}`);
  assertNonEmpty("finding.originScanId", finding.originScanId);
  assertNonEmptyArray("finding.criterionIds", finding.criterionIds);
  assertUnique("finding.criterionIds", finding.criterionIds);
  validateStringArray("finding.affectedNodeIds", finding.affectedNodeIds);
  const sourceRefs = metadata.sourceRefs ?? [];
  if (sourceRefs.length === 0) throw new ScanValidationError(`Finding node ${node.id} must contain source references`);
  sourceRefs.forEach(validateProjectSourceRef);
  if (finding.claims.length === 0) throw new ScanValidationError(`Finding node ${node.id} must contain claims`);
  const indexes = finding.claims.map((claim) => claim.sourceRefIndex);
  assertUnique("finding claim source indexes", indexes);
  for (const claim of finding.claims) {
    if (!Number.isInteger(claim.sourceRefIndex) || claim.sourceRefIndex < 0 || claim.sourceRefIndex >= sourceRefs.length) {
      throw new ScanValidationError(`Finding claim references invalid source index: ${claim.sourceRefIndex}`);
    }
    assertNonEmpty("finding claim", claim.claim);
  }
  if (finding.kind === "conflict" && finding.claims.length < 2) {
    throw new ScanValidationError("Conflict finding must contain at least two source claims");
  }
  assertOptionalNonEmpty("finding.expectedOwner", finding.expectedOwner);
  assertOptionalNonEmpty("finding.recommendedAction", finding.recommendedAction);
  assertOptionalNonEmpty("finding.resolutionEvidence", finding.resolutionEvidence);
  if (finding.status === "resolved" && finding.resolutionEvidence === undefined) {
    throw new ScanValidationError("Resolved finding requires resolution evidence");
  }
}

export function validateFindingAffectedNodes(node: GraphNode, graph: SemanticGraph): void {
  validateFindingNode(node);
  const finding = node.metadata?.finding as FindingMetadata;
  for (const affectedNodeId of finding.affectedNodeIds) {
    const affectedNode = graph.nodes.find((candidate) => candidate.id === affectedNodeId);
    if (affectedNode === undefined) {
      throw new ScanValidationError(`Finding ${node.id} references missing affected node: ${affectedNodeId}`);
    }
    if (affectedNode.type === "finding") {
      throw new ScanValidationError(`Finding ${node.id} cannot reference another finding as an affected node: ${affectedNodeId}`);
    }
  }
}

export function updateFindingNode(node: GraphNode, changes: FindingNodeUpdate): GraphNode {
  validateFindingNode(node);
  if (Object.keys(changes).length === 0) throw new ScanValidationError("Finding update must contain at least one change");
  const current = node.metadata?.finding as FindingMetadata;
  const finding: FindingMetadata = { ...current };
  if (changes.severity !== undefined) finding.severity = changes.severity;
  if (changes.confidence !== undefined) finding.confidence = changes.confidence;
  if (changes.status !== undefined) finding.status = changes.status;
  if (changes.expectedOwner !== undefined) finding.expectedOwner = changes.expectedOwner;
  if (changes.recommendedAction !== undefined) finding.recommendedAction = changes.recommendedAction;
  if (changes.resolutionEvidence !== undefined) finding.resolutionEvidence = changes.resolutionEvidence;
  const updated: GraphNode = {
    ...node,
    notes: changes.notes ?? (node.notes as string),
    metadata: { ...node.metadata, finding },
  };
  validateFindingNode(updated);
  return updated;
}

export function toFindingEvidence(node: GraphNode): FindingEvidence {
  validateFindingNode(node);
  return {
    nodeId: node.id,
    label: node.label,
    notes: node.notes as string,
    sourceRefs: [...(node.metadata?.sourceRefs ?? [])],
    finding: structuredClone(node.metadata?.finding as FindingMetadata),
  };
}

function assertNonEmptyArray(label: string, values: readonly string[]): void {
  if (values.length === 0) throw new ScanValidationError(`${label} must contain at least one value`);
  validateStringArray(label, values);
}

function validateStringArray(label: string, values: readonly string[]): void {
  for (const value of values) assertNonEmpty(label, value);
  assertUnique(label, values);
}

function assertUnique(label: string, values: readonly unknown[]): void {
  if (new Set(values).size !== values.length) throw new ScanValidationError(`${label} must not contain duplicates`);
}

function assertNonEmpty(label: string, value: string): void {
  if (value.trim().length === 0) throw new ScanValidationError(`${label} must be non-empty`);
}

function assertOptionalNonEmpty(label: string, value: string | undefined): void {
  if (value !== undefined) assertNonEmpty(label, value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
