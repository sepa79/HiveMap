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
  | "pattern";

export type GraphNode = {
  id: string;
  label: string;
  type: GraphNodeType;
  notes?: string;
  metadata?: Record<string, unknown>;
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
  type: "conversation-map" | "project-map" | "overview" | "dive-in" | "snapshot";
  rootNodeIds: string[];
  visibleNodeIds: string[];
  visibleEdgeIds: string[];
};

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

export type SnapshotRecord = {
  id: string;
  createdAt: string;
  projectionId?: string;
  graph: SemanticGraph;
  projection: Projection;
};

export type WorkspaceState = {
  workspace: {
    id: string;
    name: string;
    createdAt: string;
  };
  graph: SemanticGraph;
  categoryAssignments: CategoryAssignment[];
  feedbackEvents: FeedbackEvent[];
  proposals: GraphProposal[];
  projections: Projection[];
  snapshots: SnapshotRecord[];
};

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

export async function createSnapshot(
  workspaceId: string,
  snapshot: { id: string; createdAt: string; projectionId: string },
): Promise<SnapshotRecord> {
  const response = await request<{ snapshot: SnapshotRecord }>(`/workspaces/${workspaceId}/snapshots`, {
    method: "POST",
    body: { snapshot },
  });
  return response.snapshot;
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
