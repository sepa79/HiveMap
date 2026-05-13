# MCP Tools

Draft MCP surface for agents. MCP is the primary HiveMap agent interface for alpha.

## Required Tools

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

## Rules

- Tools must validate required ids and fail clearly.
- Tools must not infer missing project/map ids.
- Tools must not silently create categories.
- Proposal and apply flows must be distinguishable.
- All graph mutations must be explicit.
- REST endpoints, if present, must call the same command handlers as MCP tools.

## Implementation Direction

The MCP app exposes tool handlers over the shared HiveMap runtime. Transport-specific MCP server wiring must stay thin and must not reimplement graph, category, projection, feedback, or proposal behavior.
