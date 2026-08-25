import { posix as pathPosix } from "node:path";

import type { ProjectSourceRef } from "@hivemap/graph-core";
import type {
  BoundaryKind,
  BoundaryMapBuildConfig,
  BoundaryMapArtifact,
  BoundaryMapBoundary,
  BoundaryMapEntrypoint,
  BoundaryMapRelation,
  BoundaryRelationKind,
  FindingConfidence,
  ScanCoverage,
} from "@hivemap/scans";
import type {
  RepositoryDependencyRecord,
  RepositoryFileRecord,
  RepositorySymbolRecord,
} from "@hivemap/storage";

type BoundarySeed = {
  id: string;
  label: string;
  kind: BoundaryKind;
  rootPath: string;
};

type MutableBoundary = {
  id: string;
  label: string;
  kind: BoundaryKind;
  rootPath: string;
  ownedPaths: Set<string>;
  ownedSymbolKeys: Set<string>;
  publicEntrypoints: Map<string, BoundaryMapEntrypoint>;
  contractSourceRefs: Map<string, ProjectSourceRef>;
  testSourceRefs: Map<string, ProjectSourceRef>;
  openQuestions: Set<string>;
  notes?: string;
};

type MutableRelation = {
  id: string;
  fromBoundaryId: string;
  toBoundaryId: string;
  kind: BoundaryRelationKind;
  sourceRefs: Map<string, ProjectSourceRef>;
  notes?: string;
};

