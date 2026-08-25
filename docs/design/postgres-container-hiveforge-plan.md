# Postgres, Container, HiveForge Plan

Last updated: 2026-08-24

## Goal

Upgrade HiveMap from the current local-first SQLite alpha shape to a container-friendly runtime built on Postgres with `pgvector`, then use that runtime as the base for HiveForge deployment and later hosted MCP work.

## Locked Direction

- [x] HiveMind is the default durable memory layer for meaningful HiveMap development work when available.
- [x] Runtime storage direction is `Postgres + pgvector`.
- [x] ZIP export/import is the canonical workspace migration path between storage backends.
- [x] Local Docker runtime comes before HiveForge integration.
- [x] HiveForge integration comes before hosted Streamable HTTP MCP work.
- [x] Embedding generation and vector-assisted product features were deferred from the base execution track and can be pulled forward afterward as a separate slice.
- [x] Local packaging target is one self-contained container that bundles HiveMap, Postgres, plugins, and local model-serving dependencies.
- [x] Local runtime should not require user-supplied DB URLs or database file paths.
- [x] ZIP export remains a normal download flow.
- [x] Local `stdio` MCP is not part of the target runtime shape.

## Non-Goals For This Plan

- [ ] Keep SQLite as a supported runtime backend.
- [ ] Build a direct SQLite-to-Postgres live migration path.
- [ ] Split REST and MCP into separate deployed services before the containerized local runtime is proven.
- [ ] Make vector similarity the source of truth for graph mutations.
- [ ] Block the Postgres/container/HiveForge path on embedding-provider work.
- [ ] Preserve local `stdio` MCP as part of the new base runtime contract.

## Current Execution Scope

- [x] This tracked execution path covers Postgres runtime, containerization, local Docker validation, and HiveForge readiness.
- [x] The base Postgres/container/HiveForge milestone did not block on embedding-provider work; provider-backed refresh/backfill is now a follow-on slice on top of that base.
- [x] `pgvector` remains part of the target backend direction, but vector-powered behavior is not required to complete the base runtime/container milestone.
- [x] Once the remaining Phase 4 and Phase 6 work is closed, the next deliberate feature track should help agents calibrate scans, understand unfamiliar repositories, and validate findings from repository-index structural facts rather than from PocketHive-specific heuristics.

## Phase 0 — Workflow Baseline

- [x] Commit the updated development rules in `AGENTS.md` and `docs/ai/HIVEMIND_RULES.md`.
- [ ] Keep HiveMind entries up to date for decisions, risks, and meaningful implementation progress during this plan.
- [ ] Use this file as the task tracker and update checkboxes as milestones move.

## Phase 1 — ADR And SSOT Updates

- [x] Add an ADR that makes `Postgres + pgvector` the only runtime storage backend.
- [x] Update `docs/architecture.md` to reflect the post-SQLite direction.
- [x] Update `docs/design/technical-design.md` so SQLite is no longer presented as the intended runtime destination.
- [x] Update `docs/specs/storage-format.md` for the new storage direction and boundaries.
- [x] Update `README.md` to describe the future local Docker/Postgres path without claiming it exists before implementation.

## Phase 2 — Storage And Data Model Design

- [x] Define the Postgres schema for workspaces, graph nodes/edges, categories, feedback, proposals, projections, scans, findings, and comparisons.
- [x] Make `docs/specs/storage-format.md` the concrete Postgres schema source of truth instead of leaving schema details in a separate design-only document.
- [x] Replace the current storage-schema-coupled bundle validator with an explicit backend-independent ZIP compatibility contract before calling the migration boundary complete.

## Phase 3 — Runtime Refactor

- [x] Introduce a runtime/API store interface so core logic no longer depends directly on one concrete persistence adapter.
- [x] Implement the Postgres storage adapter.
- [x] Remove SQLite-specific entrypoint and runtime config assumptions such as `--db`, `HIVEMAP_DB_PATH`, and `.hivemap/local.sqlite`.
- [x] Remove SQLite as the application runtime path.
- [x] Keep REST and MCP semantics unchanged while the backend changes underneath.
- [x] Add focused tests for the Postgres-backed runtime behavior.

## Phase 4 — Local Container Runtime

- [x] Add a production-oriented `Dockerfile` for HiveMap.
- [ ] Build one self-contained local container image that runs HiveMap, Postgres, plugins, and local model-serving dependencies together.
- [x] Make persistence optional through a mounted filesystem path for Postgres data.
- [x] Keep local startup free of user-managed DB URLs or DB file paths.
- [x] Add healthcheck behavior and explicit runtime env vars for the container-owned runtime only.
- [x] Define startup/init/migration behavior for a fresh Postgres database inside the containerized runtime.
- [x] Verify local container workflow for workspace create, graph operations, projection create/read, and ZIP download/import.
- [x] Verify container restart behavior against a persisted Postgres volume without stale startup state.

## Phase 5 — Deferred Embeddings / Vector Workstream

- [x] Define how embeddings are stored and indexed with `pgvector`.
- [x] Document which entities get embeddings first and why.
- [x] Add a first bounded similarity query for “similar concepts”.
- [x] Add the first provider-backed explicit refresh/backfill flow for concept embeddings.
- [ ] Add duplicate or merge-candidate lookup for new or selected nodes.
- [ ] Add related-concept lookup across projections or map areas.
- [x] Decide whether similarity should be computed synchronously, asynchronously, or behind explicit refresh operations.
- [x] Add tests proving vector suggestions never mutate graph semantics directly.
- [x] Treat this phase as separate from the base Postgres/container/HiveForge execution track unless explicitly pulled forward.

## Phase 6 — HiveForge Integration

