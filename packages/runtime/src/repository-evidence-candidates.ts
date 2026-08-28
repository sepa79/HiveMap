/**
 * Responsibility: Build bounded repository evidence candidates for explicit scan criteria.
 * Must not: Read repositories, mutate graph state, infer hidden profile defaults, or perform storage IO.
 * Contract: Uses only supplied indexed records, effective profile recipes, included paths, and limit.
 */
import { createHash } from "node:crypto";
import { posix as pathPosix } from "node:path";

import type { RepositoryEvidenceCandidate, RepositoryEvidenceSource } from "@hivemap/api-contracts";
import type { ScanProfile } from "@hivemap/scans";
import type {
  RepositoryChunkRecord,
  RepositoryDependencyRecord,
  RepositoryFileRecord,
  RepositorySymbolRecord,
} from "@hivemap/storage";

import { matchesAnyGlob, matchesGlob, normalizeRepositoryPath } from "./repository-path.js";
import { RuntimeError } from "./runtime-error.js";

export function createRepositoryEvidenceCandidates(options: {
  profile: ScanProfile;
  criterionId: string;
  files: readonly RepositoryFileRecord[];
  chunks: readonly RepositoryChunkRecord[];
  symbols: readonly RepositorySymbolRecord[];
  dependencies: readonly RepositoryDependencyRecord[];
  limit: number;
  includedPaths: readonly string[];
}): RepositoryEvidenceCandidate[] {
  const includedPaths = new Set(options.includedPaths.map(normalizeRepositoryPath));
  const includedFiles = options.files.filter((file) => includedPaths.has(normalizeRepositoryPath(file.path)));
  const includedChunks = options.chunks.filter((chunk) => includedPaths.has(normalizeRepositoryPath(chunk.filePath)));
  const includedSymbols = options.symbols.filter((symbol) => includedPaths.has(normalizeRepositoryPath(symbol.filePath)));
  const includedDependencies = options.dependencies.filter((dependency) => includedPaths.has(normalizeRepositoryPath(dependency.filePath)));

  switch (options.profile.id) {
    case "documentation-conflicts":
      switch (options.criterionId) {
        case "contradictory-claims":
          return buildContradictoryClaimCandidates(options.profile, includedFiles, includedChunks, options.limit);
        case "stale-documentation":
          return buildStaleDocumentationCandidates(options.profile, includedFiles, includedChunks, options.limit);
        case "broken-references":
          return buildBrokenReferenceCandidates(options.files, includedChunks, options.chunks, options.limit);
        case "duplicate-authority":
          return buildDuplicateAuthorityCandidates(options.profile, includedChunks, options.limit);
        case "missing-owner":
          return buildMissingOwnerCandidates(options.profile, includedFiles, includedChunks, options.limit);
        default:
          return [];
      }
    case "code-quality-review":
      switch (options.criterionId) {
        case "duplicate-responsibility":
          return buildDuplicateResponsibilityCandidates(
            includedFiles,
            includedSymbols,
            includedDependencies,
            options.limit,
            createDuplicateResponsibilityEvidenceRecipe(options.profile),
          );
        default:
          return [];
      }
    default:
      return [];
  }
}

type DuplicateResponsibilityEvidenceRecipe = {
  topLevelSymbolKinds: Set<string>;
  ignorePathGlobs: string[];
};

type DuplicateAuthorityEvidenceRecipe = {
  claimPatterns: RegExp[];
  ignoredTopicTokens: Set<string>;
  genericTopicTokens: Set<string>;
};

type MissingOwnerEvidenceRecipe = {
  materialPaths: Set<string>;
  materialFileNames: Set<string>;
  ignoredPathMarkers: string[];
  pathKeywords: string[];
  textKeywords: string[];
};

type StaleDocumentationEvidenceRecipe = {
  materialFileNames: Set<string>;
  ignoredPathMarkers: string[];
  pathKeywords: string[];
  textKeywords: string[];
  nonCurrentPathMarkers: string[];
  nonCurrentTextMarkers: string[];
};

type RecipeStringListField =
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
  | "staleDocumentationNonCurrentTextMarkers";

function buildDuplicateResponsibilityCandidates(
  files: readonly RepositoryFileRecord[],
  symbols: readonly RepositorySymbolRecord[],
  dependencies: readonly RepositoryDependencyRecord[],
  limit: number,
  recipe: DuplicateResponsibilityEvidenceRecipe,
): RepositoryEvidenceCandidate[] {
  const codePaths = new Set(
    files
      .filter((file) => file.sourceKind === "code")
      .filter((file) => isMaterialDuplicateResponsibilityPath(file.path, recipe))
      .map((file) => normalizeRepositoryPath(file.path)),
  );
  const groups = new Map<string, RepositorySymbolRecord[]>();
  const dependencyNeighborhoods = createDependencyNeighborhoodIndex(codePaths, dependencies);

  for (const symbol of symbols) {
    if (!codePaths.has(normalizeRepositoryPath(symbol.filePath))) {
      continue;
    }
    if (symbol.parentSymbolKey !== undefined) {
      continue;
    }
    if (!symbol.isExported && !symbol.isPublic) {
      continue;
    }
    if (!recipe.topLevelSymbolKinds.has(symbol.kind.toLocaleLowerCase())) {
      continue;
    }
    const normalizedName = symbol.name.trim().toLocaleLowerCase();
    if (normalizedName.length === 0) {
      continue;
    }
    const existing = groups.get(normalizedName);
    if (existing === undefined) {
      groups.set(normalizedName, [symbol]);
    } else {
      existing.push(symbol);
    }
  }

  return [...groups.entries()]
    .map(([normalizedName, group]) => {
      const topology = describeDuplicateResponsibilityTopology(group, dependencyNeighborhoods);
      return {
      normalizedName,
      group: group.sort(compareRepositorySymbols),
      topology,
    };
    })
    .filter(({ group }) => new Set(group.map((symbol) => symbol.filePath)).size > 1)
    .sort((left, right) => {
      const countDelta = right.group.length - left.group.length;
      if (countDelta !== 0) {
        return countDelta;
      }
      const sharedDependencyDelta = right.topology.sharedDependencyCount - left.topology.sharedDependencyCount;
      if (sharedDependencyDelta !== 0) {
        return sharedDependencyDelta;
      }
      const directDependencyDelta = right.topology.directDependencyCount - left.topology.directDependencyCount;
      if (directDependencyDelta !== 0) {
        return directDependencyDelta;
      }
      return left.normalizedName.localeCompare(right.normalizedName);
    })
    .slice(0, limit)
    .map(({ normalizedName, group, topology }) => {
      const displayName = group[0]?.name ?? normalizedName;
      const topologySummary = createDuplicateResponsibilityTopologySummary(topology);
      return {
        id: `duplicate-responsibility:${normalizedName}`,
        criterionId: "duplicate-responsibility",
        signal: "duplicate-responsibility",
        kind: "requires_interpretation",
        title: `Repeated top-level symbol: ${displayName}`,
        summary:
          topologySummary === undefined
            ? `Top-level exported/public symbol '${displayName}' appears in multiple covered code files. Review whether responsibility is intentionally split or duplicated.`
            : `Top-level exported/public symbol '${displayName}' appears in multiple covered code files. ${topologySummary} Review whether responsibility is intentionally split or duplicated.`,
        sources: group.map((symbol) => ({
          kind: "chunk",
          filePath: symbol.filePath,
          language: symbol.language,
          sourceKind: "code",
          snippet: `${symbol.kind} ${symbol.qualifiedName}`,
          startLine: symbol.startLine,
          endLine: symbol.endLine,
          whySelected: createDuplicateResponsibilityWhySelected(symbol.filePath, topology),
        })),
      };
    });
}