export function buildBoundaryMapArtifact(options: {
  coverage: ScanCoverage;
  files: readonly RepositoryFileRecord[];
  symbols: readonly RepositorySymbolRecord[];
  dependencies: readonly RepositoryDependencyRecord[];
  revision: string;
  config: BoundaryMapBuildConfig;
}): BoundaryMapArtifact {
  const includedPaths = new Set(options.coverage.included.map(normalizeRepositoryPath));
  const includedFiles = options.files.filter((file) => includedPaths.has(normalizeRepositoryPath(file.path)));
  const includedSymbols = options.symbols.filter((symbol) => includedPaths.has(normalizeRepositoryPath(symbol.filePath)));
  const includedDependencies = options.dependencies.filter((dependency) => includedPaths.has(normalizeRepositoryPath(dependency.filePath)));

  const seedFiles = includedFiles.filter((file) => file.sourceKind !== "documentation" && file.sourceKind !== "generated" && file.sourceKind !== "vendor");
  if (seedFiles.length === 0) {
    throw new Error("Boundary map build requires at least one included non-documentation repository file");
  }

  const boundaries = new Map<string, MutableBoundary>();
  for (const file of seedFiles) {
    const seed = createBoundarySeed(file.path, file.sourceKind, options.config);
    const current = boundaries.get(seed.id);
    if (current === undefined) {
      boundaries.set(seed.id, {
        ...seed,
        ownedPaths: new Set<string>(),
        ownedSymbolKeys: new Set<string>(),
        publicEntrypoints: new Map<string, BoundaryMapEntrypoint>(),
        contractSourceRefs: new Map<string, ProjectSourceRef>(),
        testSourceRefs: new Map<string, ProjectSourceRef>(),
        openQuestions: new Set<string>(),
      });
    }
    boundaries.get(seed.id)?.ownedPaths.add(normalizeRepositoryPath(file.path));
  }

  const fileByPath = new Map(includedFiles.map((file) => [normalizeRepositoryPath(file.path), file] as const));
  const boundaryIdByPath = new Map<string, string>();
  for (const [boundaryId, boundary] of boundaries) {
    for (const ownedPath of boundary.ownedPaths) {
      boundaryIdByPath.set(ownedPath, boundaryId);
    }
  }

  for (const symbol of includedSymbols) {
    const boundary = findBoundaryForPath(boundaries, normalizeRepositoryPath(symbol.filePath));
    if (boundary === undefined) {
      continue;
    }
    boundary.ownedSymbolKeys.add(symbol.key);
    if (symbol.parentSymbolKey !== undefined || (!symbol.isExported && !symbol.isPublic)) {
      continue;
    }
    const entrypoint = createBoundaryEntrypoint(symbol, boundary.kind, options.revision, options.config);
    boundary.publicEntrypoints.set(entrypoint.id, entrypoint);
  }

  attachToolFileEntrypoints(boundaries, includedFiles, options.revision);

  const relationMap = new Map<string, MutableRelation>();
  const targetBoundaryIdsByTestFile = new Map<string, Set<string>>();
  for (const dependency of includedDependencies) {
    const sourcePath = normalizeRepositoryPath(dependency.filePath);
    const sourceFile = fileByPath.get(sourcePath);
    const sourceBoundary = findBoundaryForPath(boundaries, sourcePath);
    if (sourceBoundary === undefined) {
      continue;
    }

    const targetBoundary = findTargetBoundary(boundaries, boundaryIdByPath, includedSymbols, dependency);
    if (targetBoundary === undefined || targetBoundary.id === sourceBoundary.id) {
      continue;
    }

    const relationKind: BoundaryRelationKind =
      isBoundaryTestFile(sourceFile, options.config) ? "verifies" : dependency.kind === "implements" ? "implements" : "depends-on";
    const relationId = `${sourceBoundary.id}:${relationKind}:${targetBoundary.id}`;
    const relation = getOrCreateRelation(relationMap, relationId, sourceBoundary.id, targetBoundary.id, relationKind);
    relation.sourceRefs.set(
      createSourceRefKey(sourcePath, dependency.startLine, relationKind),
      createSourceRef({
        role: relationKind === "verifies" ? "verifies" : relationKind === "implements" ? "implements" : "depends-on",
        source: isBoundaryTestFile(sourceFile, options.config) ? "test" : "code",
        target: sourcePath,
        line: dependency.startLine,
        revision: options.revision,
        label: `${dependency.kind} ${dependency.targetText}`,
      }),
    );

    if (isBoundaryTestFile(sourceFile, options.config)) {
      const existing = targetBoundaryIdsByTestFile.get(sourcePath);
      if (existing === undefined) {
        targetBoundaryIdsByTestFile.set(sourcePath, new Set([targetBoundary.id]));
      } else {
        existing.add(targetBoundary.id);
      }
    }
  }

  attachDocumentationRefs(boundaries, includedFiles, options.revision, options.config);
  attachTestRefs(boundaries, includedFiles, targetBoundaryIdsByTestFile, options.revision, options.config);
  finalizeBoundaryNotes(boundaries, relationMap);

  return {
    boundaries: [...boundaries.values()]
      .map((boundary) => toBoundaryArtifact(boundary, options.config))
      .sort((left, right) => left.id.localeCompare(right.id)),
    relations: [...relationMap.values()]
      .map((relation) => ({
        id: relation.id,
        fromBoundaryId: relation.fromBoundaryId,
        toBoundaryId: relation.toBoundaryId,
        kind: relation.kind,
        sourceRefs: sortSourceRefs(relation.sourceRefs),
        ...(relation.notes === undefined ? {} : { notes: relation.notes }),
      }))
      .sort(compareBoundaryRelations),
  };
}

function createBoundarySeed(path: string, sourceKind: string, config: BoundaryMapBuildConfig): BoundarySeed {
  const normalizedPath = normalizeRepositoryPath(path);
  const segments = normalizedPath.split("/").filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    throw new Error(`Cannot derive boundary from empty path: ${path}`);
  }

  if (isBoundaryTestPath(normalizedPath, sourceKind, config)) {
    return createTestBoundarySeed(segments, config);
  }

  const first = segments[0]!.toLowerCase();
  const scopedRule = findScopedBoundaryRule(normalizedPath, config);
  if (scopedRule !== undefined) {
    const rootPath =
      scopedRule.pathPrefix.includes("/")
        ? scopedRule.pathPrefix
        : segments.length >= 2 && !segments[1]!.includes(".")
        ? `${segments[0]}/${segments[1]}`
        : scopedRule.pathPrefix;
    return {
      id: `${scopedRule.kind}:${normalizeIdentifier(rootPath)}`,
      label: createBoundaryLabel(rootPath),
      kind: scopedRule.kind,
      rootPath,
    };
  }

  throw new Error(
    `No boundary-map root rule matched path: ${normalizedPath}. Add or replace boundaryMapRoots in the repository scan-profile overlay.`,
  );
}

