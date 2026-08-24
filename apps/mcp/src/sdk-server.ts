import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

import { PROJECT_SOURCE_ROLE_VALUES, PROJECT_SOURCE_TYPE_VALUES } from "@hivemap/graph-core";
import {
  BOUNDARY_ENTRYPOINT_KIND_VALUES,
  BOUNDARY_KIND_VALUES,
  BOUNDARY_RELATION_KIND_VALUES,
  FINDING_CONFIDENCE_VALUES,
} from "@hivemap/scans";
import { HiveMapRuntime } from "@hivemap/runtime";

import { handleMcpTool, type McpToolFailure, type McpToolName, type McpToolResponseMap } from "./index.js";

const TOOL_DESCRIPTIONS: Record<McpToolName, string> = {
  workspace_list: "List local HiveMap workspaces without loading their graphs so an agent can discover the right workspace first.",
  workspace_get: "Read one canonical lightweight workspace record by workspace id.",
  workspace_resolve: "Resolve a workspace ref by canonical id, slug, or exact name and return the canonical workspace record.",
  project_create: "Create one explicit HiveMap workspace with built-in repository scan profiles.",
  graph_get: "Read the canonical semantic graph for a workspace.",
  repository_index_list: "List persisted repository index job records for one workspace.",
  repository_index_get: "Read one persisted repository index job record by workspace id and index id.",
  repository_index_start: "Persist one explicit repository index job request for the current safe-mode indexing phase.",
  repository_index_execute: "Execute one safe-mode repository index job and persist resolved commit, files, and chunks.",
  repository_search: "Search bounded file and chunk evidence inside one completed repository index.",
  repository_evidence_candidates: "Return bounded repository evidence packets for one scan profile criterion on one completed repository index, plus the effective scan profile, overlay status, coverage summary, and a reminder that scan_profile_overlay_help explains per-repo overlays.",
  scan_boundary_map_build: "Build one candidate boundary-map artifact from the current scan coverage and selected completed repository index facts.",
  scan_profile_overlay_help: "Explain the optional .hivemap/scan-profiles/<profile>.yaml overlay contract, merge rules, template, defaults behavior, and fail-fast validation for one scan profile.",
  concept_embedding_upsert: "Store or refresh one explicit concept embedding for a workspace node and model.",
  concept_embedding_refresh: "Generate or refresh one concept embedding through a configured provider:model ref.",
  concept_embedding_backfill: "Backfill explicit concept embeddings for selected or all concept nodes through a configured provider:model ref.",
  concept_similar_list: "Return bounded read-only similar-concept suggestions for one concept node and model.",
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
  scan_start: "Start an agent-executed scan from one completed repository index and receive derived coverage, effective scan profile, overlay status, coverage warnings, and exact completion instructions.",
  scan_record_coverage: "Replace the derived coverage for an in-progress scan only when one explicit full correction is needed.",
  scan_finding_create: "Create a validated finding node with stable fingerprint, source claims, severity, and origin scan evidence.",
  finding_update: "Update an active finding status or severity; resolved status requires explicit resolution evidence.",
  scan_complete: "Complete a scan only after coverage, every profile criterion, required output, and finding evidence validate.",
  scan_compare: "Compare two completed runs of the same profile and return resolved, open, changed, new, regressed, or unverifiable evidence.",
  workspace_export_zip: "Export a deterministic checksummed .hivemap.zip with canonical workspace state and repeat-scan instructions.",
  workspace_import_zip: "Import a validated .hivemap.zip in explicit new or replace mode without silent merge or id rewriting.",
};

const projectSourceRefSchema = z.object({
  role: z.enum(PROJECT_SOURCE_ROLE_VALUES),
  source: z.enum(PROJECT_SOURCE_TYPE_VALUES),
  target: z.string(),
  anchor: z.string().optional(),
  revision: z.string().optional(),
  label: z.string().optional(),
});

const boundaryMapEntrypointSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(BOUNDARY_ENTRYPOINT_KIND_VALUES),
  filePath: z.string().optional(),
  symbolKey: z.string().optional(),
  sourceRefs: z.array(projectSourceRefSchema).optional(),
});

const boundaryMapBoundarySchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(BOUNDARY_KIND_VALUES),
  ownedPaths: z.array(z.string()),
  ownedSymbolKeys: z.array(z.string()),
  publicEntrypoints: z.array(boundaryMapEntrypointSchema),
  contractSourceRefs: z.array(projectSourceRefSchema),
  testSourceRefs: z.array(projectSourceRefSchema),
  confidence: z.enum(FINDING_CONFIDENCE_VALUES),
  openQuestions: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