function createDuplicateResponsibilityEvidenceRecipe(profile: ScanProfile): DuplicateResponsibilityEvidenceRecipe {
  if (
    profile.duplicateResponsibilityTopLevelSymbolKinds === undefined ||
    profile.duplicateResponsibilityTopLevelSymbolKinds.length === 0
  ) {
    throw new RuntimeError(
      `Scan profile ${profile.id}@${profile.version} is missing duplicateResponsibilityTopLevelSymbolKinds for duplicate-responsibility evidence selection`,
      { code: "SCAN_PROFILE_INVALID" },
    );
  }
  if (profile.duplicateResponsibilityIgnorePathGlobs === undefined) {
    throw new RuntimeError(
      `Scan profile ${profile.id}@${profile.version} is missing duplicateResponsibilityIgnorePathGlobs for duplicate-responsibility evidence selection`,
      { code: "SCAN_PROFILE_INVALID" },
    );
  }
  return {
    topLevelSymbolKinds: new Set(profile.duplicateResponsibilityTopLevelSymbolKinds.map((value) => value.toLocaleLowerCase())),
    ignorePathGlobs: profile.duplicateResponsibilityIgnorePathGlobs.map((value) => normalizeRepositoryPath(value).toLocaleLowerCase()),
  };
}

function createDuplicateAuthorityEvidenceRecipe(profile: ScanProfile): DuplicateAuthorityEvidenceRecipe {
  const claimPatterns = normalizeRecipeValues(profile, "duplicateAuthorityClaimPatterns");
  return {
    claimPatterns: claimPatterns.map((pattern) => {
      try {
        return new RegExp(pattern, "i");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid regular expression";
        throw new RuntimeError(`Scan profile ${profile.id}@${profile.version} uses an invalid duplicateAuthorityClaimPatterns entry: ${message}`, {
          code: "SCAN_PROFILE_INVALID",
          details: {
            profileId: profile.id,
            profileVersion: profile.version,
            field: "duplicateAuthorityClaimPatterns",
            pattern,
          },
        });
      }
    }),
    ignoredTopicTokens: new Set(normalizeRecipeValues(profile, "duplicateAuthorityIgnoredTopicTokens")),
    genericTopicTokens: new Set(normalizeRecipeValues(profile, "duplicateAuthorityGenericTopicTokens")),
  };
}

function createMissingOwnerEvidenceRecipe(profile: ScanProfile): MissingOwnerEvidenceRecipe {
  return {
    materialPaths: new Set(normalizeRecipeValues(profile, "missingOwnerMaterialPaths")),
    materialFileNames: new Set(normalizeRecipeValues(profile, "missingOwnerMaterialFileNames")),
    ignoredPathMarkers: normalizeRecipeValues(profile, "missingOwnerIgnoredPathMarkers"),
    pathKeywords: normalizeRecipeValues(profile, "missingOwnerPathKeywords"),
    textKeywords: normalizeRecipeValues(profile, "missingOwnerTextKeywords"),
  };
}

function createStaleDocumentationEvidenceRecipe(profile: ScanProfile): StaleDocumentationEvidenceRecipe {
  return {
    materialFileNames: new Set(normalizeRecipeValues(profile, "staleDocumentationMaterialFileNames")),
    ignoredPathMarkers: normalizeRecipeValues(profile, "staleDocumentationIgnoredPathMarkers"),
    pathKeywords: normalizeRecipeValues(profile, "staleDocumentationPathKeywords"),
    textKeywords: normalizeRecipeValues(profile, "staleDocumentationTextKeywords"),
    nonCurrentPathMarkers: normalizeRecipeValues(profile, "staleDocumentationNonCurrentPathMarkers"),
    nonCurrentTextMarkers: normalizeRecipeValues(profile, "staleDocumentationNonCurrentTextMarkers"),
  };
}

function normalizeRecipeValues(profile: ScanProfile, field: RecipeStringListField): string[] {
  const value = profile[field];
  if (!Array.isArray(value)) {
    throw new RuntimeError(`Scan profile ${profile.id}@${profile.version} is missing required recipe field ${field}`, {
      code: "SCAN_PROFILE_INVALID",
      details: {
        profileId: profile.id,
        profileVersion: profile.version,
        field,
      },
    });
  }
  return value.map((entry) => entry.toLocaleLowerCase());
}

function isMaterialDuplicateResponsibilityPath(path: string, recipe: DuplicateResponsibilityEvidenceRecipe): boolean {
  return !matchesAnyGlob(normalizeRepositoryPath(path).toLocaleLowerCase(), recipe.ignorePathGlobs);
}

function compareRepositorySymbols(left: RepositorySymbolRecord, right: RepositorySymbolRecord): number {
  const fileDelta = left.filePath.localeCompare(right.filePath);
  if (fileDelta !== 0) {
    return fileDelta;
  }
  const lineDelta = left.startLine - right.startLine;
  if (lineDelta !== 0) {
    return lineDelta;
  }
  return left.qualifiedName.localeCompare(right.qualifiedName);
}

