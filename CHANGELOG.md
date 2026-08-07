# Changelog

## 0.1.0 - 2026-08-07

- Added HiveMap MCP workspace discovery tools: `workspace_list`, `workspace_get`, and `workspace_resolve`.
- Added canonical workspace resolution by `id`, `slug`, or exact `name`, with stable machine-readable errors for not-found and ambiguous matches.
- Extended workspace metadata with optional `slug`, `archived`, and `updatedAt` fields to support lightweight discovery without loading full graphs.
- Bumped the SQLite storage schema to version `3` and added explicit migration from schema version `2`.
- Updated MCP, storage, REST, README, and tests to document and verify the new workspace discovery flow.
