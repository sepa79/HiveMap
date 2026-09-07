/**
 * Responsibility: Define and validate one resolved repository scan profile contract.
 * Must not: Apply repository overlays, derive coverage, build boundary maps, or validate scan runs.
 * Contract: Implements the profile contract in docs/specs/repository-scan.md.
 */
import { ScanValidationError } from "./scan-validation-error.js";
import {
  assertNonEmpty,
  assertNonEmptyStringArray,
  assertOptionalNonEmpty,
  assertUnique,
  validateStringArray,
} from "./scan-value-validation.js";

export const SCAN_REQUIRED_OUTPUT_VALUES = [
  "document-inventory",
  "concept-map",
  "findings",
  "coverage-report",
  "boundary-map",
] as const;
export type ScanRequiredOutput = (typeof SCAN_REQUIRED_OUTPUT_VALUES)[number];

export type ScanCriterion = {
  id: string;
  description: string;
};

export type ScanProfile = {
  id: string;
  version: number;
  name: string;
  description: string;
  overlayStem?: string;
  instructions: string[];
  scope: {
    include: string[];
    exclude: string[];
  };
  sourceTypes: string[];
  criteria: ScanCriterion[];
  duplicateAuthorityClaimPatterns?: string[];
  duplicateAuthorityIgnoredTopicTokens?: string[];
  duplicateAuthorityGenericTopicTokens?: string[];
  missingOwnerMaterialPaths?: string[];
  missingOwnerMaterialFileNames?: string[];
  missingOwnerIgnoredPathMarkers?: string[];
  missingOwnerPathKeywords?: string[];
  missingOwnerTextKeywords?: string[];
  staleDocumentationMaterialFileNames?: string[];
  staleDocumentationIgnoredPathMarkers?: string[];
  staleDocumentationPathKeywords?: string[];
  staleDocumentationTextKeywords?: string[];
  staleDocumentationNonCurrentPathMarkers?: string[];
  staleDocumentationNonCurrentTextMarkers?: string[];
  duplicateResponsibilityTopLevelSymbolKinds?: string[];
  duplicateResponsibilityIgnorePathGlobs?: string[];
  ssotOrder: string[];
  requiredOutputs: ScanRequiredOutput[];
};