function createDependencyNeighborhoodIndex(
  codePaths: ReadonlySet<string>,
  dependencies: readonly RepositoryDependencyRecord[],
): Map<string, Set<string>> {
  const neighborhoods = new Map<string, Set<string>>();
  for (const dependency of dependencies) {
    const sourcePath = normalizeRepositoryPath(dependency.filePath);
    if (!codePaths.has(sourcePath)) {
      continue;
    }
    const identity = createDependencyTopologyIdentity(dependency);
    if (identity === undefined) {
      continue;
    }
    const existing = neighborhoods.get(sourcePath);
    if (existing === undefined) {
      neighborhoods.set(sourcePath, new Set([identity]));
    } else {
      existing.add(identity);
    }
  }
  return neighborhoods;
}

function createDependencyTopologyIdentity(dependency: RepositoryDependencyRecord): string | undefined {
  if (dependency.targetFilePath !== undefined) {
    return `${dependency.kind}:${normalizeRepositoryPath(dependency.targetFilePath).toLocaleLowerCase()}`;
  }
  if (dependency.kind === "call") {
    return undefined;
  }
  const normalizedTargetText = dependency.targetText.trim().toLocaleLowerCase();
  return normalizedTargetText.length === 0 ? undefined : `${dependency.kind}:${normalizedTargetText}`;
}

function describeDuplicateResponsibilityTopology(
  group: readonly RepositorySymbolRecord[],
  dependencyNeighborhoods: Map<string, Set<string>>,
): {
  sharedDependencyCount: number;
  directDependencyCount: number;
  perFileSharedCounts: Map<string, number>;
} {
  const filePaths = [...new Set(group.map((symbol) => normalizeRepositoryPath(symbol.filePath)))];
  const groupPathSet = new Set(filePaths.map((filePath) => filePath.toLocaleLowerCase()));
  const dependencyOccurrences = new Map<string, Set<string>>();
  const perFileSharedCounts = new Map<string, number>();
  let directDependencyCount = 0;

  for (const filePath of filePaths) {
    const neighborhood = dependencyNeighborhoods.get(filePath) ?? new Set<string>();
    for (const identity of neighborhood) {
      const filesForDependency = dependencyOccurrences.get(identity);
      if (filesForDependency === undefined) {
        dependencyOccurrences.set(identity, new Set([filePath]));
      } else {
        filesForDependency.add(filePath);
      }
      const targetPath = identity.slice(identity.indexOf(":") + 1);
      if (groupPathSet.has(targetPath) && targetPath !== filePath.toLocaleLowerCase()) {
        directDependencyCount += 1;
      }
    }
  }

  let sharedDependencyCount = 0;
  for (const filesForDependency of dependencyOccurrences.values()) {
    if (filesForDependency.size < 2) {
      continue;
    }
    sharedDependencyCount += 1;
    for (const filePath of filesForDependency) {
      perFileSharedCounts.set(filePath, (perFileSharedCounts.get(filePath) ?? 0) + 1);
    }
  }

  return {
    sharedDependencyCount,
    directDependencyCount,
    perFileSharedCounts,
  };
}

function createDuplicateResponsibilityTopologySummary(topology: {
  sharedDependencyCount: number;
  directDependencyCount: number;
}): string | undefined {
  if (topology.sharedDependencyCount > 0) {
    const dependencyLabel = topology.sharedDependencyCount === 1 ? "dependency target" : "dependency targets";
    return `The peer modules share ${topology.sharedDependencyCount} ${dependencyLabel}.`;
  }
  if (topology.directDependencyCount > 0) {
    return "The peer modules depend on one another directly.";
  }
  return undefined;
}

function createDuplicateResponsibilityWhySelected(
  filePath: string,
  topology: {
    sharedDependencyCount: number;
    perFileSharedCounts: Map<string, number>;
  },
): string {
  const normalizedPath = normalizeRepositoryPath(filePath);
  const sharedCount = topology.perFileSharedCounts.get(normalizedPath) ?? 0;
  if (sharedCount > 0) {
    const dependencyLabel = sharedCount === 1 ? "dependency target" : "dependency targets";
    return `Covered code file exposes the same top-level symbol name and shares ${sharedCount} ${dependencyLabel} with peer modules.`;
  }
  return "Covered code file exposes the same top-level symbol name as another module.";
}

function buildBrokenReferenceCandidates(
  files: readonly RepositoryFileRecord[],
  sourceChunks: readonly RepositoryChunkRecord[],
  referenceChunks: readonly RepositoryChunkRecord[],
  limit: number,
): RepositoryEvidenceCandidate[] {
  const existingPaths = new Set(files.map((file) => normalizeRepositoryPath(file.path)));
  const headingsByFile = collectMarkdownHeadingsByFile(referenceChunks);
  const candidates: RepositoryEvidenceCandidate[] = [];

  for (const chunk of sourceChunks) {
    if (chunk.sourceKind !== "documentation") {
      continue;
    }
    const lines = chunk.text.split("\n");
    for (let offset = 0; offset < lines.length; offset += 1) {
      const line = lines[offset] ?? "";
      for (const match of line.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
        const rawTarget = (match[1] ?? "").trim();
        const resolvedReference = resolveRepositoryLinkReference(chunk.filePath, rawTarget);
        if (resolvedReference === undefined) {
          continue;
        }
        const targetExists = existingPaths.has(resolvedReference.targetPath);
        const missingFile = !targetExists;
        const missingHeading =
          targetExists &&
          resolvedReference.fragment !== undefined &&
          !fileContainsHeading(headingsByFile, resolvedReference.targetPath, resolvedReference.fragment);
        if (!missingFile && !missingHeading) {
          continue;
        }
        const summary = missingFile
          ? `Repository-relative link points to a missing target: ${resolvedReference.targetPath}`
          : `Repository-relative link points to a missing heading fragment: ${resolvedReference.targetPath}#${resolvedReference.fragment}`;
        const whySelected = missingFile
          ? `Unresolved repository-relative link target: ${rawTarget}`
          : `Referenced heading fragment was not found: #${resolvedReference.fragment}`;
        candidates.push({
          id: createEvidenceCandidateId("broken-reference", chunk.filePath, String(chunk.startLine + offset), rawTarget),
          criterionId: "broken-references",
          signal: "broken-reference",
          kind: "deterministic",
          title: `Broken repository reference in ${chunk.filePath}`,
          summary,
          sources: [
            {
              kind: "chunk",
              filePath: chunk.filePath,
              language: chunk.language,
              sourceKind: chunk.sourceKind,
              startLine: chunk.startLine + offset,
              endLine: chunk.startLine + offset,
              snippet: line.trim(),
              whySelected,
            },
          ],
        });
        if (candidates.length >= limit) {
          return candidates;
        }
      }
    }
  }

  return candidates;
}

