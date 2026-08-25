import type {
  McpToolName,
  McpToolRequestMap,
  BackfillConceptEmbeddingsResponse,
  BuildScanBoundaryMapResponse,
  ExecuteRepositoryIndexResponse,
  GetScanProfileOverlayHelpResponse,
  SuggestScanProfileOverlayResponse,
  GetWorkspaceSummaryResponse,
  ListWorkspaceSummariesResponse,
  ResolveWorkspaceResponse,
  ApplyGraphCommandsResponse,
  ApplyProposalResponse,
  AssignCategoryResponse,
  CreateProjectionResponse,
  CreateProposalResponse,
  CreateWorkspaceResponse,
  GetGraphResponse,
  GetRepositoryIndexResponse,
  ListRepositoryEvidenceCandidatesResponse,
  GetProjectionResponse,
  ListSimilarConceptsResponse,
  ListFeedbackResponse,
  ListRepositoryIndexesResponse,
  SearchRepositoryIndexResponse,
  CompareScansResponse,
  CompleteScanResponse,
  CreateScanFindingResponse,
  ExportWorkspaceResponse,
  ImportWorkspaceResponse,
  ListScanProfilesResponse,
  ListScanRunsResponse,
  RecordScanCalibrationDecisionResponse,
  RecordScanCoverageResponse,
  RefreshConceptEmbeddingResponse,
  StartScanResponse,
  UpdateFindingResponse,
  UpsertConceptEmbeddingResponse,
  ValidateScanFindingResponse,
} from "@hivemap/api-contracts";
import { HiveMapRuntime, RuntimeError } from "@hivemap/runtime";
import { StorageError } from "@hivemap/storage";

export type { McpToolName } from "@hivemap/api-contracts";

export const HIVEMAP_MCP_TOOL_NAMES: readonly McpToolName[] = [
  "workspace_list",
  "workspace_get",
  "workspace_resolve",
  "project_create",
  "graph_get",
  "repository_index_list",
  "repository_index_get",
  "repository_index_start",
  "repository_index_execute",
  "repository_search",
  "repository_evidence_candidates",
  "scan_boundary_map_build",
  "scan_profile_overlay_help",
  "scan_profile_overlay_suggest",
  "concept_embedding_upsert",
  "concept_embedding_refresh",
  "concept_embedding_backfill",
  "concept_similar_list",
  "graph_command",
  "category_assign",
  "projection_get",
  "projection_create",
  "feedback_list",
  "proposal_create",
  "proposal_approve",
  "proposal_apply",
  "scan_profile_list",
  "scan_list",
  "scan_start",
  "scan_record_coverage",
  "scan_calibration_decide",
  "scan_finding_validate",
  "scan_finding_create",
  "finding_update",
  "scan_complete",
  "scan_compare",
  "workspace_export_zip",
  "workspace_import_zip",
] as const;

export type McpToolResponseMap = {
  workspace_list: ListWorkspaceSummariesResponse;
  workspace_get: GetWorkspaceSummaryResponse;
  workspace_resolve: ResolveWorkspaceResponse;
  project_create: CreateWorkspaceResponse;
  graph_get: GetGraphResponse;
  repository_index_list: ListRepositoryIndexesResponse;
  repository_index_get: GetRepositoryIndexResponse;
  repository_index_start: import("@hivemap/api-contracts").StartRepositoryIndexResponse;
  repository_index_execute: ExecuteRepositoryIndexResponse;
  repository_search: SearchRepositoryIndexResponse;
  repository_evidence_candidates: ListRepositoryEvidenceCandidatesResponse;
  scan_boundary_map_build: BuildScanBoundaryMapResponse;
  scan_profile_overlay_help: GetScanProfileOverlayHelpResponse;
  scan_profile_overlay_suggest: SuggestScanProfileOverlayResponse;
  concept_embedding_upsert: UpsertConceptEmbeddingResponse;
  concept_embedding_refresh: RefreshConceptEmbeddingResponse;
  concept_embedding_backfill: BackfillConceptEmbeddingsResponse;
  concept_similar_list: ListSimilarConceptsResponse;
  graph_command: ApplyGraphCommandsResponse;
  category_assign: AssignCategoryResponse;
  projection_get: GetProjectionResponse;
  projection_create: CreateProjectionResponse;
  feedback_list: ListFeedbackResponse;
  proposal_create: CreateProposalResponse;
  proposal_approve: import("@hivemap/api-contracts").ApproveProposalResponse;
  proposal_apply: ApplyProposalResponse;
  scan_profile_list: ListScanProfilesResponse;
  scan_list: ListScanRunsResponse;
  scan_start: StartScanResponse;
  scan_record_coverage: RecordScanCoverageResponse;
  scan_calibration_decide: RecordScanCalibrationDecisionResponse;
  scan_finding_validate: ValidateScanFindingResponse;
  scan_finding_create: CreateScanFindingResponse;
  finding_update: UpdateFindingResponse;
  scan_complete: CompleteScanResponse;
  scan_compare: CompareScansResponse;
  workspace_export_zip: ExportWorkspaceResponse;
  workspace_import_zip: ImportWorkspaceResponse;
};

