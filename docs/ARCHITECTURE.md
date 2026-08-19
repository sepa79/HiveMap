# Architecture — HiveMap Bootstrap Summary

This file is a short bootstrap summary for AI starter/profile workflows.

Canonical HiveMap architecture direction remains in `docs/architecture.md`.
If these files conflict:

1. `AGENTS.md`
2. `docs/specs/*`
3. `docs/architecture.md`
4. this file

## Purpose

HiveMap turns intentional human/agent collaboration into a persistent semantic graph plus readable projections for conversations, projects, and repository-review evidence.

## Architecture principles

- Semantic graph state is the source of truth.
- Visual maps are projections, never semantic ownership.
- MCP and REST stay thin over the shared runtime.
- Validation happens at explicit boundaries.
- No silent fallbacks, hidden protocol switching, or duplicate DTO semantics.
- Repository scans instruct and validate an agent; HiveMap does not crawl silently.

## System overview

The runtime shape is local-first:

```text
human -> web UI -> REST API \
                          -> shared runtime -> SQLite store -> ZIP export/import
agent -> MCP stdio ------/

shared runtime -> graph core
shared runtime -> projections
shared runtime -> capture/proposals
shared runtime -> scan validation/evidence
```

## Main components

| Component | Responsibility | Notes |
|---|---|---|
| `apps/web` | Render projections and collect feedback/proposal intent | React/React Flow UI |
| `apps/api` | Local browser/test boundary | Uses the same runtime handlers as MCP |
| `apps/mcp` | Agent-facing tool boundary | Current stdio-only transport |
| `packages/runtime` | Shared service layer | Owns orchestration, not transport |
| `packages/storage` | SQLite and ZIP bundle persistence | Current alpha store |
| `packages/scans` | Versioned scan profiles, evidence, findings, comparisons | Agent-executed workflow validation |

## Boundaries

- `graph-core` owns semantic graph invariants and command application only.
- `projections` derive views and must not mutate graph semantics.
- `capture` owns feedback/proposal/capture-policy contracts.
- `scans` validate coverage and findings but do not perform IO over repositories.
- `storage` owns persistence and bundle serialization.
- `api` and `mcp` expose explicit commands over the same runtime behavior.

## Data model

Important persisted state:

- workspace record
- semantic graph
- category catalog and assignments
- capture policy, feedback, and proposals
- projections and snapshots
- scan profiles, runs, coverage, findings, and comparisons
- portable bundle bytes for `.hivemap.zip`

## APIs / contracts / specs

Canonical contracts live under `docs/specs/`. The most important ones today are:

- `graph-model.md`
- `graph-commands.md`
- `projection-model.md`
- `mcp-tools.md`
- `rest-api.md`
- `repository-scan.md`
- `storage-format.md`

## Runtime / deployment

Current supported runtime is local single-user Node.js:

- API on `127.0.0.1:8787`
- web dev server on `127.0.0.1:5175`
- MCP server as a local stdio process
- one shared SQLite file under `.hivemap/`

Hosted/containerized and Streamable HTTP MCP shapes are future work, not current repository behavior.

## Observability

- `npm run verify` is the main release gate
- API and MCP fail fast on invalid inputs and missing required ids
- scan completion validates coverage, criteria, and declared outputs
- exported bundles preserve evidence and repeat-scan instructions

There is no mature metrics/auth/ops stack yet.

## Failure modes

- API and MCP pointing at different SQLite paths creates apparent state drift.
- Exposing the current API beyond localhost is unsafe because auth is absent.
- Incomplete scan coverage or missing declared outputs must fail completion.
- Treating POC artifacts as 1.0 SSOT creates architectural drift.

## Open architecture questions

- which post-SQLite storage backend should support hosted/containerized deployments
- whether Streamable HTTP MCP should be embedded into one runtime process or split from REST
- how to link HiveMind decisions/learnings to HiveMap workspaces without implicit coupling