function buildContradictoryClaimCandidates(
  profile: ScanProfile,
  files: readonly RepositoryFileRecord[],
  chunks: readonly RepositoryChunkRecord[],
  limit: number,
): RepositoryEvidenceCandidate[] {
  const recipe = createStaleDocumentationEvidenceRecipe(profile);
  const chunksByFile = new Map<string, RepositoryChunkRecord[]>();
  for (const chunk of chunks) {
    const current = chunksByFile.get(chunk.filePath) ?? [];
    current.push(chunk);
    chunksByFile.set(chunk.filePath, current);
  }
  const contradictionClaims = collectContradictionClaims(
    files.filter((file) => isMaterialContradictionDocument(file, chunksByFile.get(file.path) ?? [], recipe)),
    chunks,
  );
  const candidates: RepositoryEvidenceCandidate[] = [];

  for (let leftIndex = 0; leftIndex < contradictionClaims.length; leftIndex += 1) {
    const left = contradictionClaims[leftIndex];
    if (left === undefined) {
      continue;
    }
    for (let rightIndex = leftIndex + 1; rightIndex < contradictionClaims.length; rightIndex += 1) {
      const right = contradictionClaims[rightIndex];
      if (right === undefined || right.filePath === left.filePath || right.kind !== left.kind) {
        continue;
      }
      const contradictionMatch = matchContradictionClaimPair(left, right);
      if (contradictionMatch?.kind === "status" && left.kind === "status" && right.kind === "status") {
        candidates.push({
          id: createEvidenceCandidateId("contradictory-claims", left.filePath, String(left.line), right.filePath, String(right.line)),
          criterionId: "contradictory-claims",
          signal: "contradictory-claim",
          kind: "requires_interpretation",
          title: "Two documentation sources make opposite status claims",
          summary: `Two sources make opposite ${left.group} claims about ${contradictionMatch.sharedSubjects.join(", ")} within ${contradictionMatch.sharedContext.join(", ")}.`,
          sources: [left.source, right.source],
        });
      } else if (contradictionMatch?.kind === "selection" && left.kind === "selection" && right.kind === "selection") {
        candidates.push({
          id: createEvidenceCandidateId("contradictory-claims", left.filePath, String(left.line), right.filePath, String(right.line)),
          criterionId: "contradictory-claims",
          signal: "contradictory-claim",
          kind: "requires_interpretation",
          title: "Two documentation sources choose different primary/default owners",
          summary: `Two sources assign different ${left.qualifier} selections for the same concern: ${contradictionMatch.sharedContext.join(", ")}.`,
          sources: [left.source, right.source],
        });
      } else {
        continue;
      }
      if (candidates.length >= limit) {
        return candidates;
      }
    }
  }

  return candidates;
}

function buildStaleDocumentationCandidates(
  profile: ScanProfile,
  files: readonly RepositoryFileRecord[],
  chunks: readonly RepositoryChunkRecord[],
  limit: number,
): RepositoryEvidenceCandidate[] {
  const recipe = createStaleDocumentationEvidenceRecipe(profile);
  const chunksByFile = new Map<string, RepositoryChunkRecord[]>();
  for (const chunk of chunks) {
    const current = chunksByFile.get(chunk.filePath) ?? [];
    current.push(chunk);
    chunksByFile.set(chunk.filePath, current);
  }
  const materialFiles = files.filter((file) => isMaterialContradictionDocument(file, chunksByFile.get(file.path) ?? [], recipe));
  const fileByPath = new Map(materialFiles.map((file) => [file.path, file] as const));
  const contradictionClaims = collectContradictionClaims(materialFiles, chunks);
  const candidates: RepositoryEvidenceCandidate[] = [];
  const emittedCandidateIds = new Set<string>();

  for (let leftIndex = 0; leftIndex < contradictionClaims.length; leftIndex += 1) {
    const left = contradictionClaims[leftIndex];
    if (left === undefined) {
      continue;
    }
    for (let rightIndex = leftIndex + 1; rightIndex < contradictionClaims.length; rightIndex += 1) {
      const right = contradictionClaims[rightIndex];
      if (right === undefined || right.filePath === left.filePath || right.kind !== left.kind) {
        continue;
      }
      const contradictionMatch = matchContradictionClaimPair(left, right);
      if (contradictionMatch === undefined) {
        continue;
      }
      const stalePair = selectStaleDocumentationPair(profile, left.filePath, right.filePath);
      if (stalePair === undefined) {
        continue;
      }
      const staleFile = fileByPath.get(stalePair.staleFilePath);
      const authoritativeFile = fileByPath.get(stalePair.authoritativeFilePath);
      const staleChunks = chunksByFile.get(stalePair.staleFilePath) ?? [];
      const authoritativeChunks = chunksByFile.get(stalePair.authoritativeFilePath) ?? [];
      if (
        staleFile === undefined ||
        authoritativeFile === undefined ||
        !isCurrentLookingDocumentationSource(staleFile, staleChunks, recipe) ||
        !isCurrentLookingDocumentationSource(authoritativeFile, authoritativeChunks, recipe)
      ) {
        continue;
      }
      const staleClaim = left.filePath === stalePair.staleFilePath ? left : right;
      const authoritativeClaim = left.filePath === stalePair.authoritativeFilePath ? left : right;
      const candidateId = createEvidenceCandidateId("stale-documentation", stalePair.staleFilePath, stalePair.authoritativeFilePath, String(staleClaim.line));
      if (emittedCandidateIds.has(candidateId)) {
        continue;
      }
      emittedCandidateIds.add(candidateId);
      candidates.push({
        id: candidateId,
        criterionId: "stale-documentation",
        signal: "stale-documentation",
        kind: "requires_interpretation",
        title: `Lower-precedence documentation may be stale in ${stalePair.staleFilePath}`,
        summary: createStaleDocumentationSummary(contradictionMatch, stalePair.staleFilePath, stalePair.authoritativeFilePath),
        sources: [staleClaim.source, authoritativeClaim.source],
      });
      if (candidates.length >= limit) {
        return candidates;
      }
    }
  }

  return candidates;
}

