# REST API

REST is the local UI/testing API for HiveMap alpha.

MCP is the primary agent interface. REST must call the same command handlers as MCP tools and must not define separate graph, category, capture, projection, or proposal semantics.

Generic graph-command requests cannot create, update, or delete nodes of type `finding`. Finding lifecycle uses the dedicated scan/finding operations; applying an approved proposal that creates a finding must atomically attach it to the referenced in-progress scan.

## Rules

- Required ids must be explicit.
- Dynamic path identifiers are standard percent-encoded URL segments. REST clients encode each identifier exactly once, and the HTTP boundary decodes each segment exactly once before typed request validation.
- Missing workspaces, graph ids, category ids, projection ids, proposal ids, and feedback ids must fail clearly.
- Graph mutation must use `GraphCommand`.
- Feedback events must not mutate the graph directly.
- Proposal creation and proposal application are separate operations.
- REST request/response contracts should share types with MCP contracts where possible.
- Exactly one direct (`HIVEMAP_AUTH_TOKEN`/`--auth-token`) or file-backed
  (`HIVEMAP_AUTH_TOKEN_FILE`/`--auth-token-file`) token source is required when
  the HTTP runtime starts.
- Every REST route requires the exact `Authorization: Bearer <token>` header.
- `GET /health`, the built UI entry point, and built static assets are public so operators can check readiness and load the token prompt.
- `GET /health` is a live runtime-readiness check. It returns `200` with
  `{ "status": "ok" }` only when the configured store can complete a live
  connection probe. Store unavailability returns `503` with the stable
  `STORAGE_UNAVAILABLE` error envelope and never exposes driver, connection,
  host, port, or credential details. Container health uses this endpoint, so a
  running HTTP process with unavailable Postgres is unhealthy.
- `OPTIONS` is public for CORS preflight; allowed headers include `authorization` and MCP protocol headers.
- JSON and MCP request bodies are limited to 2 MiB.
- Repository indexing over REST accepts remote HTTPS Git sources only. SSH, HTTP(S) userinfo, every URL password, query parameters, fragments, ASCII control characters, and backticks are rejected. Accepted locations are normalized before persistence. Server-local paths and `file://` sources are not part of the network API authority.

The same token protects the Streamable HTTP MCP endpoint at `/mcp`. A missing or incorrect token returns `401` before REST or MCP dispatch. Authentication is intentionally one shared operator token; users, roles, and per-workspace authorization are not part of this alpha contract.

### Token provisioning and lifecycle

- Direct development and the repository-local Compose profile accept the token
  through `HIVEMAP_AUTH_TOKEN`.
- Installed HiveForge deployments declare the Docker secret
  `hivemap-auth-token` in `requirements.secrets`. The container receives only
  `HIVEMAP_AUTH_TOKEN_FILE=/run/secrets/hivemap-auth-token`; the secret value
  must not be rendered into Compose, Ansible output, process arguments, logs,
  docs, or deployment metadata.
- Exactly one token source is allowed. Supplying both
  `HIVEMAP_AUTH_TOKEN` and `HIVEMAP_AUTH_TOKEN_FILE`, an empty secret file, or
  an unreadable secret file is a startup error.
- The browser keeps the operator token in `sessionStorage`, scoped to the
  current browser tab. The token is attached only as an `Authorization` header,
  is never placed in URLs, and can be explicitly cleared from the UI. Closing
  the tab ends the stored-token lifecycle.
- Clearing the browser token immediately removes all server-provided workspace
  records, graph/projection state, selected semantic ids, and workspace or
  projection query parameters from the rendered UI. Clearing is local and must
  not issue an unauthenticated refresh request.
- Browser storage does not protect against script execution in the same origin.
  The public UI must therefore remain free of third-party scripts, and a future
  multi-user runtime requires a different authentication/session contract.

## Endpoints

```text
GET  /health
POST /mcp

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
POST /workspaces/:workspaceId/scans/:scanId/calibration-decision
GET  /workspaces/:workspaceId/scans/:scanId/boundary-map
POST /workspaces/:workspaceId/scans/:scanId/overlay-suggestion
POST /workspaces/:workspaceId/scans/:scanId/coverage
POST /workspaces/:workspaceId/scans/:scanId/finding-validation
POST /workspaces/:workspaceId/scans/:scanId/findings
POST /workspaces/:workspaceId/scans/:scanId/complete
DELETE /workspaces/:workspaceId/scans/:scanId
POST /workspaces/:workspaceId/scan-comparisons
POST /workspaces/:workspaceId/findings/:findingNodeId/update

```

