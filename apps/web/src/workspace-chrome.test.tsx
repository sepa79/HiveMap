// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { ProjectionToolbar } from "./ProjectionToolbar.js";
import { WorkspaceHeader } from "./WorkspaceHeader.js";

afterEach(cleanup);

describe("workspace chrome", () => {
  it("reveals the complete operation error instead of clipping it", async () => {
    const error = "The server rejected this workspace operation because the affected finding reference no longer resolves to an active graph node.";
    const user = userEvent.setup();
    render(<WorkspaceHeader busy={false} error={error} projectionName="Overview" workspaceName="Workspace" />);

    await user.click(screen.getByText("Error"));

    expect(screen.getByRole("alert").textContent).toBe(error);
  });

  it("opens complete projection guidance from the toolbar help control", async () => {
    const user = userEvent.setup();
    render(
      <ProjectionToolbar
        canGoBack={false}
        onBack={() => undefined}
        onQueryChange={() => undefined}
        onToggleDependencies={() => undefined}
        onToggleGroup={() => undefined}
        onToggleVerifications={() => undefined}
        projection={{
          id: "projection-a",
          name: "Findings overview",
          type: "project-map",
          rootNodeIds: [],
          visibleNodeIds: [],
          visibleEdgeIds: [],
          layout: {
            orientationNote: {
              title: "Documentation review map",
              purpose: "Review bounded findings and their evidence.",
              usage: ["Inspect a finding.", "Use Dive in for its focused map."],
            },
          },
        }}
        query=""
        showDependencies
        showVerifications
        visibleGroupIds={new Set()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "About this view" }));

    const help = screen.getByRole("region", { name: "View help" });
    expect(help.textContent).toContain("Documentation review map");
    expect(help.textContent).toContain("Review bounded findings and their evidence.");
    expect(help.textContent).toContain("Use Dive in for its focused map.");
  });
});
