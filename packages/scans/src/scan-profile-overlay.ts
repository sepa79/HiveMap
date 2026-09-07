/**
 * Responsibility: Define, validate, and apply repository-local scan profile overlays.
 * Must not: Validate scan runs, derive coverage, build boundary artifacts, or perform file IO.
 * Contract: Implements the overlay contract in docs/specs/repository-scan.md.
 */
import { parseBoundaryRootRule } from "./boundary-map-contract.js";
import {
  SCAN_REQUIRED_OUTPUT_VALUES,
  validateScanProfile,
  type ScanCriterion,
  type ScanProfile,
  type ScanRequiredOutput,
} from "./scan-profile.js";
import { ScanValidationError } from "./scan-validation-error.js";
import {
  assertNonEmpty,
  assertOptionalNonEmpty,
  assertUnique,
  uniqueStable,
  validateStringArray,
} from "./scan-value-validation.js";

export const SCAN_PROFILE_OVERLAY_FORMAT_VERSION = 1 as const;
export const SCAN_PROFILE_OVERLAY_DIRECTORY = ".hivemap/scan-profiles" as const;

export type ScanProfileOverlay = {
  formatVersion: typeof SCAN_PROFILE_OVERLAY_FORMAT_VERSION;
  profileId: string;
  name?: string;
  description?: string;
  instructions?: string[];
  include?: string[];
  exclude?: string[];
  archivePatterns?: string[];
  legacyPatterns?: string[];
  generatedPatterns?: string[];
  sourceTypes?: string[];
  criteria?: ScanCriterion[];
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
  ssotOrder?: string[];
  requiredOutputs?: ScanRequiredOutput[];
  boundaryMapRoots?: string[];
  boundaryMapContractPathMarkers?: string[];
  boundaryMapContractFileStems?: string[];
  boundaryMapIgnoredTokens?: string[];
  boundaryMapTestDirectoryNames?: string[];
  boundaryMapRoutePathMarkers?: string[];
  boundaryMapRouteNameSuffixes?: string[];
  boundaryMapApiPathMarkers?: string[];
  boundaryMapApiNameSuffixes?: string[];
};

export function getScanProfileOverlayFileStem(profile: Pick<ScanProfile, "id" | "overlayStem"> | string): string {
  if (typeof profile === "string") return profile;
  return profile.overlayStem ?? profile.id;
}

export function getScanProfileOverlayPath(profile: Pick<ScanProfile, "id" | "overlayStem"> | string): string {
  return `${SCAN_PROFILE_OVERLAY_DIRECTORY}/${getScanProfileOverlayFileStem(profile)}.yaml`;
}