function matchContradictionClaimPair(
  left:
    | {
        kind: "status";
        filePath: string;
        line: number;
        group: string;
        polarity: "positive" | "negative";
        subjectTokens: string[];
        contextTokens: string[];
        source: RepositoryEvidenceSource;
      }
    | {
        kind: "selection";
        filePath: string;
        line: number;
        qualifier: "primary" | "default" | "canonical";
        subjectTokens: string[];
        contextTokens: string[];
        source: RepositoryEvidenceSource;
      },
  right:
    | {
        kind: "status";
        filePath: string;
        line: number;
        group: string;
        polarity: "positive" | "negative";
        subjectTokens: string[];
        contextTokens: string[];
        source: RepositoryEvidenceSource;
      }
    | {
        kind: "selection";
        filePath: string;
        line: number;
        qualifier: "primary" | "default" | "canonical";
        subjectTokens: string[];
        contextTokens: string[];
        source: RepositoryEvidenceSource;
      },
):
  | { kind: "status"; sharedSubjects: string[]; sharedContext: string[] }
  | { kind: "selection"; sharedContext: string[] }
  | undefined {
  if (left.kind === "status" && right.kind === "status") {
    if (left.group !== right.group || left.polarity === right.polarity) {
      return undefined;
    }
    const sharedSubjects = intersectNormalizedTokens(left.subjectTokens, right.subjectTokens);
    const sharedContext = intersectNormalizedTokens(left.contextTokens, right.contextTokens);
    if (sharedSubjects.length === 0 || sharedContext.length === 0) {
      return undefined;
    }
    return { kind: "status", sharedSubjects, sharedContext };
  }
  if (left.kind === "selection" && right.kind === "selection") {
    if (left.qualifier !== right.qualifier) {
      return undefined;
    }
    const sharedContext = intersectNormalizedTokens(left.contextTokens, right.contextTokens);
    if (sharedContext.length < 2 || haveSameNormalizedTokens(left.subjectTokens, right.subjectTokens)) {
      return undefined;
    }
    return { kind: "selection", sharedContext };
  }
  return undefined;
}

function selectStaleDocumentationPair(
  profile: ScanProfile,
  leftFilePath: string,
  rightFilePath: string,
): { staleFilePath: string; authoritativeFilePath: string } | undefined {
  const leftPrecedence = scoreSsotPrecedence(leftFilePath, profile.ssotOrder);
  const rightPrecedence = scoreSsotPrecedence(rightFilePath, profile.ssotOrder);
  if (leftPrecedence === rightPrecedence) {
    return undefined;
  }
  if (leftPrecedence < rightPrecedence) {
    return { staleFilePath: rightFilePath, authoritativeFilePath: leftFilePath };
  }
  return { staleFilePath: leftFilePath, authoritativeFilePath: rightFilePath };
}

function scoreSsotPrecedence(filePath: string, ssotOrder: readonly string[]): number {
  for (let index = 0; index < ssotOrder.length; index += 1) {
    const pattern = ssotOrder[index];
    if (pattern === undefined || pattern === "implementation") {
      continue;
    }
    if (matchesGlob(normalizeRepositoryPath(filePath), normalizeRepositoryPath(pattern))) {
      return index;
    }
  }
  return ssotOrder.length + 1;
}

function createStaleDocumentationSummary(
  contradictionMatch: { kind: "status"; sharedSubjects: string[]; sharedContext: string[] } | { kind: "selection"; sharedContext: string[] },
  staleFilePath: string,
  authoritativeFilePath: string,
): string {
  if (contradictionMatch.kind === "status") {
    return `${staleFilePath} makes a lower-precedence status claim about ${contradictionMatch.sharedSubjects.join(", ")} that conflicts with stronger SSOT in ${authoritativeFilePath}.`;
  }
  return `${staleFilePath} makes a lower-precedence primary/default/canonical selection that conflicts with stronger SSOT in ${authoritativeFilePath} for ${contradictionMatch.sharedContext.join(", ")}.`;
}

function buildDuplicateAuthorityCandidates(
  profile: ScanProfile,
  chunks: readonly RepositoryChunkRecord[],
  limit: number,
): RepositoryEvidenceCandidate[] {
  const recipe = createDuplicateAuthorityEvidenceRecipe(profile);
  const authorityClaims = collectAuthorityClaims(chunks, recipe);
  const candidates: RepositoryEvidenceCandidate[] = [];

  for (let leftIndex = 0; leftIndex < authorityClaims.length; leftIndex += 1) {
    const left = authorityClaims[leftIndex];
    if (left === undefined) {
      continue;
    }
    for (let rightIndex = leftIndex + 1; rightIndex < authorityClaims.length; rightIndex += 1) {
      const right = authorityClaims[rightIndex];
      if (right === undefined || right.filePath === left.filePath) {
        continue;
      }
      const sharedTokens = selectAuthoritySharedTokens(left.topicTokens, right.topicTokens, recipe);
      if (sharedTokens.length === 0) {
        continue;
      }
      candidates.push({
        id: createEvidenceCandidateId("duplicate-authority", left.filePath, String(left.line), right.filePath, String(right.line)),
        criterionId: "duplicate-authority",
        signal: "authority-claim",
        kind: "requires_interpretation",
        title: "Multiple documentation sources make authority-style claims",
        summary: `Two documentation sources contain authority-style language about the same concern: ${sharedTokens.join(", ")}.`,
        sources: [left.source, right.source],
      });
      if (candidates.length >= limit) {
        return candidates;
      }
    }
  }

  return candidates;
}

function buildMissingOwnerCandidates(
  profile: ScanProfile,
  files: readonly RepositoryFileRecord[],
  chunks: readonly RepositoryChunkRecord[],
  limit: number,
): RepositoryEvidenceCandidate[] {
  const recipe = createMissingOwnerEvidenceRecipe(profile);
  const documentationFiles = files.filter((file) => file.sourceKind === "documentation");
  const authorityFilePaths = collectOwnershipMarkerFilePaths(chunks);
  const chunksByFile = new Map<string, RepositoryChunkRecord[]>();
  for (const chunk of chunks) {
    const current = chunksByFile.get(chunk.filePath) ?? [];
    current.push(chunk);
    chunksByFile.set(chunk.filePath, current);
  }

  const candidates: RepositoryEvidenceCandidate[] = [];
  for (const file of documentationFiles) {
    if (authorityFilePaths.has(file.path)) {
      continue;
    }
    if (!isMaterialOwnershipDocument(file, chunksByFile.get(file.path) ?? [], recipe)) {
      continue;
    }
    const firstChunk = (chunksByFile.get(file.path) ?? [])[0];
    const source =
      firstChunk === undefined
        ? createFileEvidenceSource(file)
        : createChunkEvidenceSource(
            firstChunk,
            summarizeChunkSnippet(firstChunk.text),
            "No explicit owner or authority markers were detected in a material documentation source.",
          );
    candidates.push({
      id: createEvidenceCandidateId("missing-owner", file.path),
      criterionId: "missing-owner",
      signal: "missing-owner",
      kind: "requires_interpretation",
      title: `No explicit owner markers detected in ${file.path}`,
      summary:
        "This documentation source does not contain simple owner, authority, or source-of-truth markers. An agent should verify whether ownership is intentionally omitted or missing.",
      sources: [source],
    });
    if (candidates.length >= limit) {
      return candidates;
    }
  }

  return candidates;
}

