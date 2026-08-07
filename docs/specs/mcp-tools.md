# MCP Tools

Draft MCP surface for agents. MCP is the primary HiveMap agent interface for alpha.

## Required Tools

- `workspace_list`
- `workspace_get`
- `workspace_resolve`
- `project_create`
- `graph_get`
- `graph_command`
- `category_assign`
- `projection_get`
- `projection_create`
- `feedback_list`
- `proposal_create`
- `proposal_approve`
- `proposal_apply`
- `scan_profile_list`
- `scan_list`
- `scan_start`
- `scan_record_coverage`
- `scan_finding_create`
- `finding_update`
- `scan_complete`
- `scan_compare`
- `workspace_export_zip`
- `workspace_import_zip`

## Rules

- Workspace discovery must not require direct SQL or out-of-band database access.
- `workspace_resolve` must accept canonical id, slug, or exact workspace name.
- Workspace discovery errors must be stable and machine-distinguishable.
- Tools must validate required ids and fail clearly.
- Tools must not infer missing project/map ids.
- Tools must not silently create categories.
- Proposal and apply flows must be distinguishable.
- All graph mutations must be explicit.
- REST endpoints, if present, must call the same command handlers as MCP tools.
- Scan tools instruct and validate an agent; they do not silently crawl the repository.
- ZIP paths and import mode are explicit. Import never merges or rewrites ids silently.

## Implementation Direction

The MCP app exposes tool handlers over the shared HiveMap runtime. Transport-specific MCP server wiring must stay thin and must not reimplement graph, category, projection, feedback, or proposal behavior.

## Workspace Discovery Flow

Agents discover a workspace before calling graph or scan tools:

1. `workspace_list({ query, limit, includeArchived })` returns lightweight canonical candidates in user-friendly order.
2. `workspace_resolve({ ref })` converts a user-facing id, slug, or exact name into one canonical workspace record.
3. `workspace_get({ workspaceId })` can fetch one canonical lightweight workspace record directly by id.
4. Tools such as `graph_get` and `scan_start` then use the returned canonical `workspaceId`.

`workspace_resolve` error codes:

- `workspace_not_found`: no exact id, slug, or name match exists.
- `workspace_ambiguous`: multiple exact name matches exist; `error.details.candidates` contains canonical candidates.
