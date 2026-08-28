/**
 * Responsibility: Resolve scan-profile overlays, coverage, calibration hints, and boundary-map config.
 * Must not: Read the filesystem, persist state, mutate semantic graphs, or invent hidden profile defaults.
 * Contract: Derives explicit effective profile and guidance values solely from indexed records and typed inputs.
 */
import type {
  GetScanProfileOverlayHelpResponse,
  ScanCoverageSummary,
  ScanProfileOverlayResolution,
  ScanProfileOverlaySymptomHint,
  ScanProfileOverlaySymptomId,
  SuggestScanProfileOverlayResponse,
} from "@hivemap/api-contracts";
import {
  applyScanProfileOverlay,
  createBoundaryMapBuildConfig,
  getScanProfileOverlayPath,
  SCAN_PROFILE_OVERLAY_FORMAT_VERSION,
  type ScanCoverage,
  type ScanProfile,
  type ScanProfileOverlay,
} from "@hivemap/scans";
import type { RepositoryChunkRecord, RepositoryFileRecord, RepositorySymbolRecord } from "@hivemap/storage";

import { matchesAnyGlob, normalizeRepositoryPath } from "./repository-path.js";
import { RuntimeError } from "./runtime-error.js";

type ScanProfileContext = {
  baseProfile: ScanProfile;
  effectiveProfile: ScanProfile;
  overlay: ScanProfileOverlayResolution;
  coverageSummary: ScanCoverageSummary;
};

export function resolveScanProfileContext(
  baseProfile: ScanProfile,
  files: readonly RepositoryFileRecord[],
  chunks: readonly RepositoryChunkRecord[],
  symbols: readonly RepositorySymbolRecord[],
): ScanProfileContext {
  const overlayPath = normalizeRepositoryPath(getScanProfileOverlayPath(baseProfile));
  const overlayFile = files.find((file) => normalizeRepositoryPath(file.path) === overlayPath);
  if (overlayFile === undefined) {
    const overlay = createMissingScanProfileOverlayResolution(baseProfile, overlayPath);
    return {
      baseProfile,
      effectiveProfile: baseProfile,
      overlay,
      coverageSummary: createScanCoverageSummary(baseProfile, files, symbols, overlay),
    };
  }

  const overlay = readScanProfileOverlayFromRepository(baseProfile, overlayPath, chunks);
  let effectiveProfile: ScanProfile;
  try {
    effectiveProfile = applyScanProfileOverlay(baseProfile, overlay);
  } catch (error) {
    throw createScanProfileOverlayInvalidError(baseProfile, overlayPath, error);
  }
  const overlayResolution: ScanProfileOverlayResolution = {
    status: "found",
    source: "repo",
    applied: true,
    overlayPath,
    guidanceTool: "scan_profile_overlay_help",
    nextActionHint: `Repository overlay from ${overlayPath} is active. Call scan_profile_overlay_help for the merge contract and supported fields.`,
    mergedIncludeCount: overlay.include?.length ?? 0,
    mergedExcludeCount:
      (overlay.exclude?.length ?? 0) +
      (overlay.archivePatterns?.length ?? 0) +
      (overlay.legacyPatterns?.length ?? 0) +
      (overlay.generatedPatterns?.length ?? 0),
  };

  return {
    baseProfile,
    effectiveProfile,
    overlay: overlayResolution,
    coverageSummary: createScanCoverageSummary(effectiveProfile, files, symbols, overlayResolution),
  };
}

export function deriveScanCoverage(profile: ScanProfile, files: readonly RepositoryFileRecord[]): ScanCoverage {
  const discovered = files.map((file) => normalizeRepositoryPath(file.path)).sort();
  const included: string[] = [];
  const excluded: ScanCoverage["excluded"] = [];

  for (const target of discovered) {
    if (!matchesAnyGlob(target, profile.scope.include)) {
      excluded.push({ target, reason: "excluded by profile include rules" });
      continue;
    }
    if (matchesAnyGlob(target, profile.scope.exclude)) {
      excluded.push({ target, reason: "excluded by profile exclude rules" });
      continue;
    }
    included.push(target);
  }

  return {
    discovered,
    included,
    excluded: excluded.sort((left, right) => left.target.localeCompare(right.target)),
    failed: [],
  };
}

function createMissingScanProfileOverlayResolution(profile: ScanProfile, overlayPath: string): ScanProfileOverlayResolution {
  return {
    status: "missing",
    source: "defaults",
    applied: false,
    overlayPath,
    guidanceTool: "scan_profile_overlay_help",
    nextActionHint: `No repository overlay was found at ${overlayPath}. Defaults remain active; call scan_profile_overlay_help for the template and merge rules.`,
    mergedIncludeCount: 0,
    mergedExcludeCount: 0,
  };
}

function readScanProfileOverlayFromRepository(
  profile: ScanProfile,
  overlayPath: string,
  chunks: readonly RepositoryChunkRecord[],
): ScanProfileOverlay {
  try {
    return parseScanProfileOverlayYaml(
      readRepositoryIndexedFileText(overlayPath, chunks),
      overlayPath,
    );
  } catch (error) {
    throw createScanProfileOverlayInvalidError(profile, overlayPath, error);
  }
}

export function resolveBoundaryMapBuildConfig(
  profile: ScanProfile,
  files: readonly RepositoryFileRecord[],
  chunks: readonly RepositoryChunkRecord[],
) {
  const overlayPath = normalizeRepositoryPath(getScanProfileOverlayPath(profile));
  const overlayFile = files.find((file) => normalizeRepositoryPath(file.path) === overlayPath);
  if (overlayFile === undefined) {
    return createBoundaryMapBuildConfig();
  }
  const overlay = readScanProfileOverlayFromRepository(profile, overlayPath, chunks);
  return createBoundaryMapBuildConfig(overlay);
}

