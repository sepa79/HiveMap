/**
 * Responsibility: Exercise public UI, authenticated REST, Streamable HTTP MCP, and repository-index workflows against one running HiveMap runtime.
 * Must not: Start containers, mutate deployment configuration, or inspect storage implementation details.
 * Contract: Fails on the first observable contract violation and leaves durable acceptance fixtures for restart checks.
 */
import assert from "node:assert/strict";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const baseUrl = requireEnvironment("HIVEMAP_ACCEPTANCE_BASE_URL").replace(/\/$/, "");
const authToken = requireEnvironment("HIVEMAP_ACCEPTANCE_AUTH_TOKEN");
const repositoryUrl = requireEnvironment("HIVEMAP_ACCEPTANCE_REPOSITORY_URL");
const repositoryRef = requireEnvironment("HIVEMAP_ACCEPTANCE_REPOSITORY_REF");
const repositoryQuery = requireEnvironment("HIVEMAP_ACCEPTANCE_REPOSITORY_QUERY");

const workspaceId = "acceptance-workspace";
const repositoryIndexId = "acceptance-index";
const interruptedRepositoryIndexId = "acceptance-interrupted-index";

await verifyPublicAndProtectedBoundaries();

const client = new Client({ name: "hivemap-acceptance", version: "0.1.0" });
const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
  requestInit: { headers: { authorization: `Bearer ${authToken}` } },
});

try {
  await client.connect(transport);
  await exerciseMcpAndRest(client);
  await exerciseRepositoryBoundaries();
  await exerciseRepositoryIndex(client);
  await createInterruptedRecoveryFixture();
} finally {
  await client.close();
}

process.stdout.write("runtime-smoke=passed\n");

async function verifyPublicAndProtectedBoundaries() {
  const health = await request("/health", { authenticated: false });
  assert.equal(health.status, 200);
  assert.deepEqual(health.json, { status: "ok" });

  const ui = await request("/", { authenticated: false });
  assert.equal(ui.status, 200);
  assert.match(ui.contentType, /^text\/html/);
  assert.match(ui.text, /<div id="root"><\/div>/);

  const unauthorizedRest = await request("/workspaces", { authenticated: false });
  assert.equal(unauthorizedRest.status, 401);
  assert.equal(unauthorizedRest.json?.error?.code, "UNAUTHORIZED");

  const unauthorizedMcp = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
  assert.equal(unauthorizedMcp.status, 401);
}

async function exerciseMcpAndRest(client) {
  const tools = await client.listTools();
  assert(tools.tools.some((tool) => tool.name === "project_create"));
  assert(tools.tools.some((tool) => tool.name === "repository_index_execute"));

  assertMcpSuccess(await client.callTool({
    name: "project_create",
    arguments: {
      workspace: {
        id: workspaceId,
        slug: "acceptance-workspace",
        name: "Acceptance Workspace",
        createdAt: "2026-09-01T10:00:00.000Z",
      },
    },
  }), "project_create");

  assertMcpSuccess(await client.callTool({
    name: "graph_command",
    arguments: {
      workspaceId,
      commands: [
        {
          id: "acceptance-node-create",
          type: "node.create",
          payload: { node: { id: "acceptance-node", label: "Acceptance Node", type: "concept" } },
        },
      ],
    },
  }), "graph_command");

  const graph = await request(`/workspaces/${workspaceId}/graph`);
  assert.equal(graph.status, 200);
  assert(graph.json.graph.nodes.some((node) => node.id === "acceptance-node"));

  const projection = await request(`/workspaces/${workspaceId}/projections`, {
    method: "POST",
    body: { input: { id: "acceptance-projection", name: "Acceptance Overview", maxNodes: 10 } },
  });
  assert.equal(projection.status, 201);
  assert(projection.json.projection.visibleNodeIds.includes("acceptance-node"));

  const persistedProjection = await request(`/workspaces/${workspaceId}/projections/acceptance-projection`);
  assert.equal(persistedProjection.status, 200);
  assert.equal(persistedProjection.json.projection.id, "acceptance-projection");
}

async function exerciseRepositoryBoundaries() {
  const invalidSources = [
    "ssh://git@example.com/org/repo.git",
    "git@example.com:org/repo.git",
    "http://example.com/org/repo.git",
    "file:///srv/repo",
    "/srv/repo",
    "https://user:password@example.com/org/repo.git",
    "https://example.com/org/repo.git?token=secret",
    "https://example.com/org/repo.git#main",
  ];

  for (const [offset, invalidSource] of invalidSources.entries()) {
    const response = await startRepositoryIndex({
      id: `rejected-index-${offset}`,
      repositoryUrl: invalidSource,
    });
    assert.equal(response.status, 400, `Expected ${invalidSource} to be rejected`);
  }

  const unsafeRef = await startRepositoryIndex({
    id: "rejected-index-ref",
    repositoryUrl,
    requestedRef: "--upload-pack=malicious",
  });
  assert.equal(unsafeRef.status, 400);

  const list = await request(`/workspaces/${workspaceId}/repository-indexes`);
  assert.equal(list.status, 200);
  assert.equal(list.json.indexes.length, 0, "Rejected repository inputs must not create jobs");
}

