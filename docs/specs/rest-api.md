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
GET  /workspaces/:workspaceId/repository-indexes
GET  /workspaces/:workspaceId/repository-indexes/:indexId
POST /workspaces/:workspaceId/repository-indexes
POST /workspaces/:workspaceId/repository-indexes/:indexId/execute
GET  /workspaces/:workspaceId/repository-indexes/:indexId/search?query=...&limit=...
GET  /workspaces/:workspaceId/repository-indexes/:indexId/evidence-candidates?profileId=...&profileVersion=...&criterionId=...&limit=...
POST /workspaces/:workspaceId/concepts/:nodeId/embedding
POST /workspaces/:workspaceId/concepts/:nodeId/embedding-refresh
POST /workspaces/:workspaceId/concept-embeddings/backfill
GET  /workspaces/:workspaceId/concepts/:nodeId/similar
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

Embedding routes are explicit and read-model-oriented:

- `POST /workspaces/:workspaceId/concepts/:nodeId/embedding` stores a caller-supplied vector directly.
- `POST /workspaces/:workspaceId/concepts/:nodeId/embedding-refresh` generates or refreshes one concept embedding through a configured provider-backed `model` ref such as `ollama:nomic-embed-text`.
- `POST /workspaces/:workspaceId/concept-embeddings/backfill` refreshes missing or stale concept embeddings for a selected set or all concept nodes in one workspace.
- `GET /workspaces/:workspaceId/concepts/:nodeId/similar?model=...&limit=...&minScore=...` returns bounded read-only similarity suggestions only.

Repository indexing routes begin with persisted job records only:

- `POST /workspaces/:workspaceId/repository-indexes` stores one explicit safe-mode repository indexing request for later execution.
- `GET /workspaces/:workspaceId/repository-indexes` lists persisted repository index job records for one workspace.
- `GET /workspaces/:workspaceId/repository-indexes/:indexId` reads one persisted repository index job record and its current stage.
- `POST /workspaces/:workspaceId/repository-indexes/:indexId/execute` runs the current minimal safe-mode indexer and persists resolved commit, file inventory, chunks, and index stats.
- `GET /workspaces/:workspaceId/repository-indexes/:indexId/search?query=...&limit=...` returns bounded file/chunk hits from one completed repository index.
- `GET /workspaces/:workspaceId/repository-indexes/:indexId/evidence-candidates?profileId=...&profileVersion=...&criterionId=...&limit=...` returns bounded evidence packets for one completed repository index and one explicit scan criterion. The first slice covers documentation/SSOT signals such as broken references, duplicate authority claims, and missing ownership hints.

Scan routes now start from one explicit completed repository index:

- `POST /workspaces/:workspaceId/scans` starts one scan from `scan.repositoryIndexId`, derives repository provenance and coverage from the selected completed repository index, and returns the resolved profile plus instructions.
- `POST /workspaces/:workspaceId/scans/:scanId/coverage` remains available only for explicit coverage correction or override; it is no longer required in the normal repository-index-backed start flow.

`GET /workspaces` returns lightweight workspace records for browser selection without loading every semantic graph. Records may include optional discovery metadata such as `slug`, `archived`, and `updatedAt`.

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
- `repository-indexing.md`

API-specific wrappers may add operation status and ids, but must not create duplicate DTO semantics.
