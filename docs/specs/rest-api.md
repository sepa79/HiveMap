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
GET  /workspaces
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

GET  /workspaces/:workspaceId/scan-profiles
GET  /workspaces/:workspaceId/scans
POST /workspaces/:workspaceId/scans
POST /workspaces/:workspaceId/scans/:scanId/coverage
POST /workspaces/:workspaceId/scans/:scanId/findings
POST /workspaces/:workspaceId/scans/:scanId/complete
POST /workspaces/:workspaceId/scan-comparisons
POST /workspaces/:workspaceId/findings/:findingNodeId/update

POST /workspaces/:workspaceId/exports
POST /workspace-imports

POST /workspaces/:workspaceId/export-bundle
POST /workspace-import-bundles?mode=new|replace
```

`GET /workspaces` returns lightweight workspace records for browser selection without loading every semantic graph.

The `exports` and `workspace-imports` endpoints use explicit server filesystem paths and remain suitable for local automation. The `export-bundle` and `workspace-import-bundles` endpoints transfer `application/zip` bytes directly for browser download and file upload. Browser import still requires an explicit `new` or `replace` mode; it never silently merges workspaces.

## Request / Response Direction

The API returns domain contract objects from:

- `graph-model.md`
- `graph-commands.md`
- `category-overlay.md`
- `capture-policy.md`
- `feedback-events.md`
- `projection-model.md`
- `storage-format.md`
- `repository-scan.md`

API-specific wrappers may add operation status and ids, but must not create duplicate DTO semantics.
