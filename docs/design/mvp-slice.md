# MVP Slice

This records the first implementation slice after the POC, with its runtime requirements aligned to the current alpha. The delivered Postgres/container scope and verification are tracked in [the runtime plan](postgres-container-hiveforge-plan.md); public behavior is owned by `docs/specs/*`.

## Goal

Build a local-first HiveMap alpha that proves:

- explicit agent tools can update a semantic graph,
- the UI can show overview and dive-in projections,
- feedback events can become agent proposals,
- categories make trust/risk/uncertainty readable.
- delegated capture can update the map at conversation speed.

## Scope

### Required

- Workspace creation.
- Semantic graph CRUD through commands.
- Category catalog and assignment.
- Capture policy selection.
- Feedback event log.
- Overview projection.
- Dive-in projection.
- Proposal creation and apply/reject.
- MCP tools for graph/projection/category/proposal operations.
- Postgres persistence behind an explicit storage interface.
- A self-contained local container for Postgres, REST, Streamable HTTP MCP, and the web UI.
- One required bearer token shared by REST and MCP; public UI assets and health.

### Not Required

- Multi-user authorization; the alpha uses one operator token.
- Multi-user collaboration.
- Cloud sync.
- Automatic transcript ingestion.
- Advanced layout AI.
- A hosted multi-user production service; local Docker and controlled HiveForge deployment are delivered in the runtime plan.
- Full HiveMind integration.

## User Story

1. User opens HiveMap.
2. User starts a Conversation Map.
3. User tells the agent to capture the current discussion.
4. Agent adds nodes/edges with categories.
5. UI shows an overview.
6. User marks one item unclear and asks to dive in.
7. Agent applies a delegated update or creates a proposal if the policy requires review.
8. Projection updates.
9. User switches to Project Map semantics when the conversation is about a project.
10. Reviewed state remains persisted in the originating workspace; portability is deferred.

## Definition Of Done

- All graph mutations go through commands.
- UI gestures create feedback events.
- Delegated capture is the default policy.
- Agent proposals are visible before apply when policy requires it.
- Overview projection hides detail by default.
- Dive-in projection reveals local detail.
- Categories are displayed and persisted.
- POC exported evidence remains available for comparison.
- Core behavior has focused tests.

## Suggested Milestones

### Milestone 1 — Core Model

- `graph-core`
- `categories`
- `capture`
- contract tests
- TDD for pure behavior before apps.

### Milestone 2 — Local Runtime

- persistence adapter,
- MCP app,
- API app,
- command execution tests.

### Milestone 3 — Web UX

- overview projection,
- dive-in projection,
- feedback event capture,
- category display.

### Milestone 4 — Agent Loop

- feedback list,
- proposal create/apply,
- proposal review UI,
- deterministic test interpreter.

### Milestone 5 — Demo Hardening

- document deferred project portability without implementing it,
- keep POC demo evidence as reference-only files,
- README run instructions,
- final smoke test.
