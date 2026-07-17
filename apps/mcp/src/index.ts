import type {
  McpToolName,
  McpToolRequestMap,
  ApplyGraphCommandsResponse,
  ApplyProposalResponse,
  AssignCategoryResponse,
  CreateProjectionResponse,
  CreateProposalResponse,
  CreateWorkspaceResponse,
  GetGraphResponse,
  GetProjectionResponse,
  ListFeedbackResponse,
  CompareScansResponse,
  CompleteScanResponse,
  CreateScanFindingResponse,
  ExportWorkspaceResponse,
  ImportWorkspaceResponse,
  ListScanProfilesResponse,
  ListScanRunsResponse,
  RecordScanCoverageResponse,
  StartScanResponse,
  UpdateFindingResponse,
} from "@hivemap/api-contracts";
import { HiveMapRuntime, RuntimeError } from "@hivemap/runtime";
import { StorageError } from "@hivemap/storage";

export type { McpToolName } from "@hivemap/api-contracts";

export const HIVEMAP_MCP_TOOL_NAMES: readonly McpToolName[] = [
  "project_create",
  "graph_get",
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
  "scan_finding_create",
  "finding_update",
  "scan_complete",
  "scan_compare",
  "workspace_export_zip",
  "workspace_import_zip",
] as const;

export type McpToolResponseMap = {
  project_create: CreateWorkspaceResponse;
  graph_get: GetGraphResponse;
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
  };
};

export type McpToolResult<T extends McpToolName> = McpToolSuccess<T> | McpToolFailure;

export class McpToolValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpToolValidationError";
  }
}

export function handleMcpTool<T extends McpToolName>(
  runtime: HiveMapRuntime,
  tool: T,
  request: McpToolRequestMap[T],
): McpToolResult<T> {
  try {
    const value = dispatchMcpTool(runtime, tool, request);
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

function dispatchMcpTool<T extends McpToolName>(
  runtime: HiveMapRuntime,
  tool: T,
  request: McpToolRequestMap[T],
): McpToolResponseMap[T] {
  switch (tool) {
    case "project_create":
      return runtime.createWorkspace(request as McpToolRequestMap["project_create"]) as McpToolResponseMap[T];
    case "graph_get":
      return runtime.getGraph(request as McpToolRequestMap["graph_get"]) as McpToolResponseMap[T];
    case "graph_command":
      return runtime.applyGraphCommands(request as McpToolRequestMap["graph_command"]) as McpToolResponseMap[T];
    case "category_assign":
      return runtime.assignCategory(request as McpToolRequestMap["category_assign"]) as McpToolResponseMap[T];
    case "projection_get":
      return runtime.getProjection(request as McpToolRequestMap["projection_get"]) as McpToolResponseMap[T];
    case "projection_create":
      return runtime.createProjection(request as McpToolRequestMap["projection_create"]) as McpToolResponseMap[T];
    case "feedback_list":
      return runtime.listFeedback(request as McpToolRequestMap["feedback_list"]) as McpToolResponseMap[T];
    case "proposal_create":
      return runtime.createProposal(request as McpToolRequestMap["proposal_create"]) as McpToolResponseMap[T];
    case "proposal_approve":
      return runtime.approveProposal(request as McpToolRequestMap["proposal_approve"]) as McpToolResponseMap[T];
    case "proposal_apply":
      return runtime.applyProposal(request as McpToolRequestMap["proposal_apply"]) as McpToolResponseMap[T];
    case "scan_profile_list":
      return runtime.listScanProfiles(request as McpToolRequestMap["scan_profile_list"]) as McpToolResponseMap[T];
    case "scan_list":
      return runtime.listScanRuns(request as McpToolRequestMap["scan_list"]) as McpToolResponseMap[T];
    case "scan_start":
      return runtime.startScan(request as McpToolRequestMap["scan_start"]) as McpToolResponseMap[T];
    case "scan_record_coverage":
      return runtime.recordScanCoverage(request as McpToolRequestMap["scan_record_coverage"]) as McpToolResponseMap[T];
    case "scan_finding_create":
      return runtime.createScanFinding(request as McpToolRequestMap["scan_finding_create"]) as McpToolResponseMap[T];
    case "finding_update":
      return runtime.updateFinding(request as McpToolRequestMap["finding_update"]) as McpToolResponseMap[T];
    case "scan_complete":
      return runtime.completeScan(request as McpToolRequestMap["scan_complete"]) as McpToolResponseMap[T];
    case "scan_compare":
      return runtime.compareScans(request as McpToolRequestMap["scan_compare"]) as McpToolResponseMap[T];
    case "workspace_export_zip":
      return runtime.exportWorkspace(request as McpToolRequestMap["workspace_export_zip"]) as McpToolResponseMap[T];
    case "workspace_import_zip":
      return runtime.importWorkspace(request as McpToolRequestMap["workspace_import_zip"]) as McpToolResponseMap[T];
  }
}

function normalizeToolError(error: unknown): { code: string; message: string } {
  if (error instanceof StorageError) {
    return { code: "STORAGE_ERROR", message: error.message };
  }

  if (error instanceof RuntimeError) {
    return { code: "RUNTIME_ERROR", message: error.message };
  }

  if (error instanceof Error) {
    return { code: error.name, message: error.message };
  }

  return { code: "UNKNOWN_ERROR", message: "Unknown MCP tool error" };
}
