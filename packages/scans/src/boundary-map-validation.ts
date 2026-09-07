/**
 * Responsibility: Validate completed boundary-map artifacts and their source evidence.
 * Must not: Build boundary maps, inspect repositories, apply overlays, or validate scan lifecycle state.
 * Contract: Enforces boundary evidence invariants in docs/specs/repository-scan.md.
 */
import { validateProjectSourceRef, type ProjectSourceRef } from "@hivemap/graph-core";

import {
  BOUNDARY_ENTRYPOINT_KIND_VALUES,
  BOUNDARY_KIND_VALUES,
  BOUNDARY_RELATION_KIND_VALUES,
  type BoundaryMapArtifact,
  type BoundaryMapBoundary,
  type BoundaryMapEntrypoint,
  type BoundaryMapRelation,
} from "./boundary-map-contract.js";
import { FINDING_CONFIDENCE_VALUES } from "./finding-validation.js";
import { ScanValidationError } from "./scan-validation-error.js";
import { assertNonEmpty, assertOptionalNonEmpty, assertUnique, validateStringArray } from "./scan-value-validation.js";

export function validateBoundaryMap(boundaryMap: BoundaryMapArtifact): void {
  if (!Array.isArray(boundaryMap.boundaries) || boundaryMap.boundaries.length === 0) {
    throw new ScanValidationError("boundaryMap.boundaries must contain at least one boundary");
  }
  if (!Array.isArray(boundaryMap.relations)) {
    throw new ScanValidationError("boundaryMap.relations must be an array");
  }
  assertUnique(
    "boundaryMap.boundary ids",
    boundaryMap.boundaries.map((boundary) => boundary.id),
  );
  assertUnique(
    "boundaryMap.relation ids",
    boundaryMap.relations.map((relation) => relation.id),
  );
  const boundaryIds = new Set(boundaryMap.boundaries.map((boundary) => boundary.id));
  boundaryMap.boundaries.forEach(validateBoundary);
  boundaryMap.relations.forEach((relation) => validateBoundaryRelation(relation, boundaryIds));
}

function validateBoundary(boundary: BoundaryMapBoundary): void {
  assertNonEmpty("boundary.id", boundary.id);
  assertNonEmpty("boundary.label", boundary.label);
  if (!BOUNDARY_KIND_VALUES.includes(boundary.kind)) throw new ScanValidationError(`Unknown boundary kind: ${boundary.kind}`);
  validateStringArray("boundary.ownedPaths", boundary.ownedPaths);
  validateStringArray("boundary.ownedSymbolKeys", boundary.ownedSymbolKeys);
  if (boundary.ownedPaths.length === 0 && boundary.ownedSymbolKeys.length === 0 && boundary.publicEntrypoints.length === 0) {
    throw new ScanValidationError(`Boundary ${boundary.id} must declare owned paths, owned symbols, or public entrypoints`);
  }
  boundary.publicEntrypoints.forEach(validateBoundaryEntrypoint);
  assertUnique(
    "boundary.publicEntrypoint ids",
    boundary.publicEntrypoints.map((entrypoint) => entrypoint.id),
  );
  boundary.contractSourceRefs.forEach((sourceRef) => validateBoundaryContractSourceRef(boundary.id, sourceRef));
  boundary.testSourceRefs.forEach((sourceRef) => validateBoundaryTestSourceRef(boundary.id, sourceRef));
  if (!FINDING_CONFIDENCE_VALUES.includes(boundary.confidence)) {
    throw new ScanValidationError(`Unknown boundary confidence: ${boundary.confidence}`);
  }
  if (boundary.openQuestions !== undefined) validateStringArray("boundary.openQuestions", boundary.openQuestions);
  assertOptionalNonEmpty("boundary.notes", boundary.notes);
}

