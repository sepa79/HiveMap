/**
 * Responsibility: Define the immutable boundary-map evidence contract and root-rule syntax.
 * Must not: Build boundary maps, apply profile overlays, validate runs, or inspect repositories.
 * Contract: Implements the boundary-map evidence shape in docs/specs/repository-scan.md.
 */
import type { ProjectSourceRef } from "@hivemap/graph-core";

import type { FindingConfidence } from "./finding-validation.js";
import { ScanValidationError } from "./scan-validation-error.js";
import { assertNonEmpty } from "./scan-value-validation.js";

export const BOUNDARY_KIND_VALUES = ["module", "service", "package", "surface", "library", "test-suite", "tool"] as const;
export type BoundaryKind = (typeof BOUNDARY_KIND_VALUES)[number];

export const BOUNDARY_ENTRYPOINT_KIND_VALUES = ["api", "event", "cli", "route", "export", "test-harness", "other"] as const;
export type BoundaryEntrypointKind = (typeof BOUNDARY_ENTRYPOINT_KIND_VALUES)[number];

export const BOUNDARY_RELATION_KIND_VALUES = ["depends-on", "implements", "verifies", "contains", "exposes"] as const;
export type BoundaryRelationKind = (typeof BOUNDARY_RELATION_KIND_VALUES)[number];

export type BoundaryMapRootRule = {
  pathPrefix: string;
  kind: BoundaryKind;
};

export type BoundaryMapBuildConfig = {
  roots: BoundaryMapRootRule[];
  contractPathMarkers: string[];
  contractFileStems: string[];
  ignoredDocTokens: string[];
  testDirectoryNames: string[];
  routePathMarkers: string[];
  routeNameSuffixes: string[];
  apiPathMarkers: string[];
  apiNameSuffixes: string[];
};

export type BoundaryMapEntrypoint = {
  id: string;
  label: string;
  kind: BoundaryEntrypointKind;
  filePath?: string;
  symbolKey?: string;
  sourceRefs?: ProjectSourceRef[];
};

export type BoundaryMapBoundary = {
  id: string;
  label: string;
  kind: BoundaryKind;
  ownedPaths: string[];
  ownedSymbolKeys: string[];
  publicEntrypoints: BoundaryMapEntrypoint[];
  contractSourceRefs: ProjectSourceRef[];
  testSourceRefs: ProjectSourceRef[];
  confidence: FindingConfidence;
  openQuestions?: string[];
  notes?: string;
};

export type BoundaryMapRelation = {
  id: string;
  fromBoundaryId: string;
  toBoundaryId: string;
  kind: BoundaryRelationKind;
  sourceRefs: ProjectSourceRef[];
  notes?: string;
};

export type BoundaryMapArtifact = {
  boundaries: BoundaryMapBoundary[];
  relations: BoundaryMapRelation[];
};

export function parseBoundaryRootRule(value: string, label = "boundaryMapRoot"): BoundaryMapRootRule {
  const separatorIndex = value.lastIndexOf(":");
  if (separatorIndex < 1 || separatorIndex === value.length - 1) {
    throw new ScanValidationError(`${label} must use path-prefix:kind format`);
  }
  const pathPrefix = value.slice(0, separatorIndex).trim().replace(/\\/g, "/");
  const kind = value.slice(separatorIndex + 1).trim();
  assertNonEmpty(`${label}.pathPrefix`, pathPrefix);
  if (!BOUNDARY_KIND_VALUES.includes(kind as BoundaryKind)) {
    throw new ScanValidationError(`Unknown boundary kind in ${label}: ${kind}`);
  }
  return { pathPrefix, kind: kind as BoundaryKind };
}

export function serializeBoundaryRootRule(rule: BoundaryMapRootRule): string {
  return `${rule.pathPrefix}:${rule.kind}`;
}