export type McpToolSuccess<T extends McpToolName> = {
  ok: true;
  tool: T;
  value: McpToolResponseMap[T];
};

export type McpToolFailure = {
  ok: false;
  tool: McpToolName | "unknown";
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type McpToolResult<T extends McpToolName> = McpToolSuccess<T> | McpToolFailure;

export class McpToolValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpToolValidationError";
  }
}

export async function handleMcpTool<T extends McpToolName>(
  runtime: HiveMapRuntime,
  tool: T,
  request: McpToolRequestMap[T],
): Promise<McpToolResult<T>> {
  try {
    const value = await dispatchMcpTool(runtime, tool, request);
    return { ok: true, tool, value } as McpToolSuccess<T>;
  } catch (error) {
    return {
      ok: false,
      tool,
      error: normalizeToolError(error),
    };
  }
}

export function assertKnownMcpTool(tool: string): asserts tool is McpToolName {
  if (!HIVEMAP_MCP_TOOL_NAMES.includes(tool as McpToolName)) {
    throw new McpToolValidationError(`Unknown MCP tool: ${tool}`);
  }
}

async function dispatchMcpTool<T extends McpToolName>(
  runtime: HiveMapRuntime,
  tool: T,
  request: McpToolRequestMap[T],
): Promise<McpToolResponseMap[T]> {
  switch (tool) {
    case "workspace_list":
      return (await runtime.listWorkspaceSummaries(request as McpToolRequestMap["workspace_list"])) as McpToolResponseMap[T];
    case "workspace_get":
      return (await runtime.getWorkspaceSummary(request as McpToolRequestMap["workspace_get"])) as McpToolResponseMap[T];
    case "workspace_resolve":
      return (await runtime.resolveWorkspace(request as McpToolRequestMap["workspace_resolve"])) as McpToolResponseMap[T];
    case "project_create":
      return (await runtime.createWorkspace(request as McpToolRequestMap["project_create"])) as McpToolResponseMap[T];
    case "graph_get":
      return (await runtime.getGraph(request as McpToolRequestMap["graph_get"])) as McpToolResponseMap[T];
    case "repository_index_list":
      return (await runtime.listRepositoryIndexes(request as McpToolRequestMap["repository_index_list"])) as McpToolResponseMap[T];
    case "repository_index_get":
      return (await runtime.getRepositoryIndex(request as McpToolRequestMap["repository_index_get"])) as McpToolResponseMap[T];
    case "repository_index_start":
      return (await runtime.startRepositoryIndex(request as McpToolRequestMap["repository_index_start"])) as McpToolResponseMap[T];
    case "repository_index_execute":
      return (await runtime.executeRepositoryIndex(request as McpToolRequestMap["repository_index_execute"])) as McpToolResponseMap[T];
    case "repository_search":
      return (await runtime.searchRepositoryIndex(request as McpToolRequestMap["repository_search"])) as McpToolResponseMap[T];
    case "repository_evidence_candidates":
      return (await runtime.listRepositoryEvidenceCandidates(
        request as McpToolRequestMap["repository_evidence_candidates"],
      )) as McpToolResponseMap[T];
    case "scan_boundary_map_build":
      return (await runtime.buildScanBoundaryMap(request as McpToolRequestMap["scan_boundary_map_build"])) as McpToolResponseMap[T];
    case "scan_profile_overlay_help":
      return (await runtime.getScanProfileOverlayHelp(
        request as McpToolRequestMap["scan_profile_overlay_help"],
      )) as McpToolResponseMap[T];
    case "scan_profile_overlay_suggest":
      return (await runtime.suggestScanProfileOverlay(
        request as McpToolRequestMap["scan_profile_overlay_suggest"],
      )) as McpToolResponseMap[T];
    case "concept_embedding_upsert":
      return (await runtime.upsertConceptEmbedding(request as McpToolRequestMap["concept_embedding_upsert"])) as McpToolResponseMap[T];
    case "concept_embedding_refresh":
      return (await runtime.refreshConceptEmbedding(request as McpToolRequestMap["concept_embedding_refresh"])) as McpToolResponseMap[T];
    case "concept_embedding_backfill":
      return (await runtime.backfillConceptEmbeddings(request as McpToolRequestMap["concept_embedding_backfill"])) as McpToolResponseMap[T];
    case "concept_similar_list":
      return (await runtime.listSimilarConcepts(request as McpToolRequestMap["concept_similar_list"])) as McpToolResponseMap[T];
    case "graph_command":
      return (await runtime.applyGraphCommands(request as McpToolRequestMap["graph_command"])) as McpToolResponseMap[T];
    case "category_assign":
      return (await runtime.assignCategory(request as McpToolRequestMap["category_assign"])) as McpToolResponseMap[T];
    case "projection_get":
      return (await runtime.getProjection(request as McpToolRequestMap["projection_get"])) as McpToolResponseMap[T];
    case "projection_create":
      return (await runtime.createProjection(request as McpToolRequestMap["projection_create"])) as McpToolResponseMap[T];
    case "feedback_list":
      return (await runtime.listFeedback(request as McpToolRequestMap["feedback_list"])) as McpToolResponseMap[T];
    case "proposal_create":
      return (await runtime.createProposal(request as McpToolRequestMap["proposal_create"])) as McpToolResponseMap[T];
    case "proposal_approve":
      return (await runtime.approveProposal(request as McpToolRequestMap["proposal_approve"])) as McpToolResponseMap[T];
    case "proposal_apply":
      return (await runtime.applyProposal(request as McpToolRequestMap["proposal_apply"])) as McpToolResponseMap[T];
    case "scan_profile_list":
      return (await runtime.listScanProfiles(request as McpToolRequestMap["scan_profile_list"])) as McpToolResponseMap[T];
    case "scan_list":
      return (await runtime.listScanRuns(request as McpToolRequestMap["scan_list"])) as McpToolResponseMap[T];
    case "scan_start":
      return (await runtime.startScan(request as McpToolRequestMap["scan_start"])) as McpToolResponseMap[T];
    case "scan_record_coverage":
      return (await runtime.recordScanCoverage(request as McpToolRequestMap["scan_record_coverage"])) as McpToolResponseMap[T];
    case "scan_calibration_decide":
      return (await runtime.recordScanCalibrationDecision(
        request as McpToolRequestMap["scan_calibration_decide"],
      )) as McpToolResponseMap[T];
    case "scan_finding_validate":
      return (await runtime.validateScanFinding(request as McpToolRequestMap["scan_finding_validate"])) as McpToolResponseMap[T];
    case "scan_finding_create":
      return (await runtime.createScanFinding(request as McpToolRequestMap["scan_finding_create"])) as McpToolResponseMap[T];
    case "finding_update":
      return (await runtime.updateFinding(request as McpToolRequestMap["finding_update"])) as McpToolResponseMap[T];
    case "scan_complete":
      return (await runtime.completeScan(request as McpToolRequestMap["scan_complete"])) as McpToolResponseMap[T];
    case "scan_compare":
      return (await runtime.compareScans(request as McpToolRequestMap["scan_compare"])) as McpToolResponseMap[T];
    case "workspace_export_zip":
      return (await runtime.exportWorkspace(request as McpToolRequestMap["workspace_export_zip"])) as McpToolResponseMap[T];
    case "workspace_import_zip":
      return (await runtime.importWorkspace(request as McpToolRequestMap["workspace_import_zip"])) as McpToolResponseMap[T];
  }
}

function normalizeToolError(error: unknown): { code: string; message: string; details?: unknown } {
  if (error instanceof StorageError) {
    return { code: "STORAGE_ERROR", message: error.message };
  }

  if (error instanceof RuntimeError) {
    return { code: error.code, message: error.message, details: error.details };
  }

  if (error instanceof Error) {
    return { code: error.name, message: error.message };
  }

  return { code: "UNKNOWN_ERROR", message: "Unknown MCP tool error" };
}