export function validateScanProfileOverlay(overlay: ScanProfileOverlay): void {
  if (overlay.formatVersion !== SCAN_PROFILE_OVERLAY_FORMAT_VERSION) {
    throw new ScanValidationError(`scan profile overlay formatVersion must be ${SCAN_PROFILE_OVERLAY_FORMAT_VERSION}`);
  }
  assertNonEmpty("overlay.profileId", overlay.profileId);
  assertOptionalNonEmpty("overlay.name", overlay.name);
  assertOptionalNonEmpty("overlay.description", overlay.description);
  validateOptionalPatternList("overlay.instructions", overlay.instructions);
  validateOptionalPatternList("overlay.include", overlay.include);
  validateOptionalPatternList("overlay.exclude", overlay.exclude);
  validateOptionalPatternList("overlay.archivePatterns", overlay.archivePatterns);
  validateOptionalPatternList("overlay.legacyPatterns", overlay.legacyPatterns);
  validateOptionalPatternList("overlay.generatedPatterns", overlay.generatedPatterns);
  validateOptionalPatternList("overlay.sourceTypes", overlay.sourceTypes);
  validateOptionalCriteriaList("overlay.criteria", overlay.criteria);
  validateOptionalPatternList("overlay.duplicateAuthorityClaimPatterns", overlay.duplicateAuthorityClaimPatterns);
  validateOptionalPatternList("overlay.duplicateAuthorityIgnoredTopicTokens", overlay.duplicateAuthorityIgnoredTopicTokens);
  validateOptionalPatternList("overlay.duplicateAuthorityGenericTopicTokens", overlay.duplicateAuthorityGenericTopicTokens);
  validateOptionalPatternList("overlay.missingOwnerMaterialPaths", overlay.missingOwnerMaterialPaths);
  validateOptionalPatternList("overlay.missingOwnerMaterialFileNames", overlay.missingOwnerMaterialFileNames);
  validateOptionalPatternList("overlay.missingOwnerIgnoredPathMarkers", overlay.missingOwnerIgnoredPathMarkers);
  validateOptionalPatternList("overlay.missingOwnerPathKeywords", overlay.missingOwnerPathKeywords);
  validateOptionalPatternList("overlay.missingOwnerTextKeywords", overlay.missingOwnerTextKeywords);
  validateOptionalPatternList("overlay.staleDocumentationMaterialFileNames", overlay.staleDocumentationMaterialFileNames);
  validateOptionalPatternList("overlay.staleDocumentationIgnoredPathMarkers", overlay.staleDocumentationIgnoredPathMarkers);
  validateOptionalPatternList("overlay.staleDocumentationPathKeywords", overlay.staleDocumentationPathKeywords);
  validateOptionalPatternList("overlay.staleDocumentationTextKeywords", overlay.staleDocumentationTextKeywords);
  validateOptionalPatternList("overlay.staleDocumentationNonCurrentPathMarkers", overlay.staleDocumentationNonCurrentPathMarkers);
  validateOptionalPatternList("overlay.staleDocumentationNonCurrentTextMarkers", overlay.staleDocumentationNonCurrentTextMarkers);
  validateOptionalPatternList("overlay.duplicateResponsibilityTopLevelSymbolKinds", overlay.duplicateResponsibilityTopLevelSymbolKinds);
  validateOptionalPatternList("overlay.duplicateResponsibilityIgnorePathGlobs", overlay.duplicateResponsibilityIgnorePathGlobs);
  validateOptionalPatternList("overlay.ssotOrder", overlay.ssotOrder);
  validateOptionalRequiredOutputs("overlay.requiredOutputs", overlay.requiredOutputs);
  validateOptionalBoundaryRoots("overlay.boundaryMapRoots", overlay.boundaryMapRoots);
  validateOptionalPatternList("overlay.boundaryMapContractPathMarkers", overlay.boundaryMapContractPathMarkers);
  validateOptionalPatternList("overlay.boundaryMapContractFileStems", overlay.boundaryMapContractFileStems);
  validateOptionalPatternList("overlay.boundaryMapIgnoredTokens", overlay.boundaryMapIgnoredTokens);
  validateOptionalPatternList("overlay.boundaryMapTestDirectoryNames", overlay.boundaryMapTestDirectoryNames);
  validateOptionalPatternList("overlay.boundaryMapRoutePathMarkers", overlay.boundaryMapRoutePathMarkers);
  validateOptionalPatternList("overlay.boundaryMapRouteNameSuffixes", overlay.boundaryMapRouteNameSuffixes);
  validateOptionalPatternList("overlay.boundaryMapApiPathMarkers", overlay.boundaryMapApiPathMarkers);
  validateOptionalPatternList("overlay.boundaryMapApiNameSuffixes", overlay.boundaryMapApiNameSuffixes);
}

