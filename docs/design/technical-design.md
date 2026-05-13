# Technical Design First Pass

This is a first technical design, not an implementation plan lock-in.

## Architecture Shape

Use a small modular TypeScript codebase:

```text
apps/
  web/
  api/
  mcp/
packages/
  graph-core/
  categories/
  capture/
  projections/
  storage/
  api-contracts/
```

Start with core packages and TDD. Add apps after core behavior is explicit and tested.

## Package Responsibilities

### `graph-core`

Owns:

- graph node/edge types,
- graph command types,
- graph validation,
- pure mutation functions.

No IO. No UI. No agent logic.

### `categories`

Owns:

- category catalog,
- custom category validation,
- category assignments,
- provenance/status rules.

### `capture`

Owns:

- capture policy,
- feedback event types,
- proposal model,
- conversion from interpreted intent to graph commands.

It does not call AI models directly.

### `projections`

Owns:

- overview projection,
- dive-in projection,
- project map projection,
- snapshot projection,
- grouping logic.

It reads graph data and produces projection data. It does not mutate graph semantics.

### `storage`

Owns persistence adapters.

Initial adapter is SQLite, behind explicit interfaces.

### `api-contracts`

Owns shared contract types if needed by API, MCP, and UI.

## Apps

### `apps/mcp`

MCP server for AI agents.

The MCP tools should be the first-class agent interface.

### `apps/api`

HTTP API for local UI and tests.

### `apps/web`

Browser UI for maps, projections, feedback, and proposal review.

## Storage First Pass

Use SQLite for first real implementation.

Reasoning:

- local-first,
- durable,
- inspectable,
- supports graph/projection/event tables,
- avoids premature service dependency,
- easier than JSON once proposals/snapshots/events exist.

Do not add remote DB, auth, or sync until local workflow is proven.

## Tables / Stores

Initial persistence concerns:

- `workspaces`
- `graphs`
- `nodes`
- `edges`
- `categories`
- `category_assignments`
- `capture_policies`
- `feedback_events`
- `proposals`
- `projections`
- `snapshots`

Exact schema belongs in `docs/specs/storage-format.md` before implementation.

## API First Pass

HTTP API:

- `GET /graph`
- `POST /commands`
- `GET /projections/:id`
- `POST /projections`
- `POST /feedback`
- `GET /feedback`
- `POST /proposals`
- `POST /proposals/:id/apply`
- `GET /categories`
- `POST /category-assignments`

MCP API is primary:

- `graph_get`
- `graph_command`
- `feedback_list`
- `proposal_create`
- `proposal_apply`
- `projection_get`
- `projection_create`
- `category_assign`

Avoid parallel, subtly different semantics between REST and MCP. REST should call the same command handlers as MCP.

## Frontend First Pass

Use React Flow only as the map surface.

Frontend state:

- current projection,
- selected item,
- feedback draft,
- proposal review state.

Frontend must not own graph truth.

## Testing Strategy

Mandatory pure tests:

- graph validation,
- graph command application,
- category assignment validation,
- capture policy enforcement,
- projection generation,
- proposal apply/reject.

Integration tests:

- API graph command flow,
- MCP graph command flow,
- feedback to proposal flow with a deterministic interpreter stub.

UI tests can come after core contracts stabilize.

## First Implementation Slice

1. Create monorepo/workspace tooling.
2. Implement `graph-core` with tests first.
3. Implement `categories` with stable semantic ids and tests.
4. Implement `capture` event/proposal/policy types with delegated default.
5. Implement `projections` overview/dive-in logic with tests.
6. Implement SQLite storage behind explicit interfaces.
7. Implement MCP graph tools.
8. Implement API command endpoint over the same handlers.
9. Implement web overview projection.
10. Implement feedback event capture.
11. Implement proposal review.

## Risks

- Building a generic diagram editor by accident.
- Letting projection data leak into graph semantics.
- Creating separate REST/MCP contracts.
- Adding too much AI automation before capture policy is solid.
- Over-designing storage before workflow is proven.
- Losing the playful category language by over-normalizing it.
- Encoding playful category names as stable data ids instead of keeping them as an icon/display theme.
