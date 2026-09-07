/**
 * Responsibility: Verify durable application state and explicit interrupted-index recovery after a runtime restart.
 * Must not: Start or stop containers, modify database rows, or exercise unrelated creation flows.
 * Contract: Reads fixtures created by runtime-smoke and completes the one index marked interrupted by the outer harness.
 */
import assert from "node:assert/strict";

const baseUrl = requireEnvironment("HIVEMAP_ACCEPTANCE_BASE_URL").replace(/\/$/, "");
const authToken = requireEnvironment("HIVEMAP_ACCEPTANCE_AUTH_TOKEN");
const workspaceId = "acceptance-workspace";

const workspace = await request(`/workspaces/${workspaceId}`);
assert.equal(workspace.status, 200);
assert.equal(workspace.json.state.workspace.name, "Acceptance Workspace");

const graph = await request(`/workspaces/${workspaceId}/graph`);
assert.equal(graph.status, 200);
assert(graph.json.graph.nodes.some((node) => node.id === "acceptance-node"));

const projection = await request(`/workspaces/${workspaceId}/projections/acceptance-projection`);
assert.equal(projection.status, 200);
assert(projection.json.projection.visibleNodeIds.includes("acceptance-node"));

const completedIndex = await request(`/workspaces/${workspaceId}/repository-indexes/acceptance-index`);
assert.equal(completedIndex.status, 200);
assert.equal(completedIndex.json.index.stage, "completed");

const scans = await request(`/workspaces/${workspaceId}/scans`);
assert.equal(scans.status, 200);
assert(scans.json.runs.some((run) => run.id === "acceptance-scan"));

const interruptedBeforeRecovery = await request(
  `/workspaces/${workspaceId}/repository-indexes/acceptance-interrupted-index`,
);
assert.equal(interruptedBeforeRecovery.status, 200);
assert.equal(interruptedBeforeRecovery.json.index.stage, "checking_out");

const recovered = await request(
  `/workspaces/${workspaceId}/repository-indexes/acceptance-interrupted-index/execute`,
  { method: "POST", body: {} },
);
assert.equal(recovered.status, 200);
assert.equal(recovered.json.index.stage, "completed");
assert.match(recovered.json.index.resolvedCommit, /^[0-9a-f]{40}$/);

process.stdout.write("runtime-restart-smoke=passed\n");

async function request(path, options = {}) {
  const headers = new Headers({ authorization: `Bearer ${authToken}` });
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
    json: contentType.includes("application/json") && text.length > 0 ? JSON.parse(text) : undefined,
  };
}

function requireEnvironment(name) {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }
  return value;
}
