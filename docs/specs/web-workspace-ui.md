# Web Workspace UI

The browser workspace is a human review surface over the semantic graph and its persisted projections. It is not an administrative form stack or a second source of graph truth.

## Desktop Information Architecture

The authenticated desktop workspace uses four fixed surfaces that fit within the viewport:

1. a narrow primary rail for `Map`, `Scans`, `Findings`, and `Settings`;
2. a compact context panel for the selected rail destination;
3. the projection canvas and its toolbar;
4. a right inspector for the selected semantic node.

The default `Map` context must fit without page-level or context-panel scrolling at the supported desktop viewport. It contains only current scan status, bounded counts, a bounded set of the selected and most recent saved views, a compact picker for remaining views, and the workspace switcher. Token management, workspace creation, emergency graph editing, feedback composition, and proposal administration belong to `Settings`. Scan history and finding queues belong to their own rail destinations.

Changing the workspace selector only changes the pending selection. The loaded workspace remains the sole target of graph, projection, scan, category, feedback, and proposal operations until the user explicitly chooses `Load`. A completed operation realigns the selector with that loaded workspace.

The browser executes one workspace operation at a time. While an operation is pending, interactive workspace controls are inert, and any operation already dispatched by browser navigation is serialized behind the active operation. A later explicit load therefore completes after an earlier mutation and remains the final visible workspace. Projection-local search and group visibility reset whenever either the loaded workspace id or selected projection id changes.

Rare administrative destinations may scroll inside their own bounded context panel. They must not lengthen the map canvas or move the selected-node inspector below unrelated controls.

The `Scans` destination distinguishes completed runs from drafts. An `in_progress` run is presented as a draft, and its coverage is labelled as included and excluded sources rather than execution progress. Every run exposes an explicit Delete action. Human confirmation names the run and warns that all findings owned by it will also be removed; it does not repeat a client-side count that may become stale before the serialized delete reaches the server.

## Projection Toolbar

The map toolbar owns presentation-only controls:

- text filtering over visible node labels;
- projection-group visibility chips;
- dependency-edge visibility;
- verification/test-edge visibility;
- Back navigation for projection history.

These controls filter the rendered projection only. They do not mutate semantic nodes, edges, categories, scans, or the persisted projection.

Automatic viewport fitting runs when the loaded workspace, selected projection, or rendered node footprint changes. Selecting or clearing a semantic node changes inspector and selection styling only and must preserve the user's current map pan and zoom.

## Repository Boundary Presentation

A repository boundary project map uses a left-to-right layered layout:

- application surfaces form the first column;
- package or module boundaries form the following columns;
- dependency and verification edges use distinct presentation filters;
- compact cards and bounded row spacing keep the complete map readable in one desktop viewport where its node count permits.

Projection orientation guidance is presented as compact view help in the toolbar or inspector instead of consuming the canvas as a large pseudo-node. It remains projection-owned annotation and never becomes semantic graph data.

The toolbar help control must reveal the full persisted title, purpose, and ordered usage guidance on click and through keyboard activation. A tooltip may supplement this surface but is not the only way to read it.

Operation failures use a compact error indicator in the top bar with an expandable full message. The complete server-provided text must remain readable and must not be replaced by a clipped single-line summary.

## Inspector

Selecting a node opens its details in the fixed right inspector without changing the current projection. The inspector derives only from existing graph and projection state and may show:

- notes or responsibility;
- boundary kind and confidence;
- public entrypoints;
- incoming and outgoing dependencies;
- verification relations;
- source files and source references;
- finding evidence and allowed feedback actions when the selected node is a finding.

Opening a persisted dive-in remains an explicit action. Selection alone must not create projections, feedback, categories, or graph mutations.

## Authentication And Empty State

The bearer token remains tab-scoped in `sessionStorage`. When no token is available, the UI opens the Settings context with the token control while keeping protected server state absent. After a token is set, a pending protected deep link loads its exact workspace and projection and returns to the Map context.

## Visual Acceptance

Desktop UI changes must be checked at 1600×1000 against the accepted reference in `docs/evidence/repository-boundary-ui-redesign-mock.png`. Acceptance requires:

- no page-level vertical scroll;
- no scrolling in the default Map context panel;
- no horizontal or vertical overflow in the projection toolbar;
- visible rail, map context, canvas toolbar, and inspector;
- repository application/package boundaries arranged left-to-right;
- administrative forms absent from the default Map context;
- actual server-backed labels and evidence rather than illustrative mock content.

Automated visibility acceptance must verify rendered geometry, not only DOM presence: each required surface has a non-zero rendered box, a visible computed style, and bounds contained by the supported viewport.

Native form controls, including open workspace selectors and their option rows, must preserve readable foreground/background contrast in current Firefox and Chromium under the dark workspace color scheme.

Every keyboard-operable control must expose a visible `:focus-visible` indicator. Composite controls may render that indicator on their containing surface through `:focus-within`, provided the active control remains unambiguous.