export function validateScanProfile(profile: ScanProfile): void {
  assertNonEmpty("profile.id", profile.id);
  if (!Number.isInteger(profile.version) || profile.version < 1) {
    throw new ScanValidationError("profile.version must be a positive integer");
  }
  assertNonEmpty("profile.name", profile.name);
  assertNonEmpty("profile.description", profile.description);
  assertOptionalNonEmpty("profile.overlayStem", profile.overlayStem);
  assertNonEmptyStringArray("profile.instructions", profile.instructions);
  assertNonEmptyStringArray("profile.scope.include", profile.scope.include);
  validateStringArray("profile.scope.exclude", profile.scope.exclude);
  assertNonEmptyStringArray("profile.sourceTypes", profile.sourceTypes);
  validateOptionalPatternList("profile.duplicateAuthorityClaimPatterns", profile.duplicateAuthorityClaimPatterns);
  validateOptionalPatternList("profile.duplicateAuthorityIgnoredTopicTokens", profile.duplicateAuthorityIgnoredTopicTokens);
  validateOptionalPatternList("profile.duplicateAuthorityGenericTopicTokens", profile.duplicateAuthorityGenericTopicTokens);
  validateOptionalPatternList("profile.missingOwnerMaterialPaths", profile.missingOwnerMaterialPaths);
  validateOptionalPatternList("profile.missingOwnerMaterialFileNames", profile.missingOwnerMaterialFileNames);
  validateOptionalPatternList("profile.missingOwnerIgnoredPathMarkers", profile.missingOwnerIgnoredPathMarkers);
  validateOptionalPatternList("profile.missingOwnerPathKeywords", profile.missingOwnerPathKeywords);
  validateOptionalPatternList("profile.missingOwnerTextKeywords", profile.missingOwnerTextKeywords);
  validateOptionalPatternList("profile.staleDocumentationMaterialFileNames", profile.staleDocumentationMaterialFileNames);
  validateOptionalPatternList("profile.staleDocumentationIgnoredPathMarkers", profile.staleDocumentationIgnoredPathMarkers);
  validateOptionalPatternList("profile.staleDocumentationPathKeywords", profile.staleDocumentationPathKeywords);
  validateOptionalPatternList("profile.staleDocumentationTextKeywords", profile.staleDocumentationTextKeywords);
  validateOptionalPatternList("profile.staleDocumentationNonCurrentPathMarkers", profile.staleDocumentationNonCurrentPathMarkers);
  validateOptionalPatternList("profile.staleDocumentationNonCurrentTextMarkers", profile.staleDocumentationNonCurrentTextMarkers);
  validateOptionalPatternList("profile.duplicateResponsibilityTopLevelSymbolKinds", profile.duplicateResponsibilityTopLevelSymbolKinds);
  validateOptionalPatternList("profile.duplicateResponsibilityIgnorePathGlobs", profile.duplicateResponsibilityIgnorePathGlobs);
  assertNonEmptyStringArray("profile.ssotOrder", profile.ssotOrder);
  assertUnique("profile.requiredOutputs", profile.requiredOutputs);
  if (profile.requiredOutputs.length === 0) {
    throw new ScanValidationError("profile.requiredOutputs must contain at least one output");
  }
  for (const output of profile.requiredOutputs) {
    if (!SCAN_REQUIRED_OUTPUT_VALUES.includes(output)) {
      throw new ScanValidationError(`Unknown required output: ${output}`);
    }
  }
  if (profile.criteria.length === 0) {
    throw new ScanValidationError("profile.criteria must contain at least one criterion");
  }
  assertUnique(
    "profile.criteria ids",
    profile.criteria.map((criterion) => criterion.id),
  );
  for (const criterion of profile.criteria) {
    assertNonEmpty("criterion.id", criterion.id);
    assertNonEmpty("criterion.description", criterion.description);
  }
  if (profile.criteria.some((criterion) => criterion.id === "duplicate-authority")) {
    requireDefinedProfileRecipeField(profile, "duplicateAuthorityClaimPatterns");
    requireDefinedProfileRecipeField(profile, "duplicateAuthorityIgnoredTopicTokens");
    requireDefinedProfileRecipeField(profile, "duplicateAuthorityGenericTopicTokens");
  }
  if (profile.criteria.some((criterion) => criterion.id === "missing-owner")) {
    requireDefinedProfileRecipeField(profile, "missingOwnerMaterialPaths");
    requireDefinedProfileRecipeField(profile, "missingOwnerMaterialFileNames");
    requireDefinedProfileRecipeField(profile, "missingOwnerIgnoredPathMarkers");
    requireDefinedProfileRecipeField(profile, "missingOwnerPathKeywords");
    requireDefinedProfileRecipeField(profile, "missingOwnerTextKeywords");
  }
  if (profile.criteria.some((criterion) => criterion.id === "stale-documentation")) {
    requireDefinedProfileRecipeField(profile, "staleDocumentationMaterialFileNames");
    requireDefinedProfileRecipeField(profile, "staleDocumentationIgnoredPathMarkers");
    requireDefinedProfileRecipeField(profile, "staleDocumentationPathKeywords");
    requireDefinedProfileRecipeField(profile, "staleDocumentationTextKeywords");
    requireDefinedProfileRecipeField(profile, "staleDocumentationNonCurrentPathMarkers");
    requireDefinedProfileRecipeField(profile, "staleDocumentationNonCurrentTextMarkers");
  }
  if (profile.criteria.some((criterion) => criterion.id === "duplicate-responsibility")) {
    if (
      profile.duplicateResponsibilityTopLevelSymbolKinds === undefined ||
      profile.duplicateResponsibilityTopLevelSymbolKinds.length === 0
    ) {
      throw new ScanValidationError(
        "profile.duplicateResponsibilityTopLevelSymbolKinds must contain at least one value when duplicate-responsibility is active",
      );
    }
    if (profile.duplicateResponsibilityIgnorePathGlobs === undefined) {
      throw new ScanValidationError(
        "profile.duplicateResponsibilityIgnorePathGlobs must be defined when duplicate-responsibility is active",
      );
    }
  }
}

function validateOptionalPatternList(label: string, values: readonly string[] | undefined): void {
  if (values !== undefined) validateStringArray(label, values);
}

function requireDefinedProfileRecipeField(profile: ScanProfile, field: keyof ScanProfile): void {
  if (profile[field] === undefined) {
    throw new ScanValidationError(`profile.${field} must be defined when the related criterion is active`);
  }
}