function createTestBoundarySeed(segments: readonly string[], config: BoundaryMapBuildConfig): BoundarySeed {
  const markerIndex = segments.findIndex((segment) => isTestDirectoryName(segment, config));
  if (markerIndex < 0) {
    throw new Error(
      `No boundary-map test directory marker matched path: ${segments.join("/")}. Add or replace boundaryMapTestDirectoryNames in the repository scan-profile overlay.`,
    );
  }
  const rootSegments = segments.slice(0, markerIndex + 1);
  const rootPath = rootSegments.join("/");
  return {
    id: `test-suite:${normalizeIdentifier(rootPath)}`,
    label: createBoundaryLabel(rootPath),
    kind: "test-suite",
    rootPath,
  };
}

function findScopedBoundaryRule(path: string, config: BoundaryMapBuildConfig): BoundaryMapBuildConfig["roots"][number] | undefined {
  return [...config.roots]
    .sort((left, right) => right.pathPrefix.length - left.pathPrefix.length)
    .find((rule) => path === rule.pathPrefix || path.startsWith(`${rule.pathPrefix}/`));
}

function isTestDirectoryName(value: string, config: BoundaryMapBuildConfig): boolean {
  return new Set(config.testDirectoryNames).has(value.toLowerCase());
}

function isBoundaryTestPath(path: string, sourceKind: string, config: BoundaryMapBuildConfig): boolean {
  if (sourceKind === "test") {
    return true;
  }

  const segments = normalizeRepositoryPath(path)
    .toLowerCase()
    .split("/")
    .filter((segment) => segment.length > 0);
  return segments.some((segment) => isTestDirectoryName(segment, config));
}

function isBoundaryTestFile(
  file: Pick<RepositoryFileRecord, "path" | "sourceKind"> | undefined,
  config: BoundaryMapBuildConfig,
): boolean {
  if (file === undefined) {
    return false;
  }
  return isBoundaryTestPath(file.path, file.sourceKind, config);
}

function findBoundaryForPath(boundaries: ReadonlyMap<string, MutableBoundary>, filePath: string): MutableBoundary | undefined {
  let best: MutableBoundary | undefined;
  for (const boundary of boundaries.values()) {
    const rootPrefix = `${boundary.rootPath}/`;
    if (filePath === boundary.rootPath || filePath.startsWith(rootPrefix)) {
      if (best === undefined || boundary.rootPath.length > best.rootPath.length) {
        best = boundary;
      }
    }
  }
  return best;
}

function createBoundaryEntrypoint(
  symbol: RepositorySymbolRecord,
  boundaryKind: BoundaryKind,
  revision: string,
  config: BoundaryMapBuildConfig,
): BoundaryMapEntrypoint {
  const normalizedPath = normalizeRepositoryPath(symbol.filePath);
  const label = symbol.qualifiedName.length === 0 ? symbol.name : symbol.qualifiedName;
  return {
    id: `${normalizeIdentifier(normalizedPath)}:${symbol.key}`,
    label,
    kind: classifyEntrypointKind(symbol, boundaryKind, config),
    filePath: normalizedPath,
    symbolKey: symbol.key,
    sourceRefs: [
      createSourceRef({
        role: "implements",
        source: boundaryKind === "test-suite" ? "test" : "code",
        target: normalizedPath,
        line: symbol.startLine,
        revision,
        label,
      }),
    ],
  };
}

