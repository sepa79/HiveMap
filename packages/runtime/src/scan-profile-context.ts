/**
 * Responsibility: Compose effective scan-profile overlay resolution with its indexed coverage summary.
 * Must not: Parse overlay syntax, calculate coverage internals, build guidance, or persist scan state.
 * Contract: docs/specs/repository-scan.md#preliminary-calibration-gate
 */
import type { ScanCoverageSummary, ScanProfileOverlayResolution } from "@hivemap/api-contracts";
import type { ScanProfile } from "@hivemap/scans";
import type { RepositoryChunkRecord, RepositoryFileRecord, RepositorySymbolRecord } from "@hivemap/storage";

import { createScanCoverageSummary } from "./scan-coverage.js";
import { resolveScanProfileOverlay } from "./scan-profile-overlay.js";

export type ScanProfileContext = {
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
  const resolved = resolveScanProfileOverlay(baseProfile, files, chunks);
  return {
    baseProfile,
    effectiveProfile: resolved.effectiveProfile,
    overlay: resolved.overlay,
    coverageSummary: createScanCoverageSummary(resolved.effectiveProfile, files, symbols, resolved.overlay),
  };
}
