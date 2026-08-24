const API_BASE_URL = import.meta.env.VITE_HIVEMAP_API_URL ?? "http://127.0.0.1:8787";

export type GraphNodeType =
  | "concept"
  | "decision"
  | "risk"
  | "question"
  | "evidence"
  | "component"
  | "system"
  | "role"
  | "pattern"
  | "finding";

export type GraphNode = {
  id: string;
  label: string;
  type: GraphNodeType;
  notes?: string;
  metadata?: Record<string, unknown> & {
    sourceRefs?: ProjectSourceRef[];
    finding?: FindingMetadata;
  };
};

export type FindingMetadata = {
  fingerprint: string;
  kind:
    | "conflict"
    | "stale"
    | "missing"
    | "ambiguous"
    | "broken-reference"
    | "duplicate-authority"
    | "implementation-drift"
    | "quality-problem"
    | "architecture-risk"
    | "runtime-risk"
    | "authority-gap"
    | "test-gap"
    | "deployment-risk";
  severity: "low" | "normal" | "high" | "critical";
  confidence: "low" | "medium" | "high";
  status: "open" | "acknowledged" | "proposed-fix" | "resolved" | "accepted" | "unverifiable";
  originScanId: string;
  criterionIds: string[];
  claims: Array<{ sourceRefIndex: number; claim: string }>;
  affectedNodeIds: string[];
  expectedOwner?: string;
  recommendedAction?: string;
  resolutionEvidence?: string;
};

export type ScanProfile = {
  id: string;
  version: number;
  name: string;
  description: string;
};

export type ScanRun = {
  id: string;
  profileId: string;
  profileVersion: number;
  status: "in_progress" | "completed";
  startedAt: string;
  completedAt?: string;
  findingNodeIds: string[];
  coverage?: {
    discovered: string[];
    included: string[];
    excluded: Array<{ target: string; reason: string }>;
    failed: Array<{ target: string; reason: string }>;
  };
};

export type ProjectSourceRef = {
  role: "defines" | "depends-on" | "implements" | "verifies" | "illustrates" | "decides" | "discusses" | "tracks";
  source: "repo-doc" | "code" | "test" | "asset" | "hivemind";
  target: string;
  anchor?: string;
  revision?: string;
  label?: string;
};

export type GraphEdge = {
  id: string;
  from: string;
  to: string;
  relation: string;
  label?: string;
};

export type SemanticGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type Projection = {
  id: string;
  name: string;
  type: "conversation-map" | "project-map" | "overview" | "dive-in";
  rootNodeIds: string[];
  visibleNodeIds: string[];
  visibleEdgeIds: string[];
  groups?: Array<{
    id: string;
    label: string;
    nodeIds: string[];
    categoryIds?: string[];
  }>;
  layout?: {
    orientationNote?: {
      title: string;
      purpose: string;
      usage: string[];
    };
    [key: string]: unknown;
  };
};

export type ProjectionGroup = NonNullable<Projection["groups"]>[number];

export type CategoryAssignment = {
  id: string;
  targetType: "node" | "edge" | "projection";
  targetId: string;
  categoryId: string;
  status: "active" | "superseded";
  provenance: "human" | "agent" | "system";
  notes?: string;
};

export type FeedbackEvent = {
  id: string;
  createdAt: string;
  type:
    | "node_moved"
    | "node_marked"
    | "edge_marked"
    | "map_comment"
    | "group_requested"
    | "dive_in_requested"
    | "proposal_requested";
  payload: Record<string, unknown>;
  projectionId?: string;
};

export type GraphCommand =
  | {
      id: string;
      type: "node.create";
      payload: { node: GraphNode };
    }
  | {
      id: string;
      type: "edge.create";
      payload: { edge: GraphEdge };
    };

export type GraphProposal = {
  id: string;
  createdAt: string;
  sourceFeedbackIds: string[];
  graphCommands: GraphCommand[];
  explanation: string;
  riskCategoryImpact?: string;
  status: "pending" | "approved" | "rejected" | "applied" | "superseded";
};

export type WorkspaceState = {
  workspace: {
    id: string;
    slug?: string;
    name: string;
    archived?: boolean;
    createdAt: string;
    updatedAt?: string;
  };
  graph: SemanticGraph;
  categoryAssignments: CategoryAssignment[];
  feedbackEvents: FeedbackEvent[];
  proposals: GraphProposal[];
  projections: Projection[];
  scanProfiles: ScanProfile[];
  scanRuns: ScanRun[];
};

export type WorkspaceRecord = WorkspaceState["workspace"];

export async function listWorkspaces(): Promise<WorkspaceRecord[]> {
  const response = await request<{ workspaces: WorkspaceRecord[] }>("/workspaces");
  return response.workspaces;
}

export async function createWorkspace(workspace: WorkspaceState["workspace"]): Promise<void> {
  await request("/workspaces", {
    method: "POST",
    body: { workspace },
  });
}

export async function getWorkspace(workspaceId: string): Promise<WorkspaceState> {
  const response = await request<{ state: WorkspaceState }>(`/workspaces/${workspaceId}`);
  return response.state;
}

