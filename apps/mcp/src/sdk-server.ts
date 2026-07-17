import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

import { HiveMapRuntime } from "@hivemap/runtime";

import { handleMcpTool, type McpToolFailure, type McpToolName, type McpToolResponseMap } from "./index.js";

const TOOL_DESCRIPTIONS: Record<McpToolName, string> = {
  project_create: "Create one explicit HiveMap workspace with built-in repository scan profiles.",
  graph_get: "Read the canonical semantic graph for a workspace.",
  graph_command: "Apply explicit typed commands to the canonical semantic graph.",
  category_assign: "Assign one validated semantic/visual category overlay.",
  projection_get: "Read one named projection over the semantic graph.",
  projection_create: "Create an overview, dive-in, or project-map projection without mutating graph semantics.",
  feedback_list: "List human feedback events for agent interpretation.",
  proposal_create: "Create a reviewable graph mutation proposal.",
  proposal_approve: "Explicitly approve one pending graph proposal.",
  proposal_apply: "Apply one approved graph proposal to the canonical graph.",
  scan_profile_list: "List versioned agent scan recipes, discovery rules, criteria, SSOT order, and required outputs.",
  scan_list: "List auditable in-progress and completed repository scan runs for a workspace.",
  scan_start: "Start an agent-executed scan and receive the resolved profile plus exact discovery and completion instructions.",
  scan_record_coverage: "Record the complete discovered, included, excluded, and failed source inventory for an in-progress scan.",
  scan_finding_create: "Create a validated finding node with stable fingerprint, source claims, severity, and origin scan evidence.",
  finding_update: "Update an active finding status or severity; resolved status requires explicit resolution evidence.",
  scan_complete: "Complete a scan only after coverage, every profile criterion, required output, and finding evidence validate.",
  scan_compare: "Compare two completed runs of the same profile and return resolved, open, changed, new, regressed, or unverifiable evidence.",
  workspace_export_zip: "Export a deterministic checksummed .hivemap.zip with canonical workspace state and repeat-scan instructions.",
  workspace_import_zip: "Import a validated .hivemap.zip in explicit new or replace mode without silent merge or id rewriting.",
};

export function createHiveMapMcpServer(runtime: HiveMapRuntime): McpServer {
  const server = new McpServer({
    name: "hivemap",
    version: "0.0.0",
  });

  registerTool(server, runtime, "project_create", {
    workspace: z.object({
      id: z.string(),
      name: z.string(),
      createdAt: z.string(),
    }),
  });

  registerTool(server, runtime, "graph_get", {
    workspaceId: z.string(),
  });

  registerTool(server, runtime, "graph_command", {
    workspaceId: z.string(),
    commands: z.array(z.record(z.string(), z.unknown())),
  });

  registerTool(server, runtime, "category_assign", {
    workspaceId: z.string(),
    assignment: z.record(z.string(), z.unknown()),
  });

  registerTool(server, runtime, "projection_get", {
    workspaceId: z.string(),
    projectionId: z.string(),
  });

  registerTool(server, runtime, "projection_create", {
    workspaceId: z.string(),
    input: z.record(z.string(), z.unknown()),
  });

  registerTool(server, runtime, "feedback_list", {
    workspaceId: z.string(),
  });

  registerTool(server, runtime, "proposal_create", {
    workspaceId: z.string(),
    proposal: z.record(z.string(), z.unknown()),
  });

  registerTool(server, runtime, "proposal_approve", {
    workspaceId: z.string(),
    proposalId: z.string(),
  });

  registerTool(server, runtime, "proposal_apply", {
    workspaceId: z.string(),
    proposalId: z.string(),
  });

  registerTool(server, runtime, "scan_profile_list", {
    workspaceId: z.string(),
  });

  registerTool(server, runtime, "scan_list", {
    workspaceId: z.string(),
  });

  registerTool(server, runtime, "scan_start", {
    workspaceId: z.string(),
    scan: z.object({
      id: z.string(),
      profileId: z.string(),
      profileVersion: z.number().int().positive(),
      repository: z.object({
        root: z.string(),
        repositoryUrl: z.string().optional(),
        branch: z.string(),
        revision: z.string(),
        worktreeDigest: z.string().optional(),
      }),
      actor: z.object({ agentId: z.string(), tool: z.string() }),
      startedAt: z.string(),
    }),
  });

  registerTool(server, runtime, "scan_record_coverage", {
    workspaceId: z.string(),
    scanId: z.string(),
    coverage: z.object({
      discovered: z.array(z.string()),
      included: z.array(z.string()),
      excluded: z.array(z.object({ target: z.string(), reason: z.string() })),
      failed: z.array(z.object({ target: z.string(), reason: z.string() })),
    }),
  });

  registerTool(server, runtime, "scan_finding_create", {
    workspaceId: z.string(),
    scanId: z.string(),
    finding: z.record(z.string(), z.unknown()),
  });

  registerTool(server, runtime, "finding_update", {
    workspaceId: z.string(),
    findingNodeId: z.string(),
    changes: z.record(z.string(), z.unknown()),
  });

  registerTool(server, runtime, "scan_complete", {
    workspaceId: z.string(),
    scanId: z.string(),
    completedAt: z.string(),
    appliedCriteria: z.array(z.string()),
    declaredOutputs: z.array(z.enum(["document-inventory", "concept-map", "findings", "coverage-report"])),
  });

  registerTool(server, runtime, "scan_compare", {
    workspaceId: z.string(),
    beforeScanId: z.string(),
    afterScanId: z.string(),
  });

  registerTool(server, runtime, "workspace_export_zip", {
    workspaceId: z.string(),
    targetPath: z.string(),
    exportedAt: z.string(),
  });

  registerTool(server, runtime, "workspace_import_zip", {
    sourcePath: z.string(),
    mode: z.enum(["new", "replace"]),
  });

  return server;
}

export async function connectHiveMapStdioServer(runtime: HiveMapRuntime): Promise<McpServer> {
  const server = createHiveMapMcpServer(runtime);
  await server.connect(new StdioServerTransport());
  return server;
}

function registerTool(
  server: McpServer,
  runtime: HiveMapRuntime,
  toolName: McpToolName,
  inputSchema: z.ZodRawShape,
): void {
  server.registerTool(
    toolName,
    {
      description: TOOL_DESCRIPTIONS[toolName],
      inputSchema,
    },
    async (args) => {
      const result = handleMcpTool(runtime, toolName, args as never);

      if (!result.ok) {
        return toolFailureToMcpResult(result);
      }

      return toolSuccessToMcpResult(toolName, result.value);
    },
  );
}

function toolSuccessToMcpResult<T extends McpToolName>(toolName: T, value: McpToolResponseMap[T]) {
  const structuredContent = {
    ok: true,
    tool: toolName,
    value,
  };

  return {
    content: [{ type: "text" as const, text: JSON.stringify(structuredContent, null, 2) }],
    structuredContent,
  };
}

function toolFailureToMcpResult(result: McpToolFailure) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: result.error.message }],
    structuredContent: result,
  };
}
