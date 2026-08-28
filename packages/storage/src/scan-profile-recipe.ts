/**
 * Responsibility: Serialize and validate the persisted scan-profile recipe projection.
 * Must not: Query Postgres, invent missing recipe fields, or validate full scan state.
 * Contract: Only the declared recipe keys cross the storage boundary; unknown or non-object data fails.
 */
import type { ScanProfile } from "@hivemap/scans";

import { StorageError } from "./storage-error.js";

const SCAN_PROFILE_RECIPE_FIELDS = [
  "duplicateAuthorityClaimPatterns",
  "duplicateAuthorityIgnoredTopicTokens",
  "duplicateAuthorityGenericTopicTokens",
  "missingOwnerMaterialPaths",
  "missingOwnerMaterialFileNames",
  "missingOwnerIgnoredPathMarkers",
  "missingOwnerPathKeywords",
  "missingOwnerTextKeywords",
  "staleDocumentationMaterialFileNames",
  "staleDocumentationIgnoredPathMarkers",
  "staleDocumentationPathKeywords",
  "staleDocumentationTextKeywords",
  "staleDocumentationNonCurrentPathMarkers",
  "staleDocumentationNonCurrentTextMarkers",
  "duplicateResponsibilityTopLevelSymbolKinds",
  "duplicateResponsibilityIgnorePathGlobs",
] as const satisfies readonly (keyof ScanProfile)[];

type ScanProfileRecipeField = (typeof SCAN_PROFILE_RECIPE_FIELDS)[number];
export type ScanProfileRecipe = Partial<Pick<ScanProfile, ScanProfileRecipeField>>;

export function toScanProfileRecipe(profile: ScanProfile): ScanProfileRecipe {
  return Object.fromEntries(
    SCAN_PROFILE_RECIPE_FIELDS.flatMap((field) =>
      profile[field] === undefined ? [] : [[field, profile[field]]],
    ),
  ) as ScanProfileRecipe;
}

export function parseScanProfileRecipe(value: string): ScanProfileRecipe {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch (error) {
    throw new StorageError(`Stored scan profile recipe must be valid JSON: ${String(error)}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new StorageError("Stored scan profile recipe must be a JSON object");
  }
  const unexpectedField = Object.keys(parsed).find(
    (field) => !SCAN_PROFILE_RECIPE_FIELDS.includes(field as ScanProfileRecipeField),
  );
  if (unexpectedField !== undefined) {
    throw new StorageError(`Stored scan profile recipe contains an unsupported field: ${unexpectedField}`);
  }
  return Object.fromEntries(
    SCAN_PROFILE_RECIPE_FIELDS.flatMap((field) =>
      Object.hasOwn(parsed, field) ? [[field, (parsed as Record<string, unknown>)[field]]] : [],
    ),
  ) as ScanProfileRecipe;
}
