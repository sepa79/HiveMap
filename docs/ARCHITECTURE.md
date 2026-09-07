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

The installed runtime shape is single-process at the HTTP boundary:

```text
human -> built web served by API -> bearer-protected REST API \
agent -> bearer-protected Streamable HTTP MCP ----------------> shared runtime -> Postgres store
agent -> transitional local MCP stdio adapter ----------------/

shared runtime -> graph core
shared runtime -> projections
shared runtime -> capture/proposals
shared runtime -> scan validation/evidence
```

## Main components

| Component | Responsibility | Notes |
|---|---|---|
| `apps/web` | Render projections and collect feedback/proposal intent | Auth-token lifecycle, projection navigation/styles, and the workspace screen have separate owners |
| `apps/api` | Local browser/test boundary | Routing, boundary parsing, static assets, process config, and shutdown are separate modules over the same runtime as MCP |
| `apps/mcp` | Agent-facing tool boundary | Tool dispatch, SDK registration, Streamable HTTP, and transitional stdio are separate adapters |
| `packages/runtime` | Shared service layer | Command orchestration delegates scan-profile coordination and evidence selection to focused modules |
| `packages/storage` | Postgres runtime store and test in-memory store | Contracts, adapters, shared validation, SQL, and public exports have separate owners; runtime persistence is Postgres-only |
| `packages/scans` | Versioned scan profiles, evidence, findings, comparisons | Agent-executed workflow validation |

## Boundaries

- `graph-core` owns semantic graph invariants and command application only.
- `projections` derive views and must not mutate graph semantics.
- `capture` owns feedback/proposal/capture-policy contracts.
- `scans` validate coverage and findings but do not perform IO over repositories.
- `storage` owns persistence and hydration validation.
- `api` and `mcp` expose explicit commands over the same runtime behavior.

## Data model

Important persisted state:

- workspace record
- semantic graph
- category catalog and assignments
- capture policy, feedback, and proposals
- projections
- scan profiles, runs, coverage, findings, and comparisons

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

Current runtime direction in code is single-operator Node.js on Postgres:

- direct development API on `127.0.0.1:8787`; container profiles publish port `8787`
- built web assets and public health on the same HTTP process
- bearer-protected REST plus stateless Streamable HTTP MCP at `/mcp`
- one shared Postgres store; stdio remains only a temporary adapter

The container owns its internal Postgres connection and requires exactly one bearer-token source before startup: direct `HIVEMAP_AUTH_TOKEN`/`--auth-token` or file-backed `HIVEMAP_AUTH_TOKEN_FILE`/`--auth-token-file`. Repository-local Compose uses the direct source; HiveForge normally mounts its external Docker secret and supplies only the file-backed source. An explicitly disposable test deployment may select the direct source with the non-secret `HIVEMAP_PUBLIC_TEST_AUTH_TOKEN` renderer input; this override is not a private-credential store.

## Observability

- `npm run verify` is the main release gate
- API and MCP fail fast on invalid inputs and missing required ids
- scan completion validates coverage, criteria, and declared outputs
- completed scans preserve immutable evidence and repeat-scan inputs in their originating workspace

There is no mature metrics, identity, role, or multi-tenant ops stack yet.

## Failure modes

- REST and installed MCP share one runtime/store; the legacy stdio adapter can still create apparent state drift if pointed at another database.
- Treating the shared bearer token as multi-user authorization would overstate the security boundary.
- Incomplete scan coverage or missing declared outputs must fail completion.
- Treating POC artifacts as 1.0 SSOT creates architectural drift.

## Open architecture questions

- how to link HiveMind decisions/learnings to HiveMap workspaces without implicit coupling