function collectOwnershipMarkerFilePaths(chunks: readonly RepositoryChunkRecord[]): Set<string> {
  const filePaths = new Set<string>();
  for (const chunk of chunks) {
    if (chunk.sourceKind !== "documentation") {
      continue;
    }
    for (const line of chunk.text.split("\n")) {
      if (matchOwnershipMarkerPhrase(line) !== undefined) {
        filePaths.add(chunk.filePath);
        break;
      }
    }
  }
  return filePaths;
}

function collectAuthorityClaims(chunks: readonly RepositoryChunkRecord[], recipe: DuplicateAuthorityEvidenceRecipe): Array<{
  filePath: string;
  line: number;
  source: RepositoryEvidenceSource;
  topicTokens: string[];
}> {
  const claims: Array<{ filePath: string; line: number; source: RepositoryEvidenceSource; topicTokens: string[] }> = [];
  for (const chunk of chunks) {
    if (chunk.sourceKind !== "documentation") {
      continue;
    }
    const lines = chunk.text.split("\n");
    let currentHeading: string | undefined;
    for (let offset = 0; offset < lines.length; offset += 1) {
      const line = lines[offset] ?? "";
      const heading = parseMarkdownHeading(line);
      if (heading !== undefined) {
        currentHeading = heading;
      }
      const phrase = matchAuthorityPhrase(line, recipe);
      if (phrase === undefined) {
        continue;
      }
      claims.push({
        filePath: chunk.filePath,
        line: chunk.startLine + offset,
        topicTokens: extractAuthorityTopicTokens(line, currentHeading, recipe),
        source: createChunkEvidenceSource(
          chunk,
          line.trim(),
          `Authority-style phrase detected: ${phrase}`,
          chunk.startLine + offset,
          chunk.startLine + offset,
        ),
      });
    }
  }
  return claims;
}

function collectContradictionClaims(
  files: readonly RepositoryFileRecord[],
  chunks: readonly RepositoryChunkRecord[],
): Array<
  | {
      kind: "status";
      filePath: string;
      line: number;
      group: string;
      polarity: "positive" | "negative";
      subjectTokens: string[];
      contextTokens: string[];
      source: RepositoryEvidenceSource;
    }
  | {
      kind: "selection";
      filePath: string;
      line: number;
      qualifier: "primary" | "default" | "canonical";
      subjectTokens: string[];
      contextTokens: string[];
      source: RepositoryEvidenceSource;
    }
> {
  const includedFilePaths = new Set(files.map((file) => file.path));
  const claims: Array<
    | {
        kind: "status";
        filePath: string;
        line: number;
        group: string;
        polarity: "positive" | "negative";
        subjectTokens: string[];
        contextTokens: string[];
        source: RepositoryEvidenceSource;
      }
    | {
        kind: "selection";
        filePath: string;
        line: number;
        qualifier: "primary" | "default" | "canonical";
        subjectTokens: string[];
        contextTokens: string[];
        source: RepositoryEvidenceSource;
      }
  > = [];
  for (const chunk of chunks) {
    if (chunk.sourceKind !== "documentation" || !includedFilePaths.has(chunk.filePath)) {
      continue;
    }
    const lines = chunk.text.split("\n");
    let currentHeading: string | undefined;
    for (let offset = 0; offset < lines.length; offset += 1) {
      const line = lines[offset] ?? "";
      const heading = parseMarkdownHeading(line);
      if (heading !== undefined) {
        currentHeading = heading;
      }
      const lineNumber = chunk.startLine + offset;
      const statusClaim = matchContradictoryStatusClaim(chunk, line, lineNumber, currentHeading);
      if (statusClaim !== undefined) {
        claims.push(statusClaim);
      }
      const selectionClaim = matchExclusiveSelectionClaim(chunk, line, lineNumber, currentHeading);
      if (selectionClaim !== undefined) {
        claims.push(selectionClaim);
      }
    }
  }
  return claims;
}

function matchContradictoryStatusClaim(
  chunk: RepositoryChunkRecord,
  line: string,
  lineNumber: number,
  currentHeading?: string,
):
  | {
      kind: "status";
      filePath: string;
      line: number;
      group: string;
      polarity: "positive" | "negative";
      subjectTokens: string[];
      contextTokens: string[];
      source: RepositoryEvidenceSource;
    }
  | undefined {
  for (const pattern of CONTRADICTION_STATUS_PATTERNS) {
    const match = line.match(pattern.pattern);
    if (match === null) {
      continue;
    }
    const subject = match.groups?.subject?.trim() ?? "";
    const context = `${currentHeading ?? ""} ${match.groups?.context?.trim() ?? ""}`.trim();
    const subjectTokens = normalizeClaimTokens(subject);
    const contextTokens = normalizeClaimTokens(context);
    if (subjectTokens.length === 0 || contextTokens.length === 0) {
      continue;
    }
    return {
      kind: "status",
      filePath: chunk.filePath,
      line: lineNumber,
      group: pattern.group,
      polarity: pattern.polarity,
      subjectTokens,
      contextTokens,
      source: createChunkEvidenceSource(
        chunk,
        line.trim(),
        `${capitalize(pattern.polarity)} ${pattern.group} phrase detected for ${subject}.`,
        lineNumber,
        lineNumber,
      ),
    };
  }
  return undefined;
}

