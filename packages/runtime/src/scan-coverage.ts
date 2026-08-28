/**
 * Responsibility: Derive and summarize scan coverage from indexed repository facts.
 * Must not: Parse overlays, read repository content, build guidance, or persist scan state.
 * Contract: docs/specs/repository-scan.md#coverage
 */
import type { ScanCoverageSummary, ScanProfileOverlayResolution } from "@hivemap/api-contracts";
import type { ScanCoverage, ScanProfile } from "@hivemap/scans";
import type { RepositoryFileRecord, RepositorySymbolRecord } from "@hivemap/storage";

import { matchesAnyGlob, normalizeRepositoryPath } from "./repository-path.js";

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
export function createScanCoverageSummary(
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
