# Project Context — HiveMap

## Purpose

HiveMap is an AI-assisted concept graph workspace for live conversations, project reasoning, and repository review workflows.

## What this project does

HiveMap stores a canonical semantic graph and derives readable overview, dive-in, and project-map projections from it. A human communicates intent, an agent records explicit graph operations, and the UI renders projections without becoming semantic truth. The current alpha supports both concept mapping and versioned repository-scan workflows that produce findings, evidence, and portable ZIP exports. REST and MCP share one runtime so the browser UI and agent-facing tools operate on the same domain behavior. The repo also preserves a runnable `poc/` as evidence, not as the 1.0 architecture.

## What this project does not do

- It is not a hosted multi-user service today.
- It does not provide users, roles, or per-workspace authorization; the installed HTTP runtime uses one required operator bearer token.
- It does not silently crawl repositories; scans are agent-executed.
- It does not treat UI layout state as semantic truth.
- It does not use `poc/` file formats or server structure as 1.0 SSOT.

## Main users / operators

- Human collaborators using the browser UI to inspect projections, record feedback, and review results.
- MCP-capable coding agents that mutate the graph through explicit tools and perform repository scans.
- Maintainers evolving the graph model, projection rules, capture policy, scan contracts, and storage/runtime shape.

## Main modules

| Module | Purpose | Notes |
|---|---|---|
| `apps/web` | Browser UI for overview, dive-in, project-map, and scan review flows | Uses React and React Flow. |
| `apps/api` | Local REST boundary for the UI and tests | Must share runtime semantics with MCP. |
| `apps/mcp` | Agent-facing MCP boundary | Streamable HTTP is installed with the runtime; stdio remains transitional local tooling. |
| `packages/runtime` | Shared application service layer | Orchestrates graph, categories, capture, projections, scans, and storage. |
| `packages/graph-core` | Canonical semantic graph types, validation, and command application | Pure domain logic. |
| `packages/projections` | View derivation for overview, dive-in, and project maps | Must not mutate graph semantics. |
| `packages/capture` | Capture policy, feedback events, and proposal lifecycle | Models intent and reviewable changes. |
| `packages/scans` | Repository scan profiles, validation, evidence, and comparisons | Validates agent-performed scans. |
| `packages/storage` | Postgres runtime persistence, test in-memory store support, and ZIP import/export bundle support | Runtime persistence is Postgres-only. |
| `packages/api-contracts` | Shared request/response and contract validation types | Prevents divergent REST/MCP DTO semantics. |

## Runtime model

HiveMap currently runs as a single-operator Node.js runtime on Postgres. The installed HTTP process serves built UI assets, protected REST, and protected stateless Streamable HTTP MCP from one runtime/store. The UI uses the serving origin in production and stores the operator-entered bearer token in tab-scoped `sessionStorage`. The HTTP runtime requires exactly one token source: direct `HIVEMAP_AUTH_TOKEN`/`--auth-token` for local operation or file-backed `HIVEMAP_AUTH_TOKEN_FILE`/`--auth-token-file` for installed secret mounts. The legacy stdio adapter remains a separate explicit development path.

## Deployment model

The repo includes a single-image Docker runtime for protected REST, Streamable HTTP MCP, the built web UI, built-in indexing/scan handlers, and bundled Postgres, plus HiveForge deployment profiles for the same image.

## Data/storage model

- Canonical semantic graph state persisted in Postgres through `packages/storage`
- Category catalog and assignments
- Capture policy, feedback events, and proposals
- Projections and portable exports
- Repository scan profiles, coverage, findings, completed runs, and comparisons
- Portable `.hivemap.zip` workspace bundles for export/import
- POC assets and snapshots kept under `poc/` for evidence only

## External integrations

- MCP SDK for agent tool transport
- React Flow for graph rendering in the browser UI
- Postgres with `pgvector` for the target runtime backend
- In-memory test store for fast store/runtime/API/MCP tests without a database process
- Optional HiveMind linkage for durable learnings and decisions by explicit ids/links

## Important risks

- REST and Streamable HTTP MCP must share one runtime/store or the UI and agent will appear to drift; the installed process enforces this shape.
- The shared bearer token is coarse operator authentication, not multi-user authorization.
- Review and scan workflows depend on agent quality; HiveMap validates outputs but does not replace agent judgment.
- Drift between `docs/architecture.md`, `docs/specs/*`, and implementation would directly weaken the product's SSOT model.
- There is a real risk of turning HiveMap into a generic diagram editor if graph/projection boundaries slip.

## Things AI agents must not guess

- Never guess missing workspace, graph, projection, finding, or proposal ids.
- Never treat UI layout or manual node motion as semantic truth.
- Never treat `poc/` as 1.0 architecture without an explicit decision.
- Never infer missing categories, scan outputs, or repository coverage silently.
- Never present the shared bearer token as user/role authorization or a multi-tenant security boundary.
