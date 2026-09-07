/**
 * Responsibility: Validate cross-record ownership between scan profiles, runs, and semantic finding nodes.
 * Must not: Validate individual finding payloads beyond ownership, mutate graph state, compare scans, or persist data.
 * Contract: Enforces scan-state ownership invariants in docs/specs/repository-scan.md.
 */
import type { GraphNode, SemanticGraph } from "@hivemap/graph-core";

import { validateFindingAffectedNodes, type FindingMetadata } from "./finding-validation.js";
import { validateScanProfile, type ScanProfile } from "./scan-profile.js";
import { validateScanRun, type ScanRun } from "./scan-run.js";
import { ScanValidationError } from "./scan-validation-error.js";

export function validateScanState(profiles: readonly ScanProfile[], runs: readonly ScanRun[], graph: SemanticGraph): void {
  const profileRefs = new Set<string>();
  for (const profile of profiles) {
    validateScanProfile(profile);
    const ref = `${profile.id}@${profile.version}`;
    if (profileRefs.has(ref)) throw new ScanValidationError(`Duplicate scan profile: ${ref}`);
    profileRefs.add(ref);
  }
  const runIds = new Set<string>();
  for (const run of runs) {
    if (runIds.has(run.id)) throw new ScanValidationError(`Duplicate scan run: ${run.id}`);
    runIds.add(run.id);
    validateScanRun(run, profiles, graph);
  }
  const findingNodesById = new Map<string, GraphNode>();
  const findingIdsByOriginScan = new Map<string, string[]>();
  for (const node of graph.nodes.filter((candidate) => candidate.type === "finding")) {
    validateFindingAffectedNodes(node, graph);
    const finding = node.metadata?.finding as FindingMetadata;
    if (!runIds.has(finding.originScanId)) {
      throw new ScanValidationError(`Finding ${node.id} references missing scan: ${finding.originScanId}`);
    }
    findingNodesById.set(node.id, node);
    const ownedFindingIds = findingIdsByOriginScan.get(finding.originScanId) ?? [];
    ownedFindingIds.push(node.id);
    findingIdsByOriginScan.set(finding.originScanId, ownedFindingIds);
  }
  for (const run of runs) {
    const listedFindingIds = new Set(run.findingNodeIds);
    for (const findingId of listedFindingIds) {
      const node = findingNodesById.get(findingId);
      if (node === undefined) throw new ScanValidationError(`Scan ${run.id} references missing finding: ${findingId}`);
      const finding = node.metadata?.finding as FindingMetadata;
      if (finding.originScanId !== run.id) {
        throw new ScanValidationError(`Scan ${run.id} lists finding ${findingId} owned by scan ${finding.originScanId}`);
      }
    }
    for (const findingId of findingIdsByOriginScan.get(run.id) ?? []) {
      if (!listedFindingIds.has(findingId)) {
        throw new ScanValidationError(`Finding ${findingId} is not listed by owning scan ${run.id}`);
      }
    }
  }
}