function createScanCoverageSummary(
  profile: ScanProfile,
  files: readonly RepositoryFileRecord[],
  symbols: readonly RepositorySymbolRecord[],
  overlay: ScanProfileOverlayResolution,
): ScanCoverageSummary {
  const coverage = deriveScanCoverage(profile, files);
  const discoveredPaths = new Set(coverage.discovered);
  const includedPaths = new Set(coverage.included);
  const codePaths = new Set(
    files
      .filter((file) => file.sourceKind === "code")
      .map((file) => normalizeRepositoryPath(file.path))
      .filter((path) => discoveredPaths.has(path)),
  );
  const topLevelCodeSymbols = symbols.filter(
    (symbol) => symbol.parentSymbolKey === undefined && codePaths.has(normalizeRepositoryPath(symbol.filePath)),
  );
  const includedTopLevelCodeSymbols = topLevelCodeSymbols.filter((symbol) => includedPaths.has(normalizeRepositoryPath(symbol.filePath)));

  const summary: ScanCoverageSummary = {
    discoveredCount: coverage.discovered.length,
    includedCount: coverage.included.length,
    excludedCount: coverage.excluded.length,
    failedCount: coverage.failed.length,
    discoveredCodeFileCount: codePaths.size,
    includedCodeFileCount: [...codePaths].filter((path) => includedPaths.has(path)).length,
    discoveredTopLevelCodeSymbolCount: topLevelCodeSymbols.length,
    includedTopLevelCodeSymbolCount: includedTopLevelCodeSymbols.length,
    warnings: [],
  };
  summary.warnings = createScanCoverageWarnings(profile, summary, overlay);
  return summary;
}

export function summarizeRecordedCoverage(
  coverage: ScanCoverage,
  files: readonly RepositoryFileRecord[],
  symbols: readonly RepositorySymbolRecord[],
): ScanCoverageSummary {
  const discoveredPaths = new Set(coverage.discovered.map(normalizeRepositoryPath));
  const includedPaths = new Set(coverage.included.map(normalizeRepositoryPath));
  const codePaths = new Set(
    files
      .filter((file) => file.sourceKind === "code")
      .map((file) => normalizeRepositoryPath(file.path))
      .filter((path) => discoveredPaths.has(path)),
  );
  const topLevelCodeSymbols = symbols.filter(
    (symbol) => symbol.parentSymbolKey === undefined && codePaths.has(normalizeRepositoryPath(symbol.filePath)),
  );
  const includedTopLevelCodeSymbols = topLevelCodeSymbols.filter((symbol) => includedPaths.has(normalizeRepositoryPath(symbol.filePath)));

  return {
    discoveredCount: coverage.discovered.length,
    includedCount: coverage.included.length,
    excludedCount: coverage.excluded.length,
    failedCount: coverage.failed.length,
    discoveredCodeFileCount: codePaths.size,
    includedCodeFileCount: [...codePaths].filter((path) => includedPaths.has(path)).length,
    discoveredTopLevelCodeSymbolCount: topLevelCodeSymbols.length,
    includedTopLevelCodeSymbolCount: includedTopLevelCodeSymbols.length,
    warnings: [],
  };
}

export function createScanCoverageWarnings(
  profile: ScanProfile,
  summary: ScanCoverageSummary,
  overlay: ScanProfileOverlayResolution,
): string[] {
  if (profile.id !== "code-quality-review" || summary.discoveredCodeFileCount === 0) {
    return [];
  }

  const warnings: string[] = [];
  const includedCodeFileRatio = summary.includedCodeFileCount / summary.discoveredCodeFileCount;
  const includedTopLevelSymbolRatio =
    summary.discoveredTopLevelCodeSymbolCount === 0
      ? 1
      : summary.includedTopLevelCodeSymbolCount / summary.discoveredTopLevelCodeSymbolCount;

  if (summary.includedCodeFileCount === 0) {
    warnings.push(
      `Profile coverage includes no code files in this repository index. Add ${overlay.overlayPath} or call ${overlay.guidanceTool} to customize repository-specific code roots.`,
    );
    return warnings;
  }

  if (includedCodeFileRatio < 0.2 || includedTopLevelSymbolRatio < 0.2) {
    warnings.push(
      `Profile coverage only includes ${summary.includedCodeFileCount}/${summary.discoveredCodeFileCount} code files and ${summary.includedTopLevelCodeSymbolCount}/${summary.discoveredTopLevelCodeSymbolCount} top-level code symbols. Add ${overlay.overlayPath} or call ${overlay.guidanceTool} if this repository uses non-default code roots.`,
    );
  }

  return warnings;
}

