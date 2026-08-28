/**
 * Responsibility: Resolve boundary-map build configuration from the indexed repository overlay.
 * Must not: Parse overlay syntax, derive coverage, generate guidance, or build boundary-map artifacts.
 * Contract: docs/specs/repository-scan.md#boundary-map-artifact
 */
import {
  createBoundaryMapBuildConfig,
  getScanProfileOverlayPath,
  type BoundaryMapBuildConfig,
  type ScanProfile,
} from "@hivemap/scans";
import type { RepositoryChunkRecord, RepositoryFileRecord } from "@hivemap/storage";

import { normalizeRepositoryPath } from "./repository-path.js";
import { readScanProfileOverlayFromRepository } from "./scan-profile-overlay.js";

export function resolveBoundaryMapBuildConfig(
  profile: ScanProfile,
  files: readonly RepositoryFileRecord[],
  chunks: readonly RepositoryChunkRecord[],
): BoundaryMapBuildConfig {
  const overlayPath = normalizeRepositoryPath(getScanProfileOverlayPath(profile));
  const overlayFile = files.find((file) => normalizeRepositoryPath(file.path) === overlayPath);
  if (overlayFile === undefined) {
    return createBoundaryMapBuildConfig();
  }
  const overlay = readScanProfileOverlayFromRepository(profile, overlayPath, chunks);
  return createBoundaryMapBuildConfig(overlay);
}
