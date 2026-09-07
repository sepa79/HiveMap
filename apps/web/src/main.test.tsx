// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  deleteScan: vi.fn(),
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
const secondWorkspace = {
  id: "workspace-b",
  name: "Pending Workspace",
  createdAt: "2026-08-28T20:00:00.000Z",
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

    await user.click(screen.getByRole("button", { name: "Settings" }));
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
    render(<App />);

    expect(screen.getByRole("button", { name: "Settings" }).getAttribute("aria-current")).toBe("page");
    expect(apiMocks.listWorkspaces).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("API / MCP token"), "operator-token");
    await user.click(screen.getByRole("button", { name: "Set token" }));

    await waitFor(() => expect(screen.getAllByText("Protected Workspace").length).toBeGreaterThan(0));
    expect(screen.getAllByText("Protected Concept").length).toBeGreaterThan(0);
    expect(window.location.search).toBe("?workspace=workspace-a&projection=projection-a");
  });

  it("renders generic projection groups as toolbar filters", async () => {
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

    await waitFor(() => expect(screen.getByRole("button", { name: /Components/ })).toBeTruthy());
    expect(screen.getByRole("button", { name: /Components/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("resets projection-local filters when another workspace uses the same projection id", async () => {
    const user = userEvent.setup();
    const stateA = {
      ...workspaceState,
      projections: [{
        id: "projection-a",
        name: "Shared projection id in A",
        type: "project-map" as const,
        rootNodeIds: ["node-a"],
        visibleNodeIds: ["node-a"],
        visibleEdgeIds: [],
        groups: [{ id: "group-a", label: "Group A", nodeIds: ["node-a"] }],
      }],
    };
    const stateB = {
      ...workspaceState,
      workspace: secondWorkspace,
      graph: { nodes: [{ id: "node-b", label: "Workspace B concept", type: "concept" as const }], edges: [] },
      projections: [{
        id: "projection-a",
        name: "Shared projection id in B",
        type: "project-map" as const,
        rootNodeIds: ["node-b"],
        visibleNodeIds: ["node-b"],
        visibleEdgeIds: [],
        groups: [{ id: "group-b", label: "Group B", nodeIds: ["node-b"] }],
      }],
    };
    apiMocks.listWorkspaces.mockResolvedValue([workspace, secondWorkspace]);
    apiMocks.getWorkspace.mockResolvedValueOnce(stateA).mockResolvedValueOnce(stateB);
    render(<App />);

    const groupA = await screen.findByRole("button", { name: /Group A/ });
    await user.click(groupA);
    await user.type(screen.getByLabelText("Search components"), "stale filter");
    await user.selectOptions(screen.getByLabelText("Workspace"), "workspace-b");
    await user.click(screen.getByRole("button", { name: "Load" }));

    const groupB = await screen.findByRole("button", { name: /Group B/ });
    expect(groupB.getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByLabelText("Search components") as HTMLInputElement).value).toBe("");
    expect(screen.getAllByText("Workspace B concept").length).toBeGreaterThan(0);
  });

  it("keeps the Map view list bounded while exposing every remaining projection", async () => {
    const projections = ["a", "b", "c", "d", "e", "f", "g", "h"].map((suffix) => ({
      id: `projection-${suffix}`,
      name: `Projection ${suffix.toUpperCase()}`,
      type: "overview" as const,
      rootNodeIds: [],
      visibleNodeIds: ["node-a"],
      visibleEdgeIds: [],
    }));
    apiMocks.getWorkspace.mockResolvedValue({ ...workspaceState, projections });
    const user = userEvent.setup();
    const view = render(<App />);

    await waitFor(() => expect(view.container.querySelectorAll(".context-view")).toHaveLength(5));
    const picker = screen.getByLabelText("More saved views") as HTMLSelectElement;
    expect([...picker.options].map((option) => option.text)).toEqual([
      "Open another view…",
      "Projection B",
      "Projection C",
      "Projection D",
    ]);
    await user.selectOptions(picker, "projection-d");
    expect(window.location.search).toBe("?workspace=workspace-a&projection=projection-d");
  });

  it("selects the first finding when reopening an existing findings map", async () => {
    const user = userEvent.setup();
    const finding = {
      id: "finding-a",
      label: "Finding Alpha",
      type: "finding" as const,
      notes: "The finding has review evidence.",
      metadata: {
        sourceRefs: [{ role: "defines" as const, source: "repo-doc", target: "docs/a.md" }],
        finding: {
          fingerprint: "finding-alpha",
          kind: "stale" as const,
          severity: "high" as const,
          confidence: "high" as const,
          status: "open" as const,
          originScanId: "scan-a",
          criterionIds: ["stale-documentation"],
          claims: [{ sourceRefIndex: 0, claim: "The documentation is stale." }],
          affectedNodeIds: ["node-a"],
        },
      },
    };
    apiMocks.getWorkspace.mockResolvedValue({
      ...workspaceState,
      graph: { ...workspaceState.graph, nodes: [...workspaceState.graph.nodes, finding] },
      projections: [
        ...workspaceState.projections,
        {
          id: "findings-overview",
          name: "Findings Overview",
          type: "project-map" as const,
          rootNodeIds: [finding.id],
          visibleNodeIds: [finding.id],
          visibleEdgeIds: [],
          groups: [{ id: "severity-high", label: "High", nodeIds: [finding.id] }],
        },
      ],
    });
    render(<App />);

    await screen.findAllByText("Protected Concept");
    await user.click(screen.getByRole("button", { name: "Findings" }));
    await user.click(screen.getByRole("button", { name: "Open findings map" }));

    expect(window.location.search).toBe("?workspace=workspace-a&projection=findings-overview");
    expect(screen.getByText("Finding review")).toBeTruthy();
    expect(apiMocks.createProjectMap).not.toHaveBeenCalled();
  });

  it("confirms and deletes any scan while presenting coverage as scope", async () => {
    const user = userEvent.setup();
    const scanState = {
      ...workspaceState,
      scanRuns: [{
        id: "scan-old",
        profileId: "code-quality-review",
        profileVersion: 1,
        repository: { root: "index:repo-a", repositoryIndexId: "repo-a", branch: "main" },
        actor: { agentId: "agent-a", tool: "codex" },
        startedAt: "2026-09-01T10:00:00.000Z",
        status: "in_progress" as const,
        coverage: {
          discovered: ["src/a.ts", "docs/a.md"],
          included: ["src/a.ts"],
          excluded: [{ target: "docs/a.md", reason: "Out of profile scope" }],
          failed: [],
        },
        appliedCriteria: [],
        declaredOutputs: [],
        findingNodeIds: ["finding-a", "finding-b"],
        calibrationDecisions: [],
      }],
    };
    apiMocks.getWorkspace.mockResolvedValueOnce(scanState).mockResolvedValueOnce(workspaceState);
    apiMocks.listWorkspaces.mockResolvedValue([workspace, secondWorkspace]);
    apiMocks.deleteScan.mockResolvedValue({
      deletedScanId: "scan-old",
      deletedFindingNodeIds: [],
      deletedEdgeIds: [],
      deletedProjectionIds: [],
    });
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    render(<App />);

    await waitFor(() => expect(screen.getAllByText("Protected Workspace").length).toBeGreaterThan(0));
    await user.selectOptions(screen.getByLabelText("Workspace"), "workspace-b");
    await user.click(screen.getByRole("button", { name: "Scans" }));
    expect(screen.getByText("draft")).toBeTruthy();
    expect(screen.getByText("1 included · 1 excluded")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Delete scan" }));

    expect(confirm).toHaveBeenCalledWith("Delete scan scan-old and all findings owned by it? This cannot be undone.");
    expect(apiMocks.deleteScan).toHaveBeenCalledWith("workspace-a", "scan-old");
    await waitFor(() => expect(screen.queryByText("scan-old")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Map" }));
    expect((screen.getByLabelText("Workspace") as HTMLSelectElement).value).toBe("workspace-a");
  });

  it("serializes browser navigation behind an active scan deletion", async () => {
    const user = userEvent.setup();
    let finishDeletion!: () => void;
    const deletionPending = new Promise<void>((resolve) => { finishDeletion = resolve; });
    const scanState = {
      ...workspaceState,
      scanRuns: [{
        id: "scan-pending-delete",
        profileId: "code-quality-review",
        profileVersion: 1,
        repository: { root: "index:repo-a", repositoryIndexId: "repo-a" },
        actor: { agentId: "agent-a", tool: "codex" },
        startedAt: "2026-09-02T10:00:00.000Z",
        status: "in_progress" as const,
        appliedCriteria: [],
        declaredOutputs: [],
        findingNodeIds: [],
        calibrationDecisions: [],
      }],
    };
    const stateB = {
      ...workspaceState,
      workspace: secondWorkspace,
      graph: { nodes: [{ id: "node-b", label: "Workspace B concept", type: "concept" as const }], edges: [] },
    };
    apiMocks.listWorkspaces.mockResolvedValue([workspace, secondWorkspace]);
    apiMocks.getWorkspace
      .mockResolvedValueOnce(scanState)
      .mockResolvedValueOnce(workspaceState)
      .mockResolvedValueOnce(stateB);
    apiMocks.deleteScan.mockImplementation(async () => {
      await deletionPending;
      return { deletedScanId: "scan-pending-delete", deletedFindingNodeIds: [], deletedEdgeIds: [], deletedProjectionIds: [] };
    });
    vi.stubGlobal("confirm", vi.fn(() => true));
    const view = render(<App />);

    await screen.findAllByText("Protected Concept");
    await user.click(screen.getByRole("button", { name: "Scans" }));
    await user.click(screen.getByRole("button", { name: "Delete scan" }));
    const app = view.container.querySelector("main");
    expect(app?.getAttribute("aria-busy")).toBe("true");
    expect(app?.hasAttribute("inert")).toBe(true);

    window.history.replaceState({ hivemapDepth: 0 }, "", "/?workspace=workspace-b&projection=projection-a");
    fireEvent(window, new PopStateEvent("popstate", { state: { hivemapDepth: 0 } }));
    expect(apiMocks.getWorkspace).toHaveBeenCalledTimes(1);

    finishDeletion();
    await waitFor(() => expect(screen.getAllByText("Workspace B concept").length).toBeGreaterThan(0));
    expect(apiMocks.getWorkspace).toHaveBeenCalledTimes(3);
    expect(app?.getAttribute("aria-busy")).toBe("false");
    expect(app?.hasAttribute("inert")).toBe(false);
    expect(window.location.search).toBe("?workspace=workspace-b&projection=projection-a");
  });
});
