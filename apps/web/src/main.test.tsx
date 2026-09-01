// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  applyProposal: vi.fn(),
  approveProposal: vi.fn(),
  assignCategory: vi.fn(),
  createDiveIn: vi.fn(),
  createEdge: vi.fn(),
  createNode: vi.fn(),
  createOverview: vi.fn(),
  createProjectMap: vi.fn(),
  createProposal: vi.fn(),
  createWorkspace: vi.fn(),
  getWorkspace: vi.fn(),
  listWorkspaces: vi.fn(),
  recordFeedback: vi.fn(),
  rejectProposal: vi.fn(),
}));

vi.mock("./api.js", () => apiMocks);
vi.mock("react-dom/client", () => ({ createRoot: () => ({ render: vi.fn() }) }));

import { clearAuthToken, setAuthToken } from "./auth-token.js";
import { App } from "./main.js";

const workspace = {
  id: "workspace-a",
  name: "Protected Workspace",
  createdAt: "2026-08-28T19:00:00.000Z",
};

const workspaceState = {
  workspace,
  graph: {
    nodes: [{ id: "node-a", label: "Protected Concept", type: "concept" as const }],
    edges: [],
  },
  categoryAssignments: [],
  feedbackEvents: [],
  proposals: [],
  projections: [
    {
      id: "projection-a",
      name: "Protected Projection",
      type: "overview" as const,
      rootNodeIds: [],
      visibleNodeIds: ["node-a"],
      visibleEdgeIds: [],
    },
  ],
  scanProfiles: [],
  scanRuns: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("ResizeObserver", class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  });
  setAuthToken("operator-token");
  window.history.replaceState({}, "", "/?workspace=workspace-a&projection=projection-a");
  apiMocks.listWorkspaces.mockResolvedValue([workspace]);
  apiMocks.getWorkspace.mockResolvedValue(workspaceState);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  clearAuthToken();
  window.history.replaceState({}, "", "/");
});

describe("App token lifecycle", () => {
  it("clears protected workspace state and URL parameters without an unauthenticated refresh", async () => {
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(screen.getAllByText("Protected Workspace").length).toBeGreaterThan(0));
    expect(apiMocks.listWorkspaces).toHaveBeenCalledOnce();
    expect(apiMocks.getWorkspace).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("button", { name: "Clear token" }));

    expect(screen.queryByText("Protected Workspace")).toBeNull();
    expect(screen.queryByText("Protected Concept")).toBeNull();
    expect(screen.getByText("AI-assisted concept graph")).toBeTruthy();
    expect(window.location.search).toBe("");
    expect(apiMocks.listWorkspaces).toHaveBeenCalledOnce();
    expect(apiMocks.getWorkspace).toHaveBeenCalledOnce();
  });

  it("loads a protected projection deep link after the token is set", async () => {
    const user = userEvent.setup();
    clearAuthToken();
    apiMocks.listWorkspaces.mockRejectedValueOnce(new Error("Unauthorized"));
    render(<App />);

    await waitFor(() => expect(screen.getAllByText("Unauthorized").length).toBeGreaterThan(0));
    await user.type(screen.getByLabelText("API / MCP token"), "operator-token");
    await user.click(screen.getByRole("button", { name: "Set token" }));

    await waitFor(() => expect(screen.getAllByText("Protected Workspace").length).toBeGreaterThan(0));
    expect(screen.getAllByText("Protected Concept").length).toBeGreaterThan(0);
    expect(window.location.search).toBe("?workspace=workspace-a&projection=projection-a");
  });

  it("labels generic projection groups as items instead of findings", async () => {
    apiMocks.getWorkspace.mockResolvedValue({
      ...workspaceState,
      projections: [{
        id: "projection-a",
        name: "Protected Projection",
        type: "project-map",
        rootNodeIds: ["node-a"],
        visibleNodeIds: ["node-a"],
        visibleEdgeIds: [],
        groups: [{ id: "components", label: "Components", nodeIds: ["node-a"] }],
      }],
    });
    render(<App />);

    await waitFor(() => expect(screen.getByText(/1 item/)).toBeTruthy());
    expect(screen.queryByText(/1 finding/)).toBeNull();
  });
});