export function createScanProfileOverlayHelp(profile: ScanProfile): GetScanProfileOverlayHelpResponse {
  const overlayPath = getScanProfileOverlayPath(profile);
  const templateLines = [
    `formatVersion: ${SCAN_PROFILE_OVERLAY_FORMAT_VERSION}`,
    `profileId: ${profile.id}`,
    "name: Repository code review",
    "description: Repository-specific code review profile for the current layout.",
    "instructions:",
    "  - Review service boundaries before local symptoms.",
    "include:",
    "  - services/**",
    "exclude:",
    "  - vendor/**",
    "archivePatterns:",
    "  - archive/**",
    "legacyPatterns:",
    "  - legacy/**",
    "generatedPatterns:",
    "  - generated/**",
    "sourceTypes:",
    "  - code",
    "  - test",
    "criteria:",
    "  - contract-drift: Implementation behavior differs from the owning contract.",
    "duplicateAuthorityClaimPatterns:",
    "  - source of truth",
    "duplicateAuthorityIgnoredTopicTokens:",
    "  - source",
    "  - truth",
    "duplicateAuthorityGenericTopicTokens:",
    "  - runtime",
    "  - policy",
    "missingOwnerMaterialPaths:",
    "  - readme.md",
    "missingOwnerMaterialFileNames:",
    "  - agents.md",
    "missingOwnerIgnoredPathMarkers:",
    "  - docs/design/",
    "missingOwnerPathKeywords:",
    "  - contract",
    "missingOwnerTextKeywords:",
    "  - incident",
    "staleDocumentationMaterialFileNames:",
    "  - readme.md",
    "staleDocumentationIgnoredPathMarkers:",
    "  - glossary",
    "staleDocumentationPathKeywords:",
    "  - spec",
    "staleDocumentationTextKeywords:",
    "  - supported",
    "staleDocumentationNonCurrentPathMarkers:",
    "  - legacy",
    "staleDocumentationNonCurrentTextMarkers:",
    "  - this document is deprecated",
    "duplicateResponsibilityTopLevelSymbolKinds:",
    "  - class",
    "  - function",
    "duplicateResponsibilityIgnorePathGlobs:",
    "  - '**/generated/**'",
    "  - '**/__fixtures__/**'",
    "ssotOrder:",
    "  - AGENTS.md",
    "  - docs/specs/**",
    "requiredOutputs:",
    "  - findings",
    "boundaryMapRoots:",
    "  - packages:package",
    "  - services:service",
    "boundaryMapContractPathMarkers:",
    "  - /specs/",
    "boundaryMapContractFileStems:",
    "  - contract",
    "  - api",
    "boundaryMapIgnoredTokens:",
    "  - docs",
    "  - tests",
    "boundaryMapTestDirectoryNames:",
    "  - tests",
    "  - qa",
    "boundaryMapRoutePathMarkers:",
    "  - /routes/",
    "boundaryMapRouteNameSuffixes:",
    "  - route",
    "boundaryMapApiPathMarkers:",
    "  - /api/",
    "boundaryMapApiNameSuffixes:",
    "  - handler",
  ];
  const exampleLines =
    profile.id === "code-quality-review"
      ? [
          `formatVersion: ${SCAN_PROFILE_OVERLAY_FORMAT_VERSION}`,
          "profileId: code-quality-review",
          "name: Services code quality review",
          "description: Review service-oriented runtime and storage code in this repository.",
          "instructions:",
          "  - Review service boundaries before component-level findings.",
          "  - Treat runtime contracts in docs/specs as the primary authority for this repository.",
          "include:",
          "  - services/**",
          "  - modules/**",
          "exclude:",
          "  - temp/**",
          "archivePatterns:",
          "  - archived/**",
          "legacyPatterns:",
          "  - legacy-ui/**",
          "generatedPatterns:",
          "  - '**/*.generated.ts'",
          "sourceTypes:",
          "  - specification",
          "  - code",
          "  - test",
          "criteria:",
          "  - duplicate-responsibility: Multiple services own the same runtime policy behavior.",
          "  - undocumented-api: A public service behavior lacks an owning contract.",
          "duplicateResponsibilityTopLevelSymbolKinds:",
          "  - class",
          "  - function",
          "  - type-alias",
          "duplicateResponsibilityIgnorePathGlobs:",
          "  - '**/legacy/**'",
          "  - '**/*.generated.ts'",
          "duplicateAuthorityGenericTopicTokens:",
          "  - runtime",
          "  - service",
          "ssotOrder:",
          "  - AGENTS.md",
          "  - docs/specs/**",
          "  - services/**",
          "requiredOutputs:",
          "  - document-inventory",
          "  - findings",
          "  - boundary-map",
          "boundaryMapRoots:",
          "  - services:service",
          "  - shared:library",
          "boundaryMapContractPathMarkers:",
          "  - /contracts/",
          "  - /specs/",
          "boundaryMapContractFileStems:",
          "  - runtime-policy",
          "  - api",
          "boundaryMapIgnoredTokens:",
          "  - docs",
          "  - tests",
          "boundaryMapTestDirectoryNames:",
          "  - tests",
          "  - qa",
          "boundaryMapRoutePathMarkers:",
          "  - /routes/",
          "boundaryMapRouteNameSuffixes:",
          "  - router",
          "boundaryMapApiPathMarkers:",
          "  - /rpc/",
          "boundaryMapApiNameSuffixes:",
          "  - policy",
        ]
      : [
          `formatVersion: ${SCAN_PROFILE_OVERLAY_FORMAT_VERSION}`,
          `profileId: ${profile.id}`,
          "instructions:",
          "  - Review archived docs only when they still claim current authority.",
          "exclude:",
          "  - docs/archive/**",
          "archivePatterns:",
          "  - historical/**",
          "duplicateAuthorityClaimPatterns:",
          "  - source of truth",
          "duplicateAuthorityGenericTopicTokens:",
          "  - semantic",
          "  - graph",
          "missingOwnerMaterialFileNames:",
          "  - agents.md",
          "  - readme.md",
          "missingOwnerPathKeywords:",
          "  - design",
          "  - contract",
          "staleDocumentationNonCurrentPathMarkers:",
          "  - archive",
          "staleDocumentationNonCurrentTextMarkers:",
          "  - superseded by",
          "ssotOrder:",
          "  - AGENTS.md",
          "  - docs/specs/**",
          "boundaryMapRoots:",
          "  - src:module",
          "boundaryMapTestDirectoryNames:",
          "  - tests",
        ];
  const overlayBuildWorkflow = createOverlayBuildWorkflow();
  const symptomToFieldHints = createOverlaySymptomHints(profile);

  return {
    profileId: profile.id,
    profileVersion: profile.version,
    overlayPath,
    format: "yaml",
    formatVersion: SCAN_PROFILE_OVERLAY_FORMAT_VERSION,
    summary: `Optional repository-local overlay for ${profile.id}@${profile.version}. Use it when the default scan profile definition does not match the repository layout, authority order, or review recipe.`,
    defaultsBehavior: `If ${overlayPath} is missing, HiveMap uses the built-in ${profile.id}@${profile.version} scope without fallback side effects.`,
    validationBehavior: `If ${overlayPath} exists but is invalid, scan_start and repository_evidence_candidates fail with SCAN_PROFILE_OVERLAY_INVALID. HiveMap does not silently ignore a bad overlay.`,
    guidanceTool: "scan_profile_overlay_help",
    mergeRules: [
      "name and description replace the built-in profile presentation fields for this repository.",
      "instructions replaces the built-in ordered scan instructions for this repository.",
      "include appends repository-specific include globs to the built-in profile include list.",
      "exclude appends repository-specific exclude globs to the built-in profile exclude list.",
      "archivePatterns, legacyPatterns, and generatedPatterns append to the effective exclude list.",
      "sourceTypes replaces the built-in source type list.",
      "criteria replaces the built-in criterion list; use '- criterion-id: description' entries.",
      "duplicateAuthorityClaimPatterns replaces the regex patterns used to detect authority-style documentation claims.",
      "duplicateAuthorityIgnoredTopicTokens replaces the topic tokens ignored when duplicate-authority derives shared concerns from headings and lines.",
      "duplicateAuthorityGenericTopicTokens replaces the generic shared tokens that are insufficient on their own for duplicate-authority evidence selection.",
      "missingOwnerMaterialPaths replaces the exact normalized paths always treated as material for missing-owner evidence selection.",
      "missingOwnerMaterialFileNames replaces the documentation basenames always treated as material for missing-owner evidence selection.",
      "missingOwnerIgnoredPathMarkers replaces the ignored path markers for missing-owner evidence selection.",
      "missingOwnerPathKeywords replaces the path keywords for missing-owner evidence selection.",
      "missingOwnerTextKeywords replaces the text keywords for missing-owner evidence selection.",
      "staleDocumentationMaterialFileNames replaces the documentation basenames always treated as material for stale-documentation evidence selection.",
      "staleDocumentationIgnoredPathMarkers replaces the ignored path markers for stale-documentation evidence selection.",
      "staleDocumentationPathKeywords replaces the path keywords for stale-documentation evidence selection.",
      "staleDocumentationTextKeywords replaces the text keywords for stale-documentation evidence selection.",
      "staleDocumentationNonCurrentPathMarkers replaces the non-current path markers for stale-documentation evidence selection.",
      "staleDocumentationNonCurrentTextMarkers replaces the non-current text markers for stale-documentation evidence selection.",
      "duplicateResponsibilityTopLevelSymbolKinds replaces the allowed top-level symbol kinds for duplicate-responsibility evidence selection.",
      "duplicateResponsibilityIgnorePathGlobs replaces the ignored path globs for duplicate-responsibility evidence selection.",
      "ssotOrder replaces the built-in SSOT precedence order.",
      "requiredOutputs replaces the built-in required output list.",
      "boundaryMapRoots replaces the built-in root-to-boundary-kind rules for scan_boundary_map_build.",
      "boundaryMapContractPathMarkers replaces the built-in contract path markers for boundary-map documentation linking.",
      "boundaryMapContractFileStems replaces the built-in documentation filename stems treated as contract-like for boundary mapping.",
      "boundaryMapIgnoredTokens replaces the built-in generic token ignore list used when matching docs to boundaries.",
      "boundaryMapTestDirectoryNames replaces the built-in test-directory names used when deriving test-suite boundary roots.",
      "boundaryMapRoutePathMarkers and boundaryMapRouteNameSuffixes replace the built-in route entrypoint detection heuristics.",
      "boundaryMapApiPathMarkers and boundaryMapApiNameSuffixes replace the built-in API entrypoint detection heuristics.",
      "profileId must exactly match the target scan profile id.",
      `formatVersion must equal ${SCAN_PROFILE_OVERLAY_FORMAT_VERSION}.`,
    ],
    supportedFields: [
      { name: "formatVersion", required: true, description: "Exact overlay schema version for fail-fast validation." },
      { name: "profileId", required: true, description: "Exact target scan profile id, for example code-quality-review." },
      { name: "name", required: false, description: "Replacement repository-specific profile name." },
      { name: "description", required: false, description: "Replacement repository-specific profile description." },
      { name: "instructions", required: false, description: "Replacement ordered scan instructions for this repository." },
      { name: "include", required: false, description: "Additional repository-specific include globs to append to the base profile." },
      { name: "exclude", required: false, description: "Additional repository-specific exclude globs to append to the base profile." },
      { name: "archivePatterns", required: false, description: "Archive-only globs appended to the effective exclude list." },
      { name: "legacyPatterns", required: false, description: "Legacy-only globs appended to the effective exclude list." },
      { name: "generatedPatterns", required: false, description: "Generated-code globs appended to the effective exclude list." },
      { name: "sourceTypes", required: false, description: "Replacement source type list for this repository." },
      { name: "criteria", required: false, description: "Replacement criterion list using '- criterion-id: description' entries." },
      {
        name: "duplicateAuthorityClaimPatterns",
        required: false,
        description: "Replacement regex patterns used to detect authority-style documentation claims.",
      },
      {
        name: "duplicateAuthorityIgnoredTopicTokens",
        required: false,
        description: "Replacement topic tokens ignored when duplicate-authority derives shared concerns from headings and lines.",
      },
      {
        name: "duplicateAuthorityGenericTopicTokens",
        required: false,
        description: "Replacement generic shared tokens that are insufficient on their own for duplicate-authority evidence selection.",
      },
      {
        name: "missingOwnerMaterialPaths",
        required: false,
        description: "Replacement exact normalized paths always treated as material for missing-owner evidence selection.",
      },
      {
        name: "missingOwnerMaterialFileNames",
        required: false,
        description: "Replacement documentation basenames always treated as material for missing-owner evidence selection.",
      },
      {
        name: "missingOwnerIgnoredPathMarkers",
        required: false,
        description: "Replacement ignored path markers for missing-owner evidence selection.",
      },
      { name: "missingOwnerPathKeywords", required: false, description: "Replacement path keywords for missing-owner evidence selection." },
      { name: "missingOwnerTextKeywords", required: false, description: "Replacement text keywords for missing-owner evidence selection." },
      {
        name: "staleDocumentationMaterialFileNames",
        required: false,
        description: "Replacement documentation basenames always treated as material for stale-documentation evidence selection.",
      },
      {
        name: "staleDocumentationIgnoredPathMarkers",
        required: false,
        description: "Replacement ignored path markers for stale-documentation evidence selection.",
      },
      {
        name: "staleDocumentationPathKeywords",
        required: false,
        description: "Replacement path keywords for stale-documentation evidence selection.",
      },
      {
        name: "staleDocumentationTextKeywords",
        required: false,
        description: "Replacement text keywords for stale-documentation evidence selection.",
      },
      {
        name: "staleDocumentationNonCurrentPathMarkers",
        required: false,
        description: "Replacement non-current path markers for stale-documentation evidence selection.",
      },
      {
        name: "staleDocumentationNonCurrentTextMarkers",
        required: false,
        description: "Replacement non-current text markers for stale-documentation evidence selection.",
      },
      {
        name: "duplicateResponsibilityTopLevelSymbolKinds",
        required: false,
        description: "Replacement allowed top-level symbol kinds for duplicate-responsibility evidence selection.",
      },
      {
        name: "duplicateResponsibilityIgnorePathGlobs",
        required: false,
        description: "Replacement ignored path globs for duplicate-responsibility evidence selection.",
      },
      { name: "ssotOrder", required: false, description: "Replacement SSOT precedence order for this repository." },
      { name: "requiredOutputs", required: false, description: "Replacement required output list for this repository." },
      { name: "boundaryMapRoots", required: false, description: "Replacement root rules for boundary-map build in path-prefix:boundary-kind format." },
      { name: "boundaryMapContractPathMarkers", required: false, description: "Replacement path markers treated as contract-like documentation for boundary mapping." },
      { name: "boundaryMapContractFileStems", required: false, description: "Replacement filename stems treated as contract-like documentation for boundary mapping." },
      { name: "boundaryMapIgnoredTokens", required: false, description: "Replacement generic token ignore list used when matching docs to boundaries." },
      { name: "boundaryMapTestDirectoryNames", required: false, description: "Replacement directory-name markers treated as test-suite roots during boundary mapping." },
      { name: "boundaryMapRoutePathMarkers", required: false, description: "Replacement path markers used to classify route entrypoints during boundary mapping." },
      { name: "boundaryMapRouteNameSuffixes", required: false, description: "Replacement symbol-name suffixes used to classify route entrypoints during boundary mapping." },
      { name: "boundaryMapApiPathMarkers", required: false, description: "Replacement path markers used to classify API entrypoints during boundary mapping." },
      { name: "boundaryMapApiNameSuffixes", required: false, description: "Replacement symbol-name suffixes used to classify API entrypoints during boundary mapping." },
    ],
    overlayBuildWorkflow,
    symptomToFieldHints,
    baseScope: {
      include: [...profile.scope.include],
      exclude: [...profile.scope.exclude],
    },
    template: templateLines.join("\n"),
    example: exampleLines.join("\n"),
  };
}

