# REST API

REST is the local UI/testing API for HiveMap alpha.

MCP is the primary agent interface. REST must call the same command handlers as MCP tools and must not define separate graph, category, capture, projection, or proposal semantics.

## Rules

- Required ids must be explicit.
- Missing workspaces, graph ids, category ids, projection ids, proposal ids, and feedback ids must fail clearly.
- Graph mutation must use `GraphCommand`.
- Feedback events must not mutate the graph directly.
- Proposal creation and proposal application are separate operations.
- REST request/response contracts should share types with MCP contracts where possible.

## Endpoints

```text
GET  /workspaces/:workspaceId
POST /workspaces

GET  /workspaces/:workspaceId/graph
POST /workspaces/:workspaceId/commands

GET  /workspaces/:workspaceId/categories
POST /workspaces/:workspaceId/category-assignments

GET  /workspaces/:workspaceId/projections/:projectionId
POST /workspaces/:workspaceId/projections

GET  /workspaces/:workspaceId/feedback
POST /workspaces/:workspaceId/feedback

GET  /workspaces/:workspaceId/proposals
POST /workspaces/:workspaceId/proposals
POST /workspaces/:workspaceId/proposals/:proposalId/approve
POST /workspaces/:workspaceId/proposals/:proposalId/apply
POST /workspaces/:workspaceId/proposals/:proposalId/reject

GET  /workspaces/:workspaceId/snapshots
POST /workspaces/:workspaceId/snapshots
```

## Request / Response Direction

The API returns domain contract objects from:

- `graph-model.md`
- `graph-commands.md`
- `category-overlay.md`
- `capture-policy.md`
- `feedback-events.md`
- `projection-model.md`
- `storage-format.md`

API-specific wrappers may add operation status and ids, but must not create duplicate DTO semantics.