Embedding routes are explicit and read-model-oriented:

- `POST /workspaces/:workspaceId/concepts/:nodeId/embedding` stores a caller-supplied vector directly.
- `GET /workspaces/:workspaceId/concepts/:nodeId/similar?model=...&limit=...&minScore=...` returns bounded read-only similarity suggestions only.

The active REST contract does not generate embeddings or manage a model provider. A caller that owns generation may store an explicit vector through the upsert route; graph mutations never regenerate vectors implicitly.

Repository indexing routes begin with persisted job records only:

- `POST /workspaces/:workspaceId/repository-indexes` stores one explicit safe-mode repository indexing request for later execution.
- `GET /workspaces/:workspaceId/repository-indexes` lists persisted repository index job records for one workspace.
- `GET /workspaces/:workspaceId/repository-indexes/:indexId` reads one persisted repository index job record and its current stage.
- `POST /workspaces/:workspaceId/repository-indexes/:indexId/execute` runs the current minimal safe-mode indexer and persists resolved commit, file inventory, chunks, and index stats.
- `GET /workspaces/:workspaceId/repository-indexes/:indexId/search?query=...&limit=...` returns bounded file/chunk hits from one completed repository index.
- `GET /workspaces/:workspaceId/repository-indexes/:indexId/evidence-candidates?profileId=...&profileVersion=...&criterionId=...&limit=...` returns bounded evidence packets for one completed repository index and one explicit scan criterion. The first slice covers documentation/SSOT signals such as broken references, duplicate authority claims, and missing ownership hints.

Scan routes now start from one explicit completed repository index:

- `POST /workspaces/:workspaceId/scans` starts one scan from `scan.repositoryIndexId`, derives repository provenance and coverage from the selected completed repository index, snapshots the resolved effective profile onto the run, and returns a calibration-stage response with the resolved profile, coverage summary, checklist, assessment, and instructions.
- `POST /workspaces/:workspaceId/scans/:scanId/calibration-decision` records one explicit post-calibration decision for the in-progress run: `continue`, `refine-overlay`, `correct-coverage`, `build-boundary-map`, or `restart-scan`.
- `GET /workspaces/:workspaceId/scans/:scanId/boundary-map` derives one candidate typed `boundaryMap` artifact from the current run coverage plus the selected completed repository index facts, and returns `409` when the caller skipped the required `build-boundary-map` calibration decision.
- `POST /workspaces/:workspaceId/scans/:scanId/overlay-suggestion` accepts one explicit `symptomId` and returns the smallest repo-aware overlay YAML scaffold for that calibration symptom, seeded from the current in-progress scan's effective profile and active boundary-map config.
- `POST /workspaces/:workspaceId/scans/:scanId/coverage` remains available only for explicit coverage correction or override; it is no longer required in the normal repository-index-backed start flow and should follow an explicit `correct-coverage` calibration decision.
- `POST /workspaces/:workspaceId/scans/:scanId/finding-validation` accepts one explicit `criterionId` plus an optional reviewed `boundaryMap` artifact and classifies the suspected issue as `likely-real-finding`, `profile-gap`, `missing-evidence`, or `ambiguous-shape` before the caller creates a durable finding node.
- `POST /workspaces/:workspaceId/scans/:scanId/complete` accepts `completedAt`, `appliedCriteria`, `declaredOutputs`, an optional typed `boundaryMap` artifact when `declaredOutputs` includes `boundary-map`, and optional `calibrationOverrideReason`. Findings-bearing completion requires an explicit prior `continue` calibration decision, and still fails on a non-ready calibration state unless that override reason is supplied explicitly. The typed artifact is semantically validated, not only shape-checked.
- `DELETE /workspaces/:workspaceId/scans/:scanId` hard-deletes any scan run and atomically removes its owned finding nodes, incident graph edges, projection membership, projections made empty or rootless by the cascade, and category assignments targeting removed graph elements. The response reports the deleted scan, finding-node, edge, and projection ids.

`GET /workspaces` returns lightweight workspace records for browser selection without loading every semantic graph. Records may include optional discovery metadata such as `slug`, `archived`, and `updatedAt`.

The current HTTP boundary exposes no workspace or project import/export routes. The deferred portability direction is a versioned streaming NDJSON full-project snapshot, but no transport contract is defined or implemented for it in this phase.

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