type SuggestedOverlayField = SuggestScanProfileOverlayResponse["suggestedFields"][number];

function createOverlayBuildWorkflow(): string[] {
  return [
    "Start from scan_start on a completed repository index and treat the first pass as provisional calibration, not final findings.",
    "Review overlay status, derived coverage shape, and representative repository_evidence_candidates or boundary-map output before editing any fields.",
    "Write only the smallest overlay change that explains the mismatch, preferring recipe fields or root markers over broad include/exclude churn.",
    "Record refine-overlay, restart the scan from the same repository index, and compare whether the new packets remove the original calibration symptom.",
    "Keep fields that proved necessary, remove guesswork that did not change packet shape, and preserve the final overlay as repo-local contract.",
  ];
}

function createOverlaySymptomHints(profile: ScanProfile): ScanProfileOverlaySymptomHint[] {
  return profile.id === "code-quality-review"
    ? [
        {
          id: "scope-roots",
          symptom: "Coverage misses the actual code roots, tool roots, or test families used by the repository.",
          fields: ["include", "exclude", "boundaryMapRoots", "boundaryMapTestDirectoryNames"],
          rationale: "Fix scan scope and boundary roots before tuning downstream evidence packets.",
        },
        {
          id: "boundary-map-heuristics",
          symptom: "Boundary map misclassifies contracts, entrypoints, or tests even though coverage looks right.",
          fields: [
            "boundaryMapContractPathMarkers",
            "boundaryMapContractFileStems",
            "boundaryMapRoutePathMarkers",
            "boundaryMapRouteNameSuffixes",
            "boundaryMapApiPathMarkers",
            "boundaryMapApiNameSuffixes",
          ],
          rationale: "These fields tune structural interpretation without changing the covered inventory.",
        },
        {
          id: "duplicate-responsibility-selection",
          symptom: "Duplicate-responsibility packets include fixture/generated code or miss the real public symbols.",
          fields: ["duplicateResponsibilityTopLevelSymbolKinds", "duplicateResponsibilityIgnorePathGlobs"],
          rationale: "Tune evidence selection before filing a duplicated-ownership finding.",
        },
      ]
    : [
        {
          id: "duplicate-authority-selection",
          symptom: "Authority-style packets are too broad, too noisy, or miss repository-specific authority phrasing.",
          fields: [
            "duplicateAuthorityClaimPatterns",
            "duplicateAuthorityIgnoredTopicTokens",
            "duplicateAuthorityGenericTopicTokens",
          ],
          rationale: "Tune duplicate-authority claim detection and topic matching before changing broader scan scope.",
        },
        {
          id: "missing-owner-materiality",
          symptom: "Missing-owner packets ignore material docs or keep surfacing glossary/history-style pages.",
          fields: [
            "missingOwnerMaterialPaths",
            "missingOwnerMaterialFileNames",
            "missingOwnerIgnoredPathMarkers",
            "missingOwnerPathKeywords",
            "missingOwnerTextKeywords",
          ],
          rationale: "Tune materiality first so missing-owner packets reflect repository-specific documentation shape.",
        },
        {
          id: "stale-documentation-currentness",
          symptom: "Stale-documentation packets treat archived docs as current or miss the real current-looking conflicts.",
          fields: [
            "staleDocumentationMaterialFileNames",
            "staleDocumentationIgnoredPathMarkers",
            "staleDocumentationPathKeywords",
            "staleDocumentationTextKeywords",
            "staleDocumentationNonCurrentPathMarkers",
            "staleDocumentationNonCurrentTextMarkers",
          ],
          rationale: "Tune currentness and materiality before changing SSOT precedence or broad scope.",
        },
        {
          id: "ssot-order",
          symptom: "The right docs are in scope but stale or conflict packets still rank the wrong owner higher.",
          fields: ["ssotOrder"],
          rationale: "SSOT precedence should move only after packet shape and currentness look coherent.",
        },
      ];
}