function attachToolFileEntrypoints(
  boundaries: ReadonlyMap<string, MutableBoundary>,
  files: readonly RepositoryFileRecord[],
  revision: string,
): void {
  const fileByPath = new Map(files.map((file) => [normalizeRepositoryPath(file.path), file] as const));
  for (const boundary of boundaries.values()) {
    if (boundary.kind !== "tool" || boundary.publicEntrypoints.size > 0) {
      continue;
    }

    const entrypointFile = selectToolEntrypointFile(boundary, fileByPath);
    if (entrypointFile === undefined) {
      continue;
    }

    const normalizedPath = normalizeRepositoryPath(entrypointFile.path);
    const label = pathPosix.basename(normalizedPath);
    boundary.publicEntrypoints.set(`${normalizeIdentifier(normalizedPath)}:file-entrypoint`, {
      id: `${normalizeIdentifier(normalizedPath)}:file-entrypoint`,
      label,
      kind: "cli",
      filePath: normalizedPath,
      sourceRefs: [
        createSourceRef({
          role: "implements",
          source: "code",
          target: normalizedPath,
          revision,
          label,
        }),
      ],
    });
  }
}

function classifyEntrypointKind(
  symbol: RepositorySymbolRecord,
  boundaryKind: BoundaryKind,
  config: BoundaryMapBuildConfig,
): BoundaryMapEntrypoint["kind"] {
  if (boundaryKind === "test-suite") {
    return "test-harness";
  }
  if (boundaryKind === "tool") {
    return "cli";
  }

  const path = normalizeRepositoryPath(symbol.filePath).toLowerCase();
  const name = symbol.name.toLowerCase();
  if (matchesAnyPathMarker(path, config.routePathMarkers) || matchesAnyNameSuffix(name, config.routeNameSuffixes)) {
    return "route";
  }
  if (matchesAnyPathMarker(path, config.apiPathMarkers) || matchesAnyNameSuffix(name, config.apiNameSuffixes)) {
    return "api";
  }
  return "export";
}

function selectToolEntrypointFile(
  boundary: MutableBoundary,
  fileByPath: ReadonlyMap<string, RepositoryFileRecord>,
): RepositoryFileRecord | undefined {
  const candidates = [...boundary.ownedPaths]
    .map((path) => fileByPath.get(path))
    .filter((file): file is RepositoryFileRecord => file !== undefined && file.sourceKind === "code")
    .sort((left, right) => compareToolEntrypointFiles(normalizeRepositoryPath(left.path), normalizeRepositoryPath(right.path)));

  if (candidates.length === 0) {
    return undefined;
  }

  const launcherCandidate = candidates.find((file) => isLikelyToolLauncherPath(normalizeRepositoryPath(file.path), boundary.rootPath));
  if (launcherCandidate !== undefined) {
    return launcherCandidate;
  }

  return candidates.length === 1 ? candidates[0] : undefined;
}

function compareToolEntrypointFiles(leftPath: string, rightPath: string): number {
  const rankDelta = toolEntrypointPathRank(leftPath) - toolEntrypointPathRank(rightPath);
  if (rankDelta !== 0) {
    return rankDelta;
  }
  return leftPath.localeCompare(rightPath);
}

function toolEntrypointPathRank(path: string): number {
  const basename = pathPosix.basename(path).toLowerCase();
  const directory = pathPosix.dirname(path).toLowerCase();
  if (directory.endsWith("/bin") || directory.endsWith("/cli")) {
    return 0;
  }
  if (!basename.includes(".")) {
    return 1;
  }
  if (basename.startsWith("cli.") || basename.endsWith(".cli") || basename.includes("-cli.") || basename.endsWith("-cli.ts") || basename.endsWith("-cli.js")) {
    return 2;
  }
  if (basename.startsWith("bin.") || basename.endsWith(".bin") || basename.includes("-bin.") || basename.endsWith("-bin.ts") || basename.endsWith("-bin.js")) {
    return 3;
  }
  return 4;
}

function isLikelyToolLauncherPath(path: string, rootPath: string): boolean {
  if (path === rootPath || path.startsWith(`${rootPath}/`)) {
    return toolEntrypointPathRank(path) < 4 || pathPosix.dirname(path).toLowerCase() === rootPath.toLowerCase();
  }
  return toolEntrypointPathRank(path) < 4;
}