export async function downloadWorkspaceBundle(workspaceId: string, exportedAt: string): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/workspaces/${encodeURIComponent(workspaceId)}/export-bundle`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ exportedAt }),
  });
  if (!response.ok) throw await responseError(response);
  return response.blob();
}

export async function importWorkspaceBundle(
  file: File,
  mode: "new" | "replace",
): Promise<WorkspaceRecord> {
  const response = await fetch(`${API_BASE_URL}/workspace-import-bundles?mode=${mode}`, {
    method: "POST",
    headers: { "content-type": "application/zip" },
    body: file,
  });
  if (!response.ok) throw await responseError(response);
  return ((await response.json()) as { workspace: WorkspaceRecord }).workspace;
}

export async function createNode(workspaceId: string, node: GraphNode): Promise<SemanticGraph> {
  const response = await request<{ graph: SemanticGraph }>(`/workspaces/${workspaceId}/commands`, {
    method: "POST",
    body: {
      commands: [
        {
          id: `cmd-${node.id}`,
          type: "node.create",
          payload: { node },
        },
      ],
    },
  });
  return response.graph;
}

export async function createEdge(workspaceId: string, edge: GraphEdge): Promise<SemanticGraph> {
  const response = await request<{ graph: SemanticGraph }>(`/workspaces/${workspaceId}/commands`, {
    method: "POST",
    body: {
      commands: [
        {
          id: `cmd-${edge.id}`,
          type: "edge.create",
          payload: { edge },
        },
      ],
    },
  });
  return response.graph;
}

export async function createOverview(workspaceId: string, maxNodes: number): Promise<Projection> {
  const response = await request<{ projection: Projection }>(`/workspaces/${workspaceId}/projections`, {
    method: "POST",
    body: {
      input: {
        id: `projection-overview-${Date.now()}`,
        name: "Overview",
        maxNodes,
      },
    },
  });
  return response.projection;
}

export async function createDiveIn(workspaceId: string, rootNodeId: string): Promise<Projection> {
  const response = await request<{ projection: Projection }>(`/workspaces/${workspaceId}/projections`, {
    method: "POST",
    body: {
      input: {
        id: `projection-dive-${rootNodeId}-${Date.now()}`,
        name: `Dive-In ${rootNodeId}`,
        rootNodeId,
      },
    },
  });
  return response.projection;
}

export async function createProjectMap(
  workspaceId: string,
  rootNodeIds: string[],
  visibleNodeIds: string[],
  options?: { name?: string; groups?: ProjectionGroup[]; layout?: Projection["layout"] },
): Promise<Projection> {
  const response = await request<{ projection: Projection }>(`/workspaces/${workspaceId}/projections`, {
    method: "POST",
    body: {
      input: {
        id: `projection-project-${Date.now()}`,
        name: options?.name ?? "Project Map",
        type: "project-map",
        rootNodeIds,
        visibleNodeIds,
        ...(options?.groups === undefined ? {} : { groups: options.groups }),
        ...(options?.layout === undefined ? {} : { layout: options.layout }),
      },
    },
  });
  return response.projection;
}

export async function recordFeedback(workspaceId: string, feedbackEvent: FeedbackEvent): Promise<FeedbackEvent[]> {
  const response = await request<{ feedbackEvents: FeedbackEvent[] }>(`/workspaces/${workspaceId}/feedback`, {
    method: "POST",
    body: { feedbackEvent },
  });
  return response.feedbackEvents;
}

export async function assignCategory(
  workspaceId: string,
  assignment: CategoryAssignment,
): Promise<CategoryAssignment[]> {
  const response = await request<{ assignments: CategoryAssignment[] }>(
    `/workspaces/${workspaceId}/category-assignments`,
    {
      method: "POST",
      body: { assignment },
    },
  );
  return response.assignments;
}

export async function createProposal(workspaceId: string, proposal: GraphProposal): Promise<GraphProposal> {
  const response = await request<{ proposal: GraphProposal }>(`/workspaces/${workspaceId}/proposals`, {
    method: "POST",
    body: { proposal },
  });
  return response.proposal;
}

export async function approveProposal(workspaceId: string, proposalId: string): Promise<GraphProposal> {
  const response = await request<{ proposal: GraphProposal }>(
    `/workspaces/${workspaceId}/proposals/${proposalId}/approve`,
    { method: "POST", body: {} },
  );
  return response.proposal;
}

export async function applyProposal(workspaceId: string, proposalId: string): Promise<GraphProposal> {
  const response = await request<{ proposal: GraphProposal }>(
    `/workspaces/${workspaceId}/proposals/${proposalId}/apply`,
    { method: "POST", body: {} },
  );
  return response.proposal;
}

export async function rejectProposal(workspaceId: string, proposalId: string): Promise<GraphProposal> {
  const response = await request<{ proposal: GraphProposal }>(
    `/workspaces/${workspaceId}/proposals/${proposalId}/reject`,
    { method: "POST", body: {} },
  );
  return response.proposal;
}

async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const init: RequestInit = {
    method: options.method ?? "GET",
  };

  if (options.body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, init);

  const body = (await response.json()) as T | { error: { message: string } };
  if (!response.ok) {
    const error = body as { error?: { message?: string } };
    throw new Error(error.error?.message ?? `HiveMap API request failed: ${response.status}`);
  }

  return body as T;
}

async function responseError(response: Response): Promise<Error> {
  const body = (await response.json()) as { error?: { message?: string } };
  return new Error(body.error?.message ?? `HiveMap API request failed: ${response.status}`);
}
