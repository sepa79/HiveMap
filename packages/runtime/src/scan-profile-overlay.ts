/**
 * Responsibility: Parse and resolve one repository-index-backed scan-profile overlay.
 * Must not: Derive coverage, create guidance, build boundary maps, or persist scan state.
 * Contract: docs/specs/repository-scan.md#scan-profile
 */
import type { ScanProfileOverlayResolution } from "@hivemap/api-contracts";
import {
  applyScanProfileOverlay,
  getScanProfileOverlayPath,
  type ScanProfile,
  type ScanProfileOverlay,
} from "@hivemap/scans";
import type { RepositoryChunkRecord, RepositoryFileRecord } from "@hivemap/storage";

import { normalizeRepositoryPath } from "./repository-path.js";
import { RuntimeError } from "./runtime-error.js";

export type ResolvedScanProfileOverlay = {
  effectiveProfile: ScanProfile;
  overlay: ScanProfileOverlayResolution;
};

export function resolveScanProfileOverlay(
  baseProfile: ScanProfile,
  files: readonly RepositoryFileRecord[],
  chunks: readonly RepositoryChunkRecord[],
): ResolvedScanProfileOverlay {
  const overlayPath = normalizeRepositoryPath(getScanProfileOverlayPath(baseProfile));
  const overlayFile = files.find((file) => normalizeRepositoryPath(file.path) === overlayPath);
  if (overlayFile === undefined) {
    return {
      effectiveProfile: baseProfile,
      overlay: createMissingScanProfileOverlayResolution(overlayPath),
    };
  }

  const overlay = readScanProfileOverlayFromRepository(baseProfile, overlayPath, chunks);
  let effectiveProfile: ScanProfile;
  try {
    effectiveProfile = applyScanProfileOverlay(baseProfile, overlay);
  } catch (error) {
    throw createScanProfileOverlayInvalidError(baseProfile, overlayPath, error);
  }
  return {
    effectiveProfile,
    overlay: {
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
    },
  };
}
function createMissingScanProfileOverlayResolution(overlayPath: string): ScanProfileOverlayResolution {
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

export function readScanProfileOverlayFromRepository(
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