function findTargetBoundary(
  boundaries: ReadonlyMap<string, MutableBoundary>,
  boundaryIdByPath: ReadonlyMap<string, string>,
  symbols: readonly RepositorySymbolRecord[],
  dependency: RepositoryDependencyRecord,
): MutableBoundary | undefined {
  if (dependency.targetFilePath !== undefined) {
    const boundaryId = boundaryIdByPath.get(normalizeRepositoryPath(dependency.targetFilePath));
    return boundaryId === undefined ? undefined : boundaries.get(boundaryId);
  }
  if (dependency.targetSymbolKey !== undefined) {
    const targetSymbol = symbols.find((symbol) => symbol.key === dependency.targetSymbolKey);
    if (targetSymbol === undefined) {
      return undefined;
    }
    return findBoundaryForPath(boundaries, normalizeRepositoryPath(targetSymbol.filePath));
  }
  return undefined;
}

function getOrCreateRelation(
  relations: Map<string, MutableRelation>,
  id: string,
  fromBoundaryId: string,
  toBoundaryId: string,
  kind: BoundaryRelationKind,
): MutableRelation {
  const current = relations.get(id);
  if (current !== undefined) {
    return current;
  }
  const created: MutableRelation = {
    id,
    fromBoundaryId,
    toBoundaryId,
    kind,
    sourceRefs: new Map<string, ProjectSourceRef>(),
  };
  relations.set(id, created);
  return created;
}

function attachDocumentationRefs(
  boundaries: ReadonlyMap<string, MutableBoundary>,
  files: readonly RepositoryFileRecord[],
  revision: string,
  config: BoundaryMapBuildConfig,
): void {
  const documentationFiles = files.filter((file) => file.sourceKind === "documentation");
  for (const file of documentationFiles) {
    const normalizedPath = normalizeRepositoryPath(file.path);
    const directBoundary = findBoundaryForPath(boundaries, normalizedPath);
    if (
      directBoundary !== undefined &&
      (hasContractPathMarker(normalizedPath, config) ||
        documentationLikelyMatchesBoundary(normalizedPath, directBoundary, config))
    ) {
      directBoundary.contractSourceRefs.set(
        createSourceRefKey(normalizedPath, undefined, "contract"),
        createContractSourceRef(normalizedPath, revision, config),
      );
      continue;
    }

    const matchingBoundaryIds = [...boundaries.values()]
      .filter((boundary) => documentationLikelyMatchesBoundary(normalizedPath, boundary, config))
      .map((boundary) => boundary.id);
    for (const boundaryId of matchingBoundaryIds) {
      boundaries.get(boundaryId)?.contractSourceRefs.set(
        createSourceRefKey(normalizedPath, undefined, "contract"),
        createContractSourceRef(normalizedPath, revision, config),
      );
    }
  }
}

function documentationLikelyMatchesBoundary(path: string, boundary: MutableBoundary, config: BoundaryMapBuildConfig): boolean {
  const normalizedPath = normalizeRepositoryPath(path).toLowerCase();
  const stem = pathPosix.basename(normalizedPath, pathPosix.extname(normalizedPath));
  const boundaryTokens = new Set<string>();
  for (const ownedPath of boundary.ownedPaths) {
    tokenizeForMatching(ownedPath, config).forEach((token) => boundaryTokens.add(token));
  }

  if (new Set(config.contractFileStems).has(stem)) {
    const parentTokens = tokenizeForMatching(pathPosix.dirname(normalizedPath), config);
    return parentTokens.length > 0 && parentTokens.every((token) => boundaryTokens.has(token));
  }

  const docTokens = tokenizeForMatching(stem, config);
  if (docTokens.length === 0) {
    return false;
  }
  return docTokens.every((token) => boundaryTokens.has(token));
}

function createContractSourceRef(path: string, revision: string, config: BoundaryMapBuildConfig): ProjectSourceRef {
  return {
    role: isContractLikeDocumentationPath(path, config) ? "defines" : "discusses",
    source: "repo-doc",
    target: path,
    revision,
    label: pathPosix.basename(path),
  };
}

