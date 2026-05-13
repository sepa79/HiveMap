# MVP Slice

This is the first implementation slice after the POC.

## Goal

Build a local-first HiveMap alpha that proves:

- explicit agent tools can update a semantic graph,
- the UI can show overview and dive-in projections,
- feedback events can become agent proposals,
- categories make trust/risk/uncertainty readable.

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
- Local persistence.

### Not Required

- Authentication.
- Multi-user collaboration.
- Cloud sync.
- Automatic transcript ingestion.
- Advanced layout AI.
- Production deployment.
- Full HiveMind integration.

## User Story

1. User opens HiveMap.
2. User starts a Conversation Map.
3. User tells the agent to capture the current discussion.
4. Agent adds nodes/edges with categories.
5. UI shows an overview.
6. User marks one item unclear and asks to dive in.
7. Agent creates a proposal to regroup and add detail.
8. User approves.
9. Projection updates.
10. Snapshot is saved.

## Definition Of Done

- All graph mutations go through commands.
- UI gestures create feedback events.
- Agent proposals are visible before apply when policy requires it.
- Overview projection hides detail by default.
- Dive-in projection reveals local detail.
- Categories are displayed and persisted.
- POC snapshots remain available for comparison.
- Core behavior has focused tests.

## Suggested Milestones

### Milestone 1 — Core Model

- `graph-core`
- `categories`
- `capture`
- contract tests

### Milestone 2 — Local Runtime

- persistence adapter,
- API app,
- MCP app,
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

- saved snapshots,
- import POC demo snapshots,
- README run instructions,
- final smoke test.