export function findOverlaySymptomHint(profile: ScanProfile, symptomId: ScanProfileOverlaySymptomId): ScanProfileOverlaySymptomHint {
  const hint = createOverlaySymptomHints(profile).find((candidate) => candidate.id === symptomId);
  if (hint === undefined) {
    throw new RuntimeError(`Overlay symptom ${symptomId} is not supported for profile ${profile.id}@${profile.version}`, {
      code: "SCAN_PROFILE_OVERLAY_SYMPTOM_NOT_SUPPORTED",
      details: {
        profileId: profile.id,
        profileVersion: profile.version,
        symptomId,
      },
    });
  }
  return hint;
}

export function createSuggestedOverlayFields(
  profile: ScanProfile,
  boundaryMapConfig: ReturnType<typeof createBoundaryMapBuildConfig>,
  symptom: ScanProfileOverlaySymptomHint,
): SuggestedOverlayField[] {
  return symptom.fields.map((field) => {
    const boundaryMapValues = resolveBoundaryMapFieldValues(boundaryMapConfig, field);
    if (boundaryMapValues !== undefined) {
      return {
        name: field,
        source: "boundary-map-config",
        currentValues: boundaryMapValues,
      };
    }

    return {
      name: field,
      source: "effective-profile",
      currentValues: resolveProfileOverlayFieldValues(profile, field),
    };
  });
}