function attachTestRefs(
  boundaries: ReadonlyMap<string, MutableBoundary>,
  files: readonly RepositoryFileRecord[],
  targetBoundaryIdsByTestFile: ReadonlyMap<string, Set<string>>,
  revision: string,
  config: BoundaryMapBuildConfig,
): void {
  const testFiles = files.filter((file) => isBoundaryTestFile(file, config));
  for (const file of testFiles) {
    const normalizedPath = normalizeRepositoryPath(file.path);
    const directBoundary = findBoundaryForPath(boundaries, normalizedPath);
    const directBoundaryIds = new Set<string>();
    if (directBoundary !== undefined) {
      directBoundaryIds.add(directBoundary.id);
    }
    for (const boundaryId of targetBoundaryIdsByTestFile.get(normalizedPath) ?? []) {
      directBoundaryIds.add(boundaryId);
    }

    for (const boundaryId of directBoundaryIds) {
      const boundary = boundaries.get(boundaryId);
      if (boundary === undefined) {
        continue;
      }
      boundary.testSourceRefs.set(createSourceRefKey(normalizedPath, undefined, "test"), {
        role: "verifies",
        source: "test",
        target: normalizedPath,
        revision,
        label: pathPosix.basename(normalizedPath),
      });
      if (boundary.kind === "test-suite" && boundary.publicEntrypoints.size === 0) {
        boundary.publicEntrypoints.set(`${boundary.id}:harness`, {
          id: `${boundary.id}:harness`,
          label: `${boundary.label} harness`,
          kind: "test-harness",
          filePath: normalizedPath,
          sourceRefs: [
            {
              role: "verifies",
              source: "test",
              target: normalizedPath,
              revision,
              label: pathPosix.basename(normalizedPath),
            },
          ],
        });
      }
    }
  }
}

function finalizeBoundaryNotes(
  boundaries: ReadonlyMap<string, MutableBoundary>,
  relations: ReadonlyMap<string, MutableRelation>,
): void {
  const incomingCounts = new Map<string, number>();
  const outgoingCounts = new Map<string, number>();
  for (const relation of relations.values()) {
    outgoingCounts.set(relation.fromBoundaryId, (outgoingCounts.get(relation.fromBoundaryId) ?? 0) + 1);
    incomingCounts.set(relation.toBoundaryId, (incomingCounts.get(relation.toBoundaryId) ?? 0) + 1);
  }

  for (const boundary of boundaries.values()) {
    if (boundary.contractSourceRefs.size === 0) {
      boundary.openQuestions.add("No contract-local documentation matched this boundary under current scan coverage.");
    }
    if (boundary.testSourceRefs.size === 0 && boundary.kind !== "test-suite") {
      boundary.openQuestions.add("No verifying test source was linked to this boundary under current scan coverage.");
    }
    if (boundary.publicEntrypoints.size === 0 && boundary.kind !== "test-suite") {
      boundary.openQuestions.add("No public entrypoint was detected from exported or public top-level symbols.");
    }

    const ownedPathCount = boundary.ownedPaths.size;
    const ownedSymbolCount = boundary.ownedSymbolKeys.size;
    const outgoing = outgoingCounts.get(boundary.id) ?? 0;
    const incoming = incomingCounts.get(boundary.id) ?? 0;
    boundary.notes = `${ownedPathCount} owned paths, ${ownedSymbolCount} owned symbols, ${boundary.publicEntrypoints.size} public entrypoints, ${outgoing} outgoing relations, ${incoming} incoming relations.`;
  }
}

function toBoundaryArtifact(boundary: MutableBoundary, config: BoundaryMapBuildConfig): BoundaryMapBoundary {
  return {
    id: boundary.id,
    label: boundary.label,
    kind: boundary.kind,
    ownedPaths: [...boundary.ownedPaths].sort(),
    ownedSymbolKeys: [...boundary.ownedSymbolKeys].sort(),
    publicEntrypoints: [...boundary.publicEntrypoints.values()].sort(compareBoundaryEntrypoints),
    contractSourceRefs: sortSourceRefs(boundary.contractSourceRefs),
    testSourceRefs: sortSourceRefs(boundary.testSourceRefs),
    confidence: calculateBoundaryConfidence(boundary, config),
    ...(boundary.openQuestions.size === 0 ? {} : { openQuestions: [...boundary.openQuestions].sort() }),
    ...(boundary.notes === undefined ? {} : { notes: boundary.notes }),
  };
}

