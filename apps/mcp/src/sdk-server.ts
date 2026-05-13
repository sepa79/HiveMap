import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

import { HiveMapRuntime } from "@hivemap/runtime";

import { handleMcpTool, type McpToolFailure, type McpToolName, type McpToolResponseMap } from "./index.js";

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
      description: `HiveMap ${toolName} operation.`,
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