function resolveBoundaryMapFieldValues(
  config: ReturnType<typeof createBoundaryMapBuildConfig>,
  field: string,
): string[] | undefined {
  switch (field) {
    case "boundaryMapRoots":
      return config.roots.map((rule) => `${rule.pathPrefix}:${rule.kind}`);
    case "boundaryMapContractPathMarkers":
      return [...config.contractPathMarkers];
    case "boundaryMapContractFileStems":
      return [...config.contractFileStems];
    case "boundaryMapIgnoredTokens":
      return [...config.ignoredDocTokens];
    case "boundaryMapTestDirectoryNames":
      return [...config.testDirectoryNames];
    case "boundaryMapRoutePathMarkers":
      return [...config.routePathMarkers];
    case "boundaryMapRouteNameSuffixes":
      return [...config.routeNameSuffixes];
    case "boundaryMapApiPathMarkers":
      return [...config.apiPathMarkers];
    case "boundaryMapApiNameSuffixes":
      return [...config.apiNameSuffixes];
    default:
      return undefined;
  }
}

function resolveProfileOverlayFieldValues(profile: ScanProfile, field: string): string[] {
  switch (field) {
    case "include":
      return [...profile.scope.include];
    case "exclude":
      return [...profile.scope.exclude];
    case "ssotOrder":
      return [...profile.ssotOrder];
    case "duplicateAuthorityClaimPatterns":
      return requireStringListField(profile.duplicateAuthorityClaimPatterns, field, profile);
    case "duplicateAuthorityIgnoredTopicTokens":
      return requireStringListField(profile.duplicateAuthorityIgnoredTopicTokens, field, profile);
    case "duplicateAuthorityGenericTopicTokens":
      return requireStringListField(profile.duplicateAuthorityGenericTopicTokens, field, profile);
    case "missingOwnerMaterialPaths":
      return requireStringListField(profile.missingOwnerMaterialPaths, field, profile);
    case "missingOwnerMaterialFileNames":
      return requireStringListField(profile.missingOwnerMaterialFileNames, field, profile);
    case "missingOwnerIgnoredPathMarkers":
      return requireStringListField(profile.missingOwnerIgnoredPathMarkers, field, profile);
    case "missingOwnerPathKeywords":
      return requireStringListField(profile.missingOwnerPathKeywords, field, profile);
    case "missingOwnerTextKeywords":
      return requireStringListField(profile.missingOwnerTextKeywords, field, profile);
    case "staleDocumentationMaterialFileNames":
      return requireStringListField(profile.staleDocumentationMaterialFileNames, field, profile);
    case "staleDocumentationIgnoredPathMarkers":
      return requireStringListField(profile.staleDocumentationIgnoredPathMarkers, field, profile);
    case "staleDocumentationPathKeywords":
      return requireStringListField(profile.staleDocumentationPathKeywords, field, profile);
    case "staleDocumentationTextKeywords":
      return requireStringListField(profile.staleDocumentationTextKeywords, field, profile);
    case "staleDocumentationNonCurrentPathMarkers":
      return requireStringListField(profile.staleDocumentationNonCurrentPathMarkers, field, profile);
    case "staleDocumentationNonCurrentTextMarkers":
      return requireStringListField(profile.staleDocumentationNonCurrentTextMarkers, field, profile);
    case "duplicateResponsibilityTopLevelSymbolKinds":
      return requireStringListField(profile.duplicateResponsibilityTopLevelSymbolKinds, field, profile);
    case "duplicateResponsibilityIgnorePathGlobs":
      return requireStringListField(profile.duplicateResponsibilityIgnorePathGlobs, field, profile);
    default:
      throw new RuntimeError(`Overlay suggestion does not support profile field ${field}`, {
        code: "SCAN_PROFILE_OVERLAY_FIELD_NOT_SUPPORTED",
        details: {
          profileId: profile.id,
          profileVersion: profile.version,
          field,
        },
      });
  }
}

