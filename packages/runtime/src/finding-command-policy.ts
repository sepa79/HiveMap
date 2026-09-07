/**
 * Responsibility: Enforce the runtime command boundary for scan-owned finding nodes.
 * Must not: Apply graph commands, persist workspace state, or implement transport behavior.
 * Contract: docs/specs/repository-scan.md finding lifecycle and ownership invariants.
 */
import { type GraphCommand, type GraphNode, type SemanticGraph } from "@hivemap/graph-core";
import {
  validateFindingAffectedNodes,
  type FindingMetadata,
  type InProgressScanRun,
  type ScanRun,
} from "@hivemap/scans";
import { type WorkspaceState } from "@hivemap/storage";

import { RuntimeError } from "./runtime-error.js";

const FINDING_COMMAND_ERROR_CODE = "FINDING_LIFECYCLE_COMMAND_FORBIDDEN";

export function assertGenericCommandsDoNotMutateFindings(
  graph: SemanticGraph,
  commands: readonly GraphCommand[],
): void {
  const findingIds = new Set(graph.nodes.filter((node) => node.type === "finding").map((node) => node.id));
  for (const command of commands) {
    if (command.type === "node.create" && command.payload.node.type === "finding") {
      throw findingCommandError(command.payload.node.id);
    }
    if (command.type === "node.update" && (findingIds.has(command.payload.id) || command.payload.changes.type === "finding")) {
      throw findingCommandError(command.payload.id);
    }
    if (command.type === "node.delete" && findingIds.has(command.payload.id)) {
      throw findingCommandError(command.payload.id);
    }
  }
}

export function attachProposedFindingCreates(
  state: WorkspaceState,
  graph: SemanticGraph,
  commands: readonly GraphCommand[],
): ScanRun[] {
  const createdFindings = commands
    .filter((command): command is Extract<GraphCommand, { type: "node.create" }> => command.type === "node.create")
    .map((command) => command.payload.node)
    .filter((node) => node.type === "finding");
  const createdFindingIds = new Set(createdFindings.map((node) => node.id));
  const existingFindingIds = new Set(state.graph.nodes.filter((node) => node.type === "finding").map((node) => node.id));

  for (const command of commands) {
    if (command.type === "node.update" && (existingFindingIds.has(command.payload.id) || createdFindingIds.has(command.payload.id) || command.payload.changes.type === "finding")) {
      throw findingCommandError(command.payload.id);
    }
    if (command.type === "node.delete" && (existingFindingIds.has(command.payload.id) || createdFindingIds.has(command.payload.id))) {
      throw findingCommandError(command.payload.id);
    }
  }

  if (createdFindings.length === 0) return [...state.scanRuns];

  const additionsByScan = new Map<string, GraphNode[]>();
  for (const node of createdFindings) {
    const run = requireAttachableFindingScan(state, graph, node);
    const additions = additionsByScan.get(run.id) ?? [];
    additions.push(node);
    additionsByScan.set(run.id, additions);
  }

  return state.scanRuns.map((run) => {
    const additions = additionsByScan.get(run.id);
    if (additions === undefined) return run;
    return { ...run, findingNodeIds: [...run.findingNodeIds, ...additions.map((node) => node.id)] };
  });
}

export function requireAttachableFindingScan(
  state: WorkspaceState,
  graph: SemanticGraph,
  node: GraphNode,
): InProgressScanRun {
  validateFindingAffectedNodes(node, graph);
  const finding = node.metadata?.finding as FindingMetadata;
  const run = state.scanRuns.find((candidate) => candidate.id === finding.originScanId);
  if (run === undefined) throw new RuntimeError(`Finding ${node.id} references missing scan: ${finding.originScanId}`);
  if (run.status !== "in_progress") throw new RuntimeError(`Scan is not in progress: ${run.id}`);
  requireContinueDecision(run, node.id);
  const profile = run.effectiveProfile
    ?? state.scanProfiles.find((candidate) => candidate.id === run.profileId && candidate.version === run.profileVersion);
  if (profile === undefined) throw new RuntimeError(`Scan profile not found: ${run.profileId}@${run.profileVersion}`);
  for (const criterionId of finding.criterionIds) {
    if (!profile.criteria.some((criterion) => criterion.id === criterionId)) {
      throw new RuntimeError(`Finding references criterion outside scan profile: ${criterionId}`);
    }
  }
  return run;
}

function requireContinueDecision(run: InProgressScanRun, findingNodeId: string): void {
  const latestDecision = run.calibrationDecisions[run.calibrationDecisions.length - 1];
  if (latestDecision?.decision === "continue") return;
  throw new RuntimeError(`Creating finding ${findingNodeId} requires explicit calibration decision continue for scan ${run.id}`, {
    code: "SCAN_CALIBRATION_DECISION_REQUIRED",
    details: { scanId: run.id, requiredDecision: "continue" },
  });
}

function findingCommandError(nodeId: string): RuntimeError {
  return new RuntimeError(`Finding node ${nodeId} must use scan_finding_create, finding_update, scan_delete, or approved proposal creation`, {
    code: FINDING_COMMAND_ERROR_CODE,
  });
}