export function applyScanProfileOverlay(profile: ScanProfile, overlay: ScanProfileOverlay): ScanProfile {
  validateScanProfileOverlay(overlay);
  if (overlay.profileId !== profile.id) {
    throw new ScanValidationError(`scan profile overlay targets ${overlay.profileId}, expected ${profile.id}`);
  }
  const applied: ScanProfile = {
    ...profile,
    ...(overlay.name === undefined ? {} : { name: overlay.name }),
    ...(overlay.description === undefined ? {} : { description: overlay.description }),
    instructions: [...(overlay.instructions ?? profile.instructions)],
    scope: {
      include: uniqueStable([...profile.scope.include, ...(overlay.include ?? [])]),
      exclude: uniqueStable([
        ...profile.scope.exclude,
        ...(overlay.exclude ?? []),
        ...(overlay.archivePatterns ?? []),
        ...(overlay.legacyPatterns ?? []),
        ...(overlay.generatedPatterns ?? []),
      ]),
    },
    sourceTypes: [...(overlay.sourceTypes ?? profile.sourceTypes)],
    criteria: structuredClone(overlay.criteria ?? profile.criteria),
    ...copyOptionalList(profile, overlay, "duplicateAuthorityClaimPatterns"),
    ...copyOptionalList(profile, overlay, "duplicateAuthorityIgnoredTopicTokens"),
    ...copyOptionalList(profile, overlay, "duplicateAuthorityGenericTopicTokens"),
    ...copyOptionalList(profile, overlay, "missingOwnerMaterialPaths"),
    ...copyOptionalList(profile, overlay, "missingOwnerMaterialFileNames"),
    ...copyOptionalList(profile, overlay, "missingOwnerIgnoredPathMarkers"),
    ...copyOptionalList(profile, overlay, "missingOwnerPathKeywords"),
    ...copyOptionalList(profile, overlay, "missingOwnerTextKeywords"),
    ...copyOptionalList(profile, overlay, "staleDocumentationMaterialFileNames"),
    ...copyOptionalList(profile, overlay, "staleDocumentationIgnoredPathMarkers"),
    ...copyOptionalList(profile, overlay, "staleDocumentationPathKeywords"),
    ...copyOptionalList(profile, overlay, "staleDocumentationTextKeywords"),
    ...copyOptionalList(profile, overlay, "staleDocumentationNonCurrentPathMarkers"),
    ...copyOptionalList(profile, overlay, "staleDocumentationNonCurrentTextMarkers"),
    ...copyOptionalList(profile, overlay, "duplicateResponsibilityTopLevelSymbolKinds"),
    ...copyOptionalList(profile, overlay, "duplicateResponsibilityIgnorePathGlobs"),
    ssotOrder: [...(overlay.ssotOrder ?? profile.ssotOrder)],
    requiredOutputs: [...(overlay.requiredOutputs ?? profile.requiredOutputs)],
  };
  validateScanProfile(applied);
  return applied;
}

type OptionalProfileListKey = {
  [Key in keyof ScanProfile]-?: ScanProfile[Key] extends string[] | undefined ? Key : never;
}[keyof ScanProfile];

function copyOptionalList<Key extends OptionalProfileListKey>(
  profile: ScanProfile,
  overlay: ScanProfileOverlay,
  key: Key,
): Partial<Pick<ScanProfile, Key>> {
  const profileValue = profile[key] as string[] | undefined;
  const overlayValue = overlay[key] as string[] | undefined;
  if (profileValue === undefined && overlayValue === undefined) return {};
  return { [key]: [...(overlayValue ?? profileValue ?? [])] } as unknown as Pick<ScanProfile, Key>;
}

function validateOptionalPatternList(label: string, values: readonly string[] | undefined): void {
  if (values !== undefined) validateStringArray(label, values);
}

function validateOptionalBoundaryRoots(label: string, values: readonly string[] | undefined): void {
  if (values === undefined) return;
  validateStringArray(label, values);
  values.map((value) => parseBoundaryRootRule(value, label));
}

function validateOptionalCriteriaList(label: string, values: readonly ScanCriterion[] | undefined): void {
  if (values === undefined) return;
  if (values.length === 0) throw new ScanValidationError(`${label} must contain at least one value`);
  assertUnique(
    `${label} ids`,
    values.map((criterion) => criterion.id),
  );
  for (const criterion of values) {
    assertNonEmpty(`${label}.id`, criterion.id);
    assertNonEmpty(`${label}.description`, criterion.description);
  }
}

function validateOptionalRequiredOutputs(label: string, values: readonly ScanRequiredOutput[] | undefined): void {
  if (values === undefined) return;
  if (values.length === 0) throw new ScanValidationError(`${label} must contain at least one value`);
  assertUnique(label, values);
  for (const value of values) {
    if (!SCAN_REQUIRED_OUTPUT_VALUES.includes(value)) {
      throw new ScanValidationError(`Unknown required output in ${label}: ${value}`);
    }
  }
}