function matchExclusiveSelectionClaim(
  chunk: RepositoryChunkRecord,
  line: string,
  lineNumber: number,
  currentHeading?: string,
):
  | {
      kind: "selection";
      filePath: string;
      line: number;
      qualifier: "primary" | "default" | "canonical";
      subjectTokens: string[];
      contextTokens: string[];
      source: RepositoryEvidenceSource;
    }
  | undefined {
  const match = line.match(
    /^(?<subject>.+?)\s+(?:is|are|remains)\s+(?:the\s+)?(?<qualifier>primary|default|canonical)\s+(?<context>.+)$/i,
  );
  if (match === null) {
    return undefined;
  }
  const qualifier = match.groups?.qualifier?.toLocaleLowerCase();
  if (qualifier !== "primary" && qualifier !== "default" && qualifier !== "canonical") {
    return undefined;
  }
  const subjectTokens = normalizeClaimTokens(match.groups?.subject ?? "");
  const contextTokens = normalizeClaimTokens(`${currentHeading ?? ""} ${match.groups?.context ?? ""}`);
  if (subjectTokens.length === 0 || contextTokens.length < 2) {
    return undefined;
  }
  return {
    kind: "selection",
    filePath: chunk.filePath,
    line: lineNumber,
    qualifier,
    subjectTokens,
    contextTokens,
    source: createChunkEvidenceSource(
      chunk,
      line.trim(),
      `${capitalize(qualifier)} selection phrase detected for ${subjectTokens.join(", ")}.`,
      lineNumber,
      lineNumber,
    ),
  };
}

function matchAuthorityPhrase(value: string, recipe: DuplicateAuthorityEvidenceRecipe): string | undefined {
  for (const pattern of recipe.claimPatterns) {
    const match = value.match(pattern);
    if (match !== null) {
      return match[1] ?? match[0];
    }
  }
  return undefined;
}

function matchOwnershipMarkerPhrase(value: string): string | undefined {
  const match = value.match(/\b(single source of truth|source of truth|canonical|authoritative|owned by|ownership|owner)\b/i);
  return match?.[1];
}

function resolveRepositoryLinkReference(
  sourceFilePath: string,
  rawTarget: string,
): { targetPath: string; fragment?: string } | undefined {
  if (rawTarget.length === 0 || /^[a-z][a-z0-9+.-]*:/i.test(rawTarget)) {
    return undefined;
  }
  const hashIndex = rawTarget.indexOf("#");
  const fragmentPart = hashIndex >= 0 ? rawTarget.slice(hashIndex + 1).trim() : undefined;
  const targetPart = hashIndex >= 0 ? rawTarget.slice(0, hashIndex) : rawTarget;
  const [targetWithoutQuery] = targetPart.split("?", 1);
  const trimmedTarget = targetWithoutQuery?.trim() ?? "";
  const targetPath =
    trimmedTarget.length === 0 ? sourceFilePath : resolveRepositoryLinkTargetPath(sourceFilePath, trimmedTarget);
  if (targetPath === undefined) {
    return undefined;
  }
  return {
    targetPath,
    ...(fragmentPart === undefined || fragmentPart.length === 0 ? {} : { fragment: normalizeMarkdownHeadingSlug(fragmentPart) }),
  };
}

function resolveRepositoryLinkTargetPath(sourceFilePath: string, rawTargetPath: string): string | undefined {
  const normalized =
    rawTargetPath.startsWith("/")
      ? pathPosix.normalize(rawTargetPath.slice(1))
      : pathPosix.normalize(pathPosix.join(pathPosix.dirname(sourceFilePath), rawTargetPath));
  if (normalized.length === 0 || normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    return undefined;
  }
  return normalizeRepositoryPath(normalized);
}

function collectMarkdownHeadingsByFile(chunks: readonly RepositoryChunkRecord[]): Map<string, Set<string>> {
  const headingsByFile = new Map<string, Set<string>>();
  for (const chunk of chunks) {
    if (chunk.sourceKind !== "documentation") {
      continue;
    }
    const headings = headingsByFile.get(chunk.filePath) ?? new Set<string>();
    for (const line of chunk.text.split("\n")) {
      const heading = parseMarkdownHeading(line);
      if (heading !== undefined) {
        headings.add(normalizeMarkdownHeadingSlug(heading));
      }
    }
    headingsByFile.set(chunk.filePath, headings);
  }
  return headingsByFile;
}

function fileContainsHeading(headingsByFile: ReadonlyMap<string, Set<string>>, filePath: string, fragment: string): boolean {
  return headingsByFile.get(filePath)?.has(normalizeMarkdownHeadingSlug(fragment)) ?? false;
}

function parseMarkdownHeading(line: string): string | undefined {
  const match = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
  return match?.[1]?.trim() || undefined;
}

