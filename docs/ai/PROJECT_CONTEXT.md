# Project Context — HiveMap

## Purpose

HiveMap is an AI-assisted concept graph workspace for live conversations, project reasoning, and repository review workflows.

## What this project does

HiveMap stores a canonical semantic graph and derives readable overview, dive-in, and project-map projections from it. A human communicates intent, an agent records explicit graph operations, and the UI renders projections without becoming semantic truth. The current alpha supports both concept mapping and versioned repository-scan workflows that produce findings, evidence, and portable ZIP exports. REST and MCP share one runtime so the browser UI and agent-facing tools operate on the same domain behavior. The repo also preserves a runnable `poc/` as evidence, not as the 1.0 architecture.

## What this project does not do

- It is not a hosted multi-user service today.
- It does not expose authentication or authorization.
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
| `apps/mcp` | Agent-facing MCP boundary | Current transport is stdio. |
| `packages/runtime` | Shared application service layer | Orchestrates graph, categories, capture, projections, scans, and storage. |
| `packages/graph-core` | Canonical semantic graph types, validation, and command application | Pure domain logic. |
| `packages/projections` | View derivation for overview, dive-in, and project maps | Must not mutate graph semantics. |
| `packages/capture` | Capture policy, feedback events, and proposal lifecycle | Models intent and reviewable changes. |
| `packages/scans` | Repository scan profiles, validation, evidence, and comparisons | Validates agent-performed scans. |
| `packages/storage` | SQLite persistence and ZIP import/export bundle support | Current first-pass persistence adapter. |
| `packages/api-contracts` | Shared request/response and contract validation types | Prevents divergent REST/MCP DTO semantics. |

## Runtime model

HiveMap currently runs as a local single-user Node.js workspace. The web UI talks to the REST API, and an MCP client talks to the MCP server; both point at the same SQLite database file under `.hivemap/`. The MCP process is separate from the API process but delegates to the same runtime package. The UI is built with Vite and expects the API on `127.0.0.1`. The current alpha intentionally fails instead of silently switching ports or transport behavior.

## Deployment model

The supported model today is local development and local evaluation only. The repo has no committed Docker or HiveForge deployment contract yet. Hosted/containerized and Streamable HTTP MCP shapes are under consideration but are not current repository behavior.

## Data/storage model

- Canonical semantic graph state persisted in SQLite through `packages/storage`
- Category catalog and assignments
- Capture policy, feedback events, and proposals
- Projections and snapshots
- Repository scan profiles, coverage, findings, completed runs, and comparisons
- Portable `.hivemap.zip` workspace bundles for export/import
- POC assets and snapshots kept under `poc/` for evidence only

## External integrations

- MCP SDK for agent tool transport
- React Flow for graph rendering in the browser UI
- Node.js `node:sqlite` for the current persistence backend
- Optional HiveMind linkage for durable learnings and decisions by explicit ids/links

## Important risks

- Shared SQLite across API and MCP is acceptable for local alpha but is a constraint for hosted/containerized evolution.
- The current runtime has no auth/authz and must not be exposed directly to a network.
- Review and scan workflows depend on agent quality; HiveMap validates outputs but does not replace agent judgment.
- Drift between `docs/architecture.md`, `docs/specs/*`, and implementation would directly weaken the product's SSOT model.
- There is a real risk of turning HiveMap into a generic diagram editor if graph/projection boundaries slip.

## Things AI agents must not guess

- Never guess missing workspace, graph, projection, finding, or proposal ids.
- Never treat UI layout or manual node motion as semantic truth.
- Never treat `poc/` as 1.0 architecture without an explicit decision.
- Never infer missing categories, scan outputs, or repository coverage silently.
- Never expose or host the current alpha as if it were a secured service.
