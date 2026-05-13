# MCP Tools

Draft MCP surface for agents. MCP is the primary HiveMap agent interface for alpha.

## Required Tools

- `project_create`
- `graph_get`
- `node_upsert`
- `edge_upsert`
- `category_assign`
- `projection_get`
- `projection_create`
- `feedback_list`
- `proposal_create`
- `proposal_apply`

## Rules

- Tools must validate required ids and fail clearly.
- Tools must not infer missing project/map ids.
- Tools must not silently create categories.
- Proposal and apply flows must be distinguishable.
- All graph mutations must be explicit.
- REST endpoints, if present, must call the same command handlers as MCP tools.