function normalizeMarkdownHeadingSlug(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[`*_~]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function extractAuthorityTopicTokens(line: string, heading: string | undefined, recipe: DuplicateAuthorityEvidenceRecipe): string[] {
  return normalizeTopicTokens([heading ?? "", line].join(" "), recipe.ignoredTopicTokens);
}

function selectAuthoritySharedTokens(
  left: readonly string[],
  right: readonly string[],
  recipe: DuplicateAuthorityEvidenceRecipe,
): string[] {
  const sharedTokens = intersectNormalizedTokens(left, right);
  const materialSharedTokens = sharedTokens.filter((token) => !recipe.genericTopicTokens.has(token));
  if (materialSharedTokens.length === 0) {
    return [];
  }
  if (materialSharedTokens.length === 1 && sharedTokens.length < 2) {
    return [];
  }
  return materialSharedTokens;
}

function normalizeTopicTokens(value: string, ignoredTopicTokens: ReadonlySet<string>): string[] {
  const tokens = value
    .toLocaleLowerCase()
    .split(/[^a-z0-9]+/i)
    .map((token) => normalizeTopicToken(token))
    .filter((token) => token.length > 1 && !ignoredTopicTokens.has(token));
  return [...new Set(tokens)];
}

function normalizeClaimTokens(value: string): string[] {
  return normalizeTopicTokens(value, IGNORED_TOPIC_TOKENS).filter((token) => !IGNORED_CLAIM_TOKENS.has(token));
}

function normalizeTopicToken(value: string): string {
  if (/^owner(?:ship)?$/.test(value) || /^owned$/.test(value) || /^owning$/.test(value)) {
    return "owner";
  }
  if (/^docs?$/.test(value) || /^document(?:ation)?$/.test(value)) {
    return "doc";
  }
  if (/^workflows?$/.test(value)) {
    return "workflow";
  }
  if (/^architect(?:ure|ural)?$/.test(value)) {
    return "architecture";
  }
  if (/^guides?$/.test(value) || /^guidance$/.test(value)) {
    return "guide";
  }
  return value;
}

function intersectNormalizedTokens(left: readonly string[], right: readonly string[]): string[] {
  const rightTokens = new Set(right);
  return left.filter((token) => rightTokens.has(token));
}

function haveSameNormalizedTokens(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const rightTokens = new Set(right);
  return left.every((token) => rightTokens.has(token));
}

function capitalize(value: string): string {
  return value.length === 0 ? value : `${value[0]?.toLocaleUpperCase() ?? ""}${value.slice(1)}`;
}

function isMaterialOwnershipDocument(
  file: RepositoryFileRecord,
  chunks: readonly RepositoryChunkRecord[],
  recipe: MissingOwnerEvidenceRecipe,
): boolean {
  const normalizedPath = normalizeRepositoryPath(file.path).toLocaleLowerCase();
  const baseName = pathPosix.basename(normalizedPath);
  const fullText = chunks.map((chunk) => chunk.text).join("\n").toLocaleLowerCase();
  if (recipe.ignoredPathMarkers.some((marker) => normalizedPath.includes(marker) || baseName.includes(marker))) {
    return false;
  }
  if (recipe.materialPaths.has(normalizedPath) || recipe.materialFileNames.has(baseName)) {
    return true;
  }
  if (recipe.pathKeywords.some((keyword) => normalizedPath.includes(keyword) || baseName.includes(keyword))) {
    return true;
  }
  return recipe.textKeywords.some((keyword) => fullText.includes(keyword));
}

function isMaterialContradictionDocument(
  file: RepositoryFileRecord,
  chunks: readonly RepositoryChunkRecord[],
  recipe: StaleDocumentationEvidenceRecipe,
): boolean {
  const normalizedPath = normalizeRepositoryPath(file.path).toLocaleLowerCase();
  const baseName = pathPosix.basename(normalizedPath);
  const fullText = chunks.map((chunk) => chunk.text).join("\n").toLocaleLowerCase();
  if (recipe.ignoredPathMarkers.some((marker) => normalizedPath.includes(marker) || baseName.includes(marker))) {
    return false;
  }
  if (recipe.materialFileNames.has(baseName)) {
    return true;
  }
  if (recipe.pathKeywords.some((keyword) => normalizedPath.includes(keyword) || baseName.includes(keyword))) {
    return true;
  }
  return recipe.textKeywords.some((keyword) => fullText.includes(keyword));
}

function isCurrentLookingDocumentationSource(
  file: RepositoryFileRecord,
  chunks: readonly RepositoryChunkRecord[],
  recipe: StaleDocumentationEvidenceRecipe,
): boolean {
  const normalizedPath = normalizeRepositoryPath(file.path).toLocaleLowerCase();
  const fullText = chunks.map((chunk) => chunk.text).join("\n").toLocaleLowerCase();
  if (recipe.nonCurrentPathMarkers.some((marker) => normalizedPath.includes(marker))) {
    return false;
  }
  if (recipe.nonCurrentTextMarkers.some((marker) => fullText.includes(marker))) {
    return false;
  }
  return true;
}

function summarizeChunkSnippet(value: string): string {
  return value.split("\n").map((line) => line.trim()).filter((line) => line.length > 0).slice(0, 2).join(" ");
}

const IGNORED_TOPIC_TOKENS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "authoritative",
  "be",
  "by",
  "canonical",
  "doc",
  "file",
  "for",
  "here",
  "is",
  "it",
  "lives",
  "of",
  "on",
  "page",
  "source",
  "the",
  "this",
  "truth",
]);
const IGNORED_CLAIM_TOKENS = new Set([
  "available",
  "canonical",
  "current",
  "default",
  "deprecated",
  "implemented",
  "not",
  "part",
  "primary",
  "removed",
  "remains",
  "supported",
  "target",
  "unavailable",
]);

const CONTRADICTION_STATUS_PATTERNS = [
  {
    group: "support",
    polarity: "negative" as const,
    pattern: /^(?<subject>.+?)\s+(?:is|are|remains)\s+not\s+supported\b(?<context>.*)$/i,
  },
  {
    group: "support",
    polarity: "negative" as const,
    pattern: /^(?<subject>.+?)\s+is\s+no\s+longer\s+supported\b(?<context>.*)$/i,
  },
  {
    group: "support",
    polarity: "positive" as const,
    pattern: /^(?<subject>.+?)\s+(?:is|are|remains)\s+supported\b(?<context>.*)$/i,
  },
  {
    group: "membership",
    polarity: "negative" as const,
    pattern: /^(?<subject>.+?)\s+(?:is|are|remains)\s+not\s+part\s+of\b(?<context>.*)$/i,
  },
  {
    group: "membership",
    polarity: "positive" as const,
    pattern: /^(?<subject>.+?)\s+(?:is|are|remains)\s+part\s+of\b(?<context>.*)$/i,
  },
  {
    group: "availability",
    polarity: "negative" as const,
    pattern: /^(?<subject>.+?)\s+(?:is|are|remains)\s+not\s+available\b(?<context>.*)$/i,
  },
  {
    group: "availability",
    polarity: "negative" as const,
    pattern: /^(?<subject>.+?)\s+(?:is|are|remains)\s+unavailable\b(?<context>.*)$/i,
  },
  {
    group: "availability",
    polarity: "positive" as const,
    pattern: /^(?<subject>.+?)\s+(?:is|are|remains)\s+available\b(?<context>.*)$/i,
  },
];

function createFileEvidenceSource(file: RepositoryFileRecord): RepositoryEvidenceSource {
  return {
    kind: "file",
    filePath: file.path,
    language: file.language,
    sourceKind: file.sourceKind,
    snippet: file.path,
    whySelected: "Documentation file was included in repository coverage.",
  };
}

function createChunkEvidenceSource(
  chunk: RepositoryChunkRecord,
  snippet: string,
  whySelected: string,
  startLine = chunk.startLine,
  endLine = chunk.endLine,
): RepositoryEvidenceSource {
  return {
    kind: "chunk",
    filePath: chunk.filePath,
    language: chunk.language,
    sourceKind: chunk.sourceKind,
    startLine,
    endLine,
    snippet,
    whySelected,
  };
}

function createEvidenceCandidateId(...parts: string[]): string {
  return createHash("sha256").update(parts.join("::")).digest("hex").slice(0, 24);
}