function validateBoundaryEntrypoint(entrypoint: BoundaryMapEntrypoint): void {
  assertNonEmpty("boundaryEntrypoint.id", entrypoint.id);
  assertNonEmpty("boundaryEntrypoint.label", entrypoint.label);
  if (!BOUNDARY_ENTRYPOINT_KIND_VALUES.includes(entrypoint.kind)) {
    throw new ScanValidationError(`Unknown boundary entrypoint kind: ${entrypoint.kind}`);
  }
  assertOptionalNonEmpty("boundaryEntrypoint.filePath", entrypoint.filePath);
  assertOptionalNonEmpty("boundaryEntrypoint.symbolKey", entrypoint.symbolKey);
  if (entrypoint.sourceRefs !== undefined) entrypoint.sourceRefs.forEach(validateProjectSourceRef);
  if (entrypoint.filePath === undefined && entrypoint.symbolKey === undefined && (entrypoint.sourceRefs?.length ?? 0) === 0) {
    throw new ScanValidationError(`Boundary entrypoint ${entrypoint.id} must declare filePath, symbolKey, or sourceRefs`);
  }
}

function validateBoundaryRelation(relation: BoundaryMapRelation, boundaryIds: ReadonlySet<string>): void {
  assertNonEmpty("boundaryRelation.id", relation.id);
  assertNonEmpty("boundaryRelation.fromBoundaryId", relation.fromBoundaryId);
  assertNonEmpty("boundaryRelation.toBoundaryId", relation.toBoundaryId);
  if (!BOUNDARY_RELATION_KIND_VALUES.includes(relation.kind)) {
    throw new ScanValidationError(`Unknown boundary relation kind: ${relation.kind}`);
  }
  if (!boundaryIds.has(relation.fromBoundaryId)) {
    throw new ScanValidationError(`Boundary relation references missing source boundary: ${relation.fromBoundaryId}`);
  }
  if (!boundaryIds.has(relation.toBoundaryId)) {
    throw new ScanValidationError(`Boundary relation references missing target boundary: ${relation.toBoundaryId}`);
  }
  if (relation.sourceRefs.length === 0) {
    throw new ScanValidationError(`Boundary relation ${relation.id} must contain at least one source reference`);
  }
  relation.sourceRefs.forEach((sourceRef) => validateBoundaryRelationSourceRef(relation, sourceRef));
  assertOptionalNonEmpty("boundaryRelation.notes", relation.notes);
}

function validateBoundaryContractSourceRef(boundaryId: string, sourceRef: ProjectSourceRef): void {
  validateProjectSourceRef(sourceRef);
  if (sourceRef.source !== "repo-doc") {
    throw new ScanValidationError(`Boundary ${boundaryId} contractSourceRefs must use repo-doc sources`);
  }
  if (sourceRef.role !== "defines" && sourceRef.role !== "discusses") {
    throw new ScanValidationError(`Boundary ${boundaryId} contractSourceRefs must use defines or discusses roles`);
  }
}

function validateBoundaryTestSourceRef(boundaryId: string, sourceRef: ProjectSourceRef): void {
  validateProjectSourceRef(sourceRef);
  if (sourceRef.source !== "test" || sourceRef.role !== "verifies") {
    throw new ScanValidationError(`Boundary ${boundaryId} testSourceRefs must use verifies role from test sources`);
  }
}

function validateBoundaryRelationSourceRef(relation: BoundaryMapRelation, sourceRef: ProjectSourceRef): void {
  validateProjectSourceRef(sourceRef);
  switch (relation.kind) {
    case "depends-on":
      if (sourceRef.role !== "depends-on" || sourceRef.source !== "code") {
        throw new ScanValidationError(`Boundary relation ${relation.id} of kind depends-on requires depends-on role from code sources`);
      }
      return;
    case "implements":
      if (sourceRef.role !== "implements" || sourceRef.source !== "code") {
        throw new ScanValidationError(`Boundary relation ${relation.id} of kind implements requires implements role from code sources`);
      }
      return;
    case "verifies":
      if (sourceRef.role !== "verifies" || sourceRef.source !== "test") {
        throw new ScanValidationError(`Boundary relation ${relation.id} of kind verifies requires verifies role from test sources`);
      }
      return;
    case "contains":
    case "exposes":
      return;
  }
}
