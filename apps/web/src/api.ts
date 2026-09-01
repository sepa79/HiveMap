/**
 * Responsibility: Expose the typed browser client for HiveMap REST operations.
 * Must not: Render UI, own semantic state, or persist authentication credentials.
 * Contract: Sends explicit REST requests and exposes canonical typed response shapes.
 */
import type {
  ApplyGraphCommandsResponse,
  ApplyProposalResponse,
  ApproveProposalResponse,
  AssignCategoryResponse,
  CreateProjectionResponse,
  CreateProposalResponse,
  CreateWorkspaceRequest,
  GetWorkspaceResponse,
  ListWorkspacesResponse,
  RecordFeedbackResponse,
  RejectProposalResponse,
} from "@hivemap/api-contracts";
import type { FeedbackEvent, GraphProposal } from "@hivemap/capture";
import type { CategoryAssignment } from "@hivemap/categories";
import type {
  GraphEdge,
  GraphNode,
  GraphNodeType,
  ProjectSourceRef,
  SemanticGraph,
} from "@hivemap/graph-core";
import type { Projection, ProjectionGroup } from "@hivemap/projections";
import type { FindingMetadata, ScanProfile, ScanRun } from "@hivemap/scans";
import type { WorkspaceRecord, WorkspaceState } from "@hivemap/storage";

import { getAuthToken } from "./auth-token.js";

const API_BASE_URL = import.meta.env.VITE_HIVEMAP_API_URL
  ?? (import.meta.env.DEV ? "http://127.0.0.1:8787" : window.location.origin);

export type {
  CategoryAssignment,
  FeedbackEvent,
  FindingMetadata,
  GraphEdge,
  GraphNode,
  GraphNodeType,
  GraphProposal,
  Projection,
  ProjectionGroup,
  ProjectSourceRef,
  ScanProfile,
  ScanRun,
  SemanticGraph,
  WorkspaceRecord,
  WorkspaceState,
};

export async function listWorkspaces(): Promise<WorkspaceRecord[]> {
  const response = await request<ListWorkspacesResponse>("/workspaces");
  return response.workspaces;
}

export async function createWorkspace(workspace: CreateWorkspaceRequest["workspace"]): Promise<void> {
  await request("/workspaces", {
    method: "POST",
    body: { workspace },
  });
}

export async function getWorkspace(workspaceId: string): Promise<WorkspaceState> {
  const response = await request<GetWorkspaceResponse>(`/workspaces/${workspaceId}`);
  return response.state;
}

export async function createNode(workspaceId: string, node: GraphNode): Promise<SemanticGraph> {
  const response = await request<ApplyGraphCommandsResponse>(`/workspaces/${workspaceId}/commands`, {
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
  const response = await request<ApplyGraphCommandsResponse>(`/workspaces/${workspaceId}/commands`, {
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
  const response = await request<CreateProjectionResponse>(`/workspaces/${workspaceId}/projections`, {
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
  const response = await request<CreateProjectionResponse>(`/workspaces/${workspaceId}/projections`, {
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
  const response = await request<CreateProjectionResponse>(`/workspaces/${workspaceId}/projections`, {
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
  const response = await request<RecordFeedbackResponse>(`/workspaces/${workspaceId}/feedback`, {
    method: "POST",
    body: { feedbackEvent },
  });
  return response.feedbackEvents;
}

export async function assignCategory(
  workspaceId: string,
  assignment: CategoryAssignment,
): Promise<CategoryAssignment[]> {
  const response = await request<AssignCategoryResponse>(
    `/workspaces/${workspaceId}/category-assignments`,
    {
      method: "POST",
      body: { assignment },
    },
  );
  return response.assignments;
}

export async function createProposal(workspaceId: string, proposal: GraphProposal): Promise<GraphProposal> {
  const response = await request<CreateProposalResponse>(`/workspaces/${workspaceId}/proposals`, {
    method: "POST",
    body: { proposal },
  });
  return response.proposal;
}

export async function approveProposal(workspaceId: string, proposalId: string): Promise<GraphProposal> {
  const response = await request<ApproveProposalResponse>(
    `/workspaces/${workspaceId}/proposals/${proposalId}/approve`,
    { method: "POST", body: {} },
  );
  return response.proposal;
}

export async function applyProposal(workspaceId: string, proposalId: string): Promise<GraphProposal> {
  const response = await request<ApplyProposalResponse>(
    `/workspaces/${workspaceId}/proposals/${proposalId}/apply`,
    { method: "POST", body: {} },
  );
  return response.proposal;
}

export async function rejectProposal(workspaceId: string, proposalId: string): Promise<GraphProposal> {
  const response = await request<RejectProposalResponse>(
    `/workspaces/${workspaceId}/proposals/${proposalId}/reject`,
    { method: "POST", body: {} },
  );
  return response.proposal;
}

async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const init: RequestInit = {
    method: options.method ?? "GET",
    headers: requestHeaders(),
  };

  if (options.body !== undefined) {
    init.headers = requestHeaders({ "content-type": "application/json" });
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

function requestHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const authToken = getAuthToken();
  return authToken.length === 0
    ? extra
    : { ...extra, authorization: `Bearer ${authToken}` };
}

async function responseError(response: Response): Promise<Error> {
  const body = (await response.json()) as { error?: { message?: string } };
  return new Error(body.error?.message ?? `HiveMap API request failed: ${response.status}`);
}