async function exerciseRepositoryIndex(client) {
  const started = await startRepositoryIndex({
    id: repositoryIndexId,
    repositoryUrl,
    requestedRef: repositoryRef,
  });
  assert.equal(started.status, 201);
  assert.equal(started.json.index.stage, "requested");

  const executionPath = `/workspaces/${workspaceId}/repository-indexes/${repositoryIndexId}/execute`;
  const [firstExecution, duplicateExecution] = await Promise.all([
    request(executionPath, { method: "POST", body: {} }),
    request(executionPath, { method: "POST", body: {} }),
  ]);
  const responses = [firstExecution, duplicateExecution];
  const completed = responses.find((response) => response.status === 200);
  const rejected = responses.find((response) => response.status === 409);
  assert(completed, "One concurrent execution must complete");
  assert.equal(completed.json.index.stage, "completed");
  assert.match(completed.json.index.resolvedCommit, /^[0-9a-f]{40}$/);
  assert(completed.json.index.stats.fileCount > 0);
  assert(rejected, "The duplicate concurrent execution must be rejected");
  assert.equal(rejected.json.error.code, "REPOSITORY_INDEX_ALREADY_RUNNING");

  const search = await request(
    `/workspaces/${workspaceId}/repository-indexes/${repositoryIndexId}/search?query=${encodeURIComponent(repositoryQuery)}&limit=5`,
  );
  assert.equal(search.status, 200);
  assert(search.json.hits.length > 0);

  const evidence = await request(
    `/workspaces/${workspaceId}/repository-indexes/${repositoryIndexId}/evidence-candidates?profileId=documentation-conflicts&profileVersion=1&criterionId=broken-references&limit=5`,
  );
  assert.equal(evidence.status, 200);
  assert.equal(evidence.json.indexId, repositoryIndexId);
  assert(Array.isArray(evidence.json.candidates));

  const scanResult = assertMcpSuccess(await client.callTool({
    name: "scan_start",
    arguments: {
      workspaceId,
      scan: {
        id: "acceptance-scan",
        profileId: "documentation-conflicts",
        profileVersion: 1,
        repositoryIndexId,
        actor: { agentId: "acceptance-agent", tool: "acceptance" },
        startedAt: "2026-09-01T10:05:00.000Z",
      },
    },
  }), "scan_start");
  assert.equal(scanResult.value.run.status, "in_progress");
  assert.equal(scanResult.value.run.repository.repositoryIndexId, repositoryIndexId);

  const scans = await request(`/workspaces/${workspaceId}/scans`);
  assert.equal(scans.status, 200);
  assert(scans.json.runs.some((run) => run.id === "acceptance-scan"));
}

async function createInterruptedRecoveryFixture() {
  const response = await startRepositoryIndex({
    id: interruptedRepositoryIndexId,
    repositoryUrl,
    requestedRef: repositoryRef,
  });
  assert.equal(response.status, 201);
}

async function startRepositoryIndex({ id, repositoryUrl: source, requestedRef }) {
  return request(`/workspaces/${workspaceId}/repository-indexes`, {
    method: "POST",
    body: {
      index: {
        id,
        repositoryUrl: source,
        ...(requestedRef === undefined ? {} : { requestedRef }),
        mode: "safe",
        requestedAt: "2026-09-01T10:01:00.000Z",
        actor: { agentId: "acceptance-agent", tool: "acceptance" },
      },
    },
  });
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers);
  if (options.authenticated !== false) {
    headers.set("authorization", `Bearer ${authToken}`);
  }
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  return {
    status: response.status,
    contentType,
    text,
    json: contentType.includes("application/json") && text.length > 0 ? JSON.parse(text) : undefined,
  };
}

function assertMcpSuccess(result, toolName) {
  assert.notEqual(result.isError, true, `${toolName} returned an MCP error: ${JSON.stringify(result.content)}`);
  assert.equal(result.structuredContent?.ok, true, `${toolName} returned a failed operation envelope`);
  assert.equal(result.structuredContent?.tool, toolName);
  return result.structuredContent;
}

function requireEnvironment(name) {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}