function requireStringListField(values: readonly string[] | undefined, field: string, profile: ScanProfile): string[] {
  if (values === undefined) {
    throw new RuntimeError(`Overlay suggestion requires active field ${field} on profile ${profile.id}@${profile.version}`, {
      code: "SCAN_PROFILE_OVERLAY_FIELD_UNDEFINED",
      details: {
        profileId: profile.id,
        profileVersion: profile.version,
        field,
      },
    });
  }
  return [...values];
}

export function serializeSuggestedOverlayPatch(profile: ScanProfile, suggestedFields: readonly SuggestedOverlayField[]): string {
  const lines = [
    `formatVersion: ${SCAN_PROFILE_OVERLAY_FORMAT_VERSION}`,
    `profileId: ${profile.id}`,
  ];
  for (const field of suggestedFields) {
    lines.push(`${field.name}:`);
    for (const value of field.currentValues) {
      lines.push(`  - ${serializeOverlayYamlListItem(value)}`);
    }
  }
  return lines.join("\n");
}

function serializeOverlayYamlListItem(value: string): string {
  return JSON.stringify(value);
}

function readRepositoryIndexedFileText(filePath: string, chunks: readonly RepositoryChunkRecord[]): string {
  const matchingChunks = chunks
    .filter((chunk) => normalizeRepositoryPath(chunk.filePath) === filePath)
    .sort((left, right) => {
      const lineDelta = left.startLine - right.startLine;
      if (lineDelta !== 0) {
        return lineDelta;
      }
      return left.id.localeCompare(right.id);
    });
  if (matchingChunks.length === 0) {
    throw new Error(`Indexed repository file ${filePath} has no chunk text`);
  }
  return matchingChunks.map((chunk) => chunk.text).join("\n");
}