- [x] Add `hiveforge.yaml`.
- [x] Add `deploy/hiveforge/*` assets for at least one profile.
- [x] Start with a `docker-single` profile for local adapter smoke.
- [x] Add a `docker-swarm` profile so the current HiveForge environment can run the same packaged runtime.
- [ ] Validate the HiveForge runtime contract against the new containerized HiveMap shape.
- [ ] Run the intended loop: change -> build -> deploy -> e2e -> change.

Current state:
- Local HiveForge adapter smoke passes for `docker-single` by rendering Compose through Ansible and validating it with `docker compose config`.
- HiveForge on August 19, 2026 is connected to trusted-LAN Forgejo at `http://192.168.88.50:3001/`.
- HiveMap now deploys to the shared `swarm` environment as `hivemap-development` through the `docker-swarm` profile.
- The temporary swarm dev path is pinned to `.50` with an explicit placement constraint because its Postgres bind source is node-local and currently lives under `/opt/pockethive-data/hivemap/data`.
- Remaining HiveForge work is about tightening the local development loop and adding stronger e2e coverage, not proving first deploy viability.

## Phase 7 — Hosted MCP Follow-Up

- [ ] Decide whether Streamable HTTP MCP lives in the same runtime process as REST or a separate boundary.
- [ ] Define the auth story before any non-local exposure.
- [ ] Add hosted MCP only after the local container runtime and HiveForge path are stable.

## Next Feature Track After Base Runtime

Keep the base runtime/container/HiveForge plan intact. Replace only the post-base feature roadmap with a repository-understanding and calibrated-review track.

### Goal

Help an agent reach a correct working model of an unfamiliar repository before it files durable findings. HiveMap should reduce uncertainty first, not just produce scan output faster.

### Guardrails

- [ ] Keep the track product-agnostic: derive candidate boundaries, contracts, tests, and findings from repository-index structural facts rather than repository-specific hardcoding.
- [ ] Keep PocketHive and HiveMap as proving repositories for the workflow, not as special-case contracts.
- [ ] Keep hosted MCP as a separate follow-up after the runtime base is stable; it must not displace this track.
- [ ] Prefer externalized scan recipes and overlays over encoding repository-family assumptions in code.

### Phase A — Calibration Contract

- [ ] Treat `scan_start` as an explicit calibration-stage response, not only as run creation.
- [ ] Return clear workflow state for the provisional pass, including calibration checklist, overlay status, coverage summary, and next recommended actions.
- [ ] Require one explicit decision after the provisional pass: continue, refine overlay, correct coverage, build boundary map, or restart the scan.
- [ ] Make MCP/API responses distinguish between findings-ready and calibration-not-yet-complete states.

### Phase B — Repository Understanding Artifacts

- [ ] Treat boundary maps as working understanding artifacts before they become completed-scan evidence.
- [ ] Keep the first artifact set focused on repository topology, candidate boundaries, owned paths/symbols, public entrypoints, contract links, test links, inter-boundary relations, and open questions.
- [ ] Support code, test, and tool surfaces equally, including file-based CLI/tool entrypoints that are not symbol-exported.
- [ ] Keep artifact generation fail-fast and repo-overridable when roots, test families, or contract markers do not match the active repository.

### Phase C — Finding Validation Workflow

- [ ] Help the agent distinguish between a likely real finding, a profile/overlay gap, a missing-evidence gap, and a still-ambiguous repository shape.
- [ ] Add criterion-oriented evidence recipes so the preferred review unit is a bounded packet, not an unstructured reread of the whole included inventory.
- [ ] Preserve open questions as first-class calibration output instead of forcing premature findings.
- [ ] Use completed-scan comparison to show whether calibration or heuristic changes improved the result or only changed wording.

### Phase D — Externalized Scan Recipes

- [ ] Move more repository-shaped scan behavior out of code and into explicit profile/overlay recipes.
- [ ] Cover roots, contract markers, test families, entrypoint rules, ignore rules, and evidence-selection hints with replaceable profile fields where practical.
- [ ] Keep merge vs replace semantics explicit and fail fast on invalid overlays; no silent fallback to guessed behavior.
- [ ] Document repeatable process for building repository-specific overlays from a first calibration pass.

### Phase E — Comparison-Driven Tuning

- [ ] Use repeat scans and before/after comparison as the main tuning mechanism for heuristics and workflow changes.
- [ ] Track whether a change removed false boundaries, improved contract/test linking, or reduced repeated open questions.
- [ ] Tune heuristics only after repeated evidence across multiple repositories, not from one-off special cases.
- [ ] Keep the tuning benchmark set small, safe, and diverse: small libraries, CLI repos, docs-heavy repos, and at least one larger multi-boundary repository.

### Later Follow-Up

- [ ] Add additional repository-understanding layers such as authority/contract maps, test-to-boundary maps, and risk maps once the first calibration workflow is stable.
- [ ] Capture repository-specific understanding as durable reusable scan knowledge after a good first pass, instead of rediscovering the same layout every run.
- [ ] Consider a human-facing calibration UI only after the MCP/API workflow proves useful in practice.

## Deferred Product Follow-Up

- [ ] Design read-only workspace clones as the future replacement for internal frozen checkpoints.
- [ ] Keep that work out of the current Postgres/container/HiveForge implementation slice.

## Exit Criteria

- [x] HiveMap runs locally in Docker on `Postgres + pgvector`.
- [x] ZIP export/import works correctly on the new backend.
- [x] HiveForge can deploy the new runtime through an explicit contract.
- [ ] Future hosted MCP work can build on a stable storage/runtime/deployment base instead of the old SQLite alpha shape.