const boundaryMapRelationSchema = z.object({
  id: z.string(),
  fromBoundaryId: z.string(),
  toBoundaryId: z.string(),
  kind: z.enum(BOUNDARY_RELATION_KIND_VALUES),
  sourceRefs: z.array(projectSourceRefSchema),
  notes: z.string().optional(),
});

const boundaryMapArtifactSchema = z.object({
  boundaries: z.array(boundaryMapBoundarySchema),
  relations: z.array(boundaryMapRelationSchema),
});

export function createHiveMapMcpServer(runtime: HiveMapRuntime): McpServer {
  const server = new McpServer({
    name: "hivemap",
    version: "0.1.0",
  });

  registerTool(server, runtime, "workspace_list", {
    query: z.string().optional(),
    limit: z.number().int().positive().optional(),
    includeArchived: z.boolean().optional(),
  });

  registerTool(server, runtime, "workspace_get", {
    workspaceId: z.string(),
  });

  registerTool(server, runtime, "workspace_resolve", {
    ref: z.string(),
  });

  registerTool(server, runtime, "project_create", {
    workspace: z.object({
      id: z.string(),
      slug: z.string().optional(),
      name: z.string(),
      archived: z.boolean().optional(),
      createdAt: z.string(),
      updatedAt: z.string().optional(),
    }),
  });

  registerTool(server, runtime, "graph_get", {
    workspaceId: z.string(),
  });

  registerTool(server, runtime, "repository_index_list", {
    workspaceId: z.string(),
  });

  registerTool(server, runtime, "repository_index_get", {
    workspaceId: z.string(),
    indexId: z.string(),
  });

  registerTool(server, runtime, "repository_index_start", {
    workspaceId: z.string(),
    index: z.object({
      id: z.string(),
      repositoryUrl: z.string(),
      requestedRef: z.string().optional(),
      mode: z.enum(["safe", "deep"]),
      requestedAt: z.string(),
      actor: z.object({
        agentId: z.string(),
        tool: z.string(),
      }),
    }),
  });

  registerTool(server, runtime, "repository_index_execute", {
    workspaceId: z.string(),
    indexId: z.string(),
  });

  registerTool(server, runtime, "repository_search", {
    workspaceId: z.string(),
    indexId: z.string(),
    query: z.string(),
    limit: z.number().int().positive().optional(),
  });

  registerTool(server, runtime, "repository_evidence_candidates", {
    workspaceId: z.string(),
    indexId: z.string(),
    profileId: z.string(),
    profileVersion: z.number().int().positive(),
    criterionId: z.string(),
    limit: z.number().int().positive().optional(),
  });

  registerTool(server, runtime, "scan_boundary_map_build", {
    workspaceId: z.string(),
    scanId: z.string(),
  });

  registerTool(server, runtime, "scan_profile_overlay_help", {
    workspaceId: z.string(),
    profileId: z.string(),
    profileVersion: z.number().int().positive(),
  });

  registerTool(server, runtime, "concept_embedding_upsert", {
    workspaceId: z.string(),
    nodeId: z.string(),
    embedding: z.object({
      model: z.string(),
      values: z.array(z.number()),
      updatedAt: z.string(),
    }),
  });

  registerTool(server, runtime, "concept_embedding_refresh", {
    workspaceId: z.string(),
    nodeId: z.string(),
    model: z.string(),
    force: z.boolean().optional(),
  });

  registerTool(server, runtime, "concept_embedding_backfill", {
    workspaceId: z.string(),
    model: z.string(),
    nodeIds: z.array(z.string()).optional(),
    limit: z.number().int().positive().optional(),
    force: z.boolean().optional(),
  });

  registerTool(server, runtime, "concept_similar_list", {
    workspaceId: z.string(),
    nodeId: z.string(),
    model: z.string(),
    limit: z.number().int().positive().optional(),
    minScore: z.number().optional(),
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
      repositoryIndexId: z.string(),
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
    declaredOutputs: z.array(z.enum(["document-inventory", "concept-map", "findings", "coverage-report", "boundary-map"])),
    boundaryMap: boundaryMapArtifactSchema.optional(),
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
      const result = await handleMcpTool(runtime, toolName, args as never);

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