function parseScanProfileOverlayYaml(text: string, overlayPath: string): ScanProfileOverlay {
  const overlay: Partial<ScanProfileOverlay> = {};
  let activeListField:
    | "instructions"
    | "include"
    | "exclude"
    | "archivePatterns"
    | "legacyPatterns"
    | "generatedPatterns"
    | "sourceTypes"
    | "criteria"
    | "duplicateAuthorityClaimPatterns"
    | "duplicateAuthorityIgnoredTopicTokens"
    | "duplicateAuthorityGenericTopicTokens"
    | "missingOwnerMaterialPaths"
    | "missingOwnerMaterialFileNames"
    | "missingOwnerIgnoredPathMarkers"
    | "missingOwnerPathKeywords"
    | "missingOwnerTextKeywords"
    | "staleDocumentationMaterialFileNames"
    | "staleDocumentationIgnoredPathMarkers"
    | "staleDocumentationPathKeywords"
    | "staleDocumentationTextKeywords"
    | "staleDocumentationNonCurrentPathMarkers"
    | "staleDocumentationNonCurrentTextMarkers"
    | "duplicateResponsibilityTopLevelSymbolKinds"
    | "duplicateResponsibilityIgnorePathGlobs"
    | "ssotOrder"
    | "requiredOutputs"
    | "boundaryMapRoots"
    | "boundaryMapContractPathMarkers"
    | "boundaryMapContractFileStems"
    | "boundaryMapIgnoredTokens"
    | "boundaryMapTestDirectoryNames"
    | "boundaryMapRoutePathMarkers"
    | "boundaryMapRouteNameSuffixes"
    | "boundaryMapApiPathMarkers"
    | "boundaryMapApiNameSuffixes"
    | undefined;

  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const lineNumber = index + 1;
    const line = stripYamlInlineComment(rawLine);
    if (line.trim().length === 0) {
      continue;
    }

    if (/^\s/.test(line)) {
      if (activeListField === undefined) {
        throw new Error(`Line ${lineNumber} in ${overlayPath} is indented without a list field`);
      }
      const trimmed = line.trim();
      if (!trimmed.startsWith("- ")) {
        throw new Error(`Line ${lineNumber} in ${overlayPath} must use '- value' list syntax`);
      }
      const item = parseYamlScalar(trimmed.slice(2), overlayPath, lineNumber);
      if (activeListField === "criteria") {
        const nextValue = overlay.criteria ?? [];
        nextValue.push(parseScanCriterionDefinition(item, overlayPath, lineNumber));
        overlay.criteria = nextValue;
        continue;
      }
      if (activeListField === "requiredOutputs") {
        const nextValue = overlay.requiredOutputs ?? [];
        nextValue.push(parseScanRequiredOutput(item, overlayPath, lineNumber));
        overlay.requiredOutputs = nextValue;
        continue;
      }
      const nextValue = overlay[activeListField] ?? [];
      if (!Array.isArray(nextValue)) {
        throw new Error(`Field ${activeListField} in ${overlayPath} must be a list`);
      }
      nextValue.push(item);
      overlay[activeListField] = nextValue;
      continue;
    }

    activeListField = undefined;
    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 1) {
      throw new Error(`Line ${lineNumber} in ${overlayPath} must use key: value syntax`);
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (key in overlay) {
      throw new Error(`Field ${key} is defined more than once in ${overlayPath}`);
    }
    switch (key) {
      case "formatVersion": {
        if (value.length === 0) {
          throw new Error(`Field formatVersion in ${overlayPath} must be an inline scalar`);
        }
        const parsed = Number.parseInt(parseYamlScalar(value, overlayPath, lineNumber), 10);
        if (!Number.isInteger(parsed)) {
          throw new Error(`Field formatVersion in ${overlayPath} must be an integer`);
        }
        overlay.formatVersion = parsed as ScanProfileOverlay["formatVersion"];
        break;
      }
      case "name":
        if (value.length === 0) {
          throw new Error(`Field name in ${overlayPath} must be an inline scalar`);
        }
        overlay.name = parseYamlScalar(value, overlayPath, lineNumber);
        break;
      case "description":
        if (value.length === 0) {
          throw new Error(`Field description in ${overlayPath} must be an inline scalar`);
        }
        overlay.description = parseYamlScalar(value, overlayPath, lineNumber);
        break;
      case "profileId":
        if (value.length === 0) {
          throw new Error(`Field profileId in ${overlayPath} must be an inline scalar`);
        }
        overlay.profileId = parseYamlScalar(value, overlayPath, lineNumber);
        break;
      case "instructions":
      case "include":
      case "exclude":
      case "archivePatterns":
      case "legacyPatterns":
      case "generatedPatterns":
      case "sourceTypes":
      case "criteria":
      case "duplicateAuthorityClaimPatterns":
      case "duplicateAuthorityIgnoredTopicTokens":
      case "duplicateAuthorityGenericTopicTokens":
      case "missingOwnerMaterialPaths":
      case "missingOwnerMaterialFileNames":
      case "missingOwnerIgnoredPathMarkers":
      case "missingOwnerPathKeywords":
      case "missingOwnerTextKeywords":
      case "staleDocumentationMaterialFileNames":
      case "staleDocumentationIgnoredPathMarkers":
      case "staleDocumentationPathKeywords":
      case "staleDocumentationTextKeywords":
      case "staleDocumentationNonCurrentPathMarkers":
      case "staleDocumentationNonCurrentTextMarkers":
      case "duplicateResponsibilityTopLevelSymbolKinds":
      case "duplicateResponsibilityIgnorePathGlobs":
      case "ssotOrder":
      case "requiredOutputs":
      case "boundaryMapRoots":
      case "boundaryMapContractPathMarkers":
      case "boundaryMapContractFileStems":
      case "boundaryMapIgnoredTokens":
      case "boundaryMapTestDirectoryNames":
      case "boundaryMapRoutePathMarkers":
      case "boundaryMapRouteNameSuffixes":
      case "boundaryMapApiPathMarkers":
      case "boundaryMapApiNameSuffixes":
        if (value.length !== 0) {
          throw new Error(`Field ${key} in ${overlayPath} must use indented '- value' items`);
        }
        overlay[key] = [];
        activeListField = key;
        break;
      default:
        throw new Error(`Unknown overlay field ${key} in ${overlayPath}`);
    }
  }

  if (overlay.formatVersion === undefined || overlay.profileId === undefined) {
    throw new Error(`Overlay ${overlayPath} must define formatVersion and profileId`);
  }
  return overlay as ScanProfileOverlay;
}

function parseYamlScalar(value: string, overlayPath: string, lineNumber: number): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`Line ${lineNumber} in ${overlayPath} contains an empty scalar value`);
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseScanCriterionDefinition(value: string, overlayPath: string, lineNumber: number): ScanProfile["criteria"][number] {
  const separatorIndex = value.indexOf(":");
  if (separatorIndex < 1 || separatorIndex === value.length - 1) {
    throw new Error(`Line ${lineNumber} in ${overlayPath} criteria entries must use 'criterion-id: description' syntax`);
  }
  return {
    id: value.slice(0, separatorIndex).trim(),
    description: value.slice(separatorIndex + 1).trim(),
  };
}

function parseScanRequiredOutput(value: string, overlayPath: string, lineNumber: number): ScanProfile["requiredOutputs"][number] {
  if (
    value !== "document-inventory" &&
    value !== "concept-map" &&
    value !== "findings" &&
    value !== "coverage-report" &&
    value !== "boundary-map"
  ) {
    throw new Error(`Line ${lineNumber} in ${overlayPath} uses unknown required output: ${value}`);
  }
  return value;
}

function stripYamlInlineComment(value: string): string {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index] ?? "";
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }
    if (char === "#" && !inSingleQuote && !inDoubleQuote) {
      return value.slice(0, index).trimEnd();
    }
  }
  return value;
}

function createScanProfileOverlayInvalidError(profile: ScanProfile, overlayPath: string, error: unknown): RuntimeError {
  const message = error instanceof Error ? error.message : "Invalid scan profile overlay";
  return new RuntimeError(`Invalid scan profile overlay at ${overlayPath}: ${message}`, {
    code: "SCAN_PROFILE_OVERLAY_INVALID",
    details: {
      overlayPath,
      profileId: profile.id,
      profileVersion: profile.version,
      guidanceTool: "scan_profile_overlay_help",
    },
  });
}