function calculateBoundaryConfidence(boundary: MutableBoundary, _config: BoundaryMapBuildConfig): FindingConfidence {
  const codePathCount = boundary.kind === "test-suite" ? 0 : boundary.ownedPaths.size;
  if (boundary.publicEntrypoints.size > 0 && (boundary.contractSourceRefs.size > 0 || boundary.testSourceRefs.size > 0 || codePathCount > 1)) {
    return "high";
  }
  if (codePathCount > 0 || boundary.testSourceRefs.size > 0) {
    return "medium";
  }
  return "low";
}

function sortSourceRefs(sourceRefs: ReadonlyMap<string, ProjectSourceRef>): ProjectSourceRef[] {
  return [...sourceRefs.values()].sort(compareSourceRefs);
}

function compareSourceRefs(left: ProjectSourceRef, right: ProjectSourceRef): number {
  const targetDelta = left.target.localeCompare(right.target);
  if (targetDelta !== 0) {
    return targetDelta;
  }
  return (left.anchor ?? "").localeCompare(right.anchor ?? "");
}

function compareBoundaryEntrypoints(left: BoundaryMapEntrypoint, right: BoundaryMapEntrypoint): number {
  return left.id.localeCompare(right.id);
}

function compareBoundaryRelations(left: BoundaryMapRelation, right: BoundaryMapRelation): number {
  const fromDelta = left.fromBoundaryId.localeCompare(right.fromBoundaryId);
  if (fromDelta !== 0) {
    return fromDelta;
  }
  const kindDelta = left.kind.localeCompare(right.kind);
  if (kindDelta !== 0) {
    return kindDelta;
  }
  return left.toBoundaryId.localeCompare(right.toBoundaryId);
}

function createBoundaryLabel(rootPath: string): string {
  const segments = rootPath.split("/");
  return segments.map((segment) => humanizeSegment(segment)).join(" / ");
}

function humanizeSegment(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function normalizeIdentifier(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/g, "")
    .replace(/-+$/g, "");
}

function normalizeRepositoryPath(value: string): string {
  return value.replace(/\\/g, "/");
}

function createLineAnchor(line: number | undefined): string | undefined {
  return line === undefined ? undefined : `L${line}`;
}

function createSourceRef(options: {
  role: ProjectSourceRef["role"];
  source: ProjectSourceRef["source"];
  target: string;
  line?: number;
  revision: string;
  label: string;
}): ProjectSourceRef {
  return {
    role: options.role,
    source: options.source,
    target: options.target,
    ...(options.line === undefined ? {} : { anchor: `L${options.line}` }),
    revision: options.revision,
    label: options.label,
  };
}

function isContractLikeDocumentationPath(path: string, config: BoundaryMapBuildConfig): boolean {
  const normalized = normalizeRepositoryPath(path).toLowerCase();
  const stem = pathPosix.basename(normalized, pathPosix.extname(normalized));
  if (new Set(config.contractFileStems).has(stem)) {
    return true;
  }
  return hasContractPathMarker(normalized, config);
}

function hasContractPathMarker(path: string, config: BoundaryMapBuildConfig): boolean {
  const normalized = normalizeRepositoryPath(path).toLowerCase();
  return config.contractPathMarkers.some((marker) => normalized.includes(marker));
}

function tokenizeForMatching(value: string, config: BoundaryMapBuildConfig): string[] {
  const ignoredTokens = new Set(config.ignoredDocTokens);
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !ignoredTokens.has(token));
}

function matchesAnyPathMarker(path: string, markers: readonly string[]): boolean {
  return markers.some((marker) => path.includes(marker));
}

function matchesAnyNameSuffix(name: string, suffixes: readonly string[]): boolean {
  return suffixes.some((suffix) => name.endsWith(suffix));
}

function createSourceRefKey(path: string, line: number | undefined, purpose: string): string {
  return `${purpose}:${path}:${line ?? ""}`;
}
