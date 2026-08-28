# Postgres, Container, HiveForge Plan

Last updated: 2026-08-28

## Goal

Upgrade HiveMap from the local-first SQLite alpha shape to a container-friendly runtime built on Postgres with `pgvector`, validate it through HiveForge, and expose protected Streamable HTTP MCP from that runtime.

## Locked Direction

- [x] HiveMind is the default durable memory layer for meaningful HiveMap development work when available.
- [x] Runtime storage direction is `Postgres + pgvector`.
- [x] ZIP export/import is the canonical workspace migration path between storage backends.
- [x] Local Docker runtime comes before HiveForge integration.
- [x] HiveForge integration comes before hosted Streamable HTTP MCP work.
- [x] Embedding generation and vector-assisted product features were deferred from the base execution track and can be pulled forward afterward as a separate slice.
- [x] Local packaging target is one self-contained container that bundles the HiveMap API, built web assets, Postgres, and built-in repository indexing/scan handlers.
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
- [x] The base Postgres/container/HiveForge milestone does not include provider-backed embedding refresh/backfill or bundled model-serving. The removed experiment is archived as restorable evidence rather than active runtime scope.
- [x] `pgvector` remains part of the target backend direction, but vector-powered behavior is not required to complete the base runtime/container milestone.
- [x] Once the remaining Phase 4 and Phase 6 work is closed, the next deliberate feature track should help agents calibrate scans, understand unfamiliar repositories, and validate findings from repository-index structural facts rather than from PocketHive-specific heuristics.

## Phase 0 — Workflow Baseline

- [x] Commit the updated development rules in `AGENTS.md` and `docs/ai/HIVEMIND_RULES.md`.
- [x] Keep HiveMind entries up to date for decisions, risks, and meaningful implementation progress during this plan.
- [x] Use this file as the task tracker and update checkboxes as milestones move.

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
- [x] Build one self-contained local container image that runs the HiveMap API, built web assets, Postgres, and built-in repository indexing/scan handlers together.
  Current shape: Postgres data has the dedicated `/var/lib/hivemap/postgres` container path. There is no runtime plugin-loading contract and no bundled model-serving process.
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
- [ ] Restore or redesign provider-backed embedding generation only after an explicit use case and contract decision. The removed refresh/backfill and container model-serving experiment is preserved under `archive/deferred-ollama-embedding-provider/`.
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
- [x] Validate the HiveForge runtime contract against the new containerized HiveMap shape.
- [x] Close ruleset-v2 deployment findings: declare `hivemap-auth-token` as an
  external HiveForge/Docker secret, keep its value out of rendered Compose, and
  prove graceful API plus bundled-Postgres shutdown under container SIGTERM.
- [ ] Run the intended loop: change -> build -> deploy -> e2e -> change.

Current state:
- Local HiveForge adapter smoke passes for both `docker-single` and `docker-swarm` by rendering Compose through Ansible and validating each result with `docker compose config`.
- HiveForge on August 19, 2026 is connected to trusted-LAN Forgejo at `http://192.168.88.50:3001/`.
- HiveMap now deploys to the shared `swarm` environment as `hivemap-development` through the `docker-swarm` profile.
- The swarm profile requires an explicit HiveMap-owned node-local Postgres bind source and matching placement constraint; repository examples use `/opt/hivemap/postgres` and do not treat unrelated test-stack paths as product persistence.
- Remaining HiveForge work is about tightening the local development loop and adding stronger e2e coverage, not proving first deploy viability.

## Phase 7 — Protected Streamable HTTP MCP

- [x] Keep stateless Streamable HTTP MCP in the same runtime process and port as REST.
- [x] Require one explicit bearer token for REST and MCP; keep UI assets and health public.
- [x] Expose `/mcp` from the installed container runtime while retaining stdio only as transitional local tooling.
- [x] Keep the browser token tab-scoped in `sessionStorage`, provide an explicit
  clear action, and retain interaction evidence for save/use/clear behavior.

## Next Feature Track After Base Runtime

Keep the base runtime/container/HiveForge plan intact. Replace only the post-base feature roadmap with a repository-understanding and calibrated-review track.

### Goal

Help an agent reach a correct working model of an unfamiliar repository before it files durable findings. HiveMap should reduce uncertainty first, not just produce scan output faster.

### Guardrails

- [ ] Keep the track product-agnostic: derive candidate boundaries, contracts, tests, and findings from repository-index structural facts rather than repository-specific hardcoding.
- [ ] Keep PocketHive and HiveMap as proving repositories for the workflow, not as special-case contracts.
- [x] Keep Streamable HTTP MCP as a bounded follow-up after the runtime base without displacing repository-understanding work.
- [ ] Prefer externalized scan recipes and overlays over encoding repository-family assumptions in code.

### Phase A — Calibration Contract

- [x] Treat `scan_start` as an explicit calibration-stage response, not only as run creation.
- [x] Return clear workflow state for the provisional pass, including calibration checklist, overlay status, coverage summary, and next recommended actions.
- [x] Require one explicit decision after the provisional pass: continue, refine overlay, correct coverage, build boundary map, or restart the scan.
- [x] Make MCP/API responses distinguish between findings-ready and calibration-not-yet-complete states.

### Phase B — Repository Understanding Artifacts

- [x] Treat boundary maps as working understanding artifacts before they become completed-scan evidence.
- [x] Keep the first artifact set focused on repository topology, candidate boundaries, owned paths/symbols, public entrypoints, contract links, test links, inter-boundary relations, and open questions.
- [x] Support code, test, and tool surfaces equally, including file-based CLI/tool entrypoints that are not symbol-exported.
- [x] Keep artifact generation fail-fast when roots do not match the active repository, and keep test families plus contract markers repo-overridable through explicit overlays.

### Phase C — Finding Validation Workflow

- [x] Help the agent distinguish between a likely real finding, a profile/overlay gap, a missing-evidence gap, and a still-ambiguous repository shape.
- [ ] Add criterion-oriented evidence recipes so the preferred review unit is a bounded packet, not an unstructured reread of the whole included inventory.
  Current progress: duplicate-authority, duplicate-responsibility, missing-owner, and stale-documentation now use explicit profile/overlay recipe fields instead of hidden runtime defaults.
- [ ] Preserve open questions as first-class calibration output instead of forcing premature findings.
- [ ] Use completed-scan comparison to show whether calibration or heuristic changes improved the result or only changed wording.

### Phase D — Externalized Scan Recipes

- [ ] Move more repository-shaped scan behavior out of code and into explicit profile/overlay recipes.
  Current progress: boundary-map roots/markers, duplicate-authority selection, duplicate-responsibility selection, missing-owner materiality, and stale-documentation currentness are now repo-overridable through the profile overlay contract.
- [ ] Cover roots, contract markers, test families, entrypoint rules, ignore rules, and evidence-selection hints with replaceable profile fields where practical.
- [ ] Keep merge vs replace semantics explicit and fail fast on invalid overlays; no silent fallback to guessed behavior.
- [ ] Document repeatable process for building repository-specific overlays from a first calibration pass.
  Current progress: `scan_profile_overlay_help` now returns an overlay-build workflow plus symptom-to-field hints, and the repository scan workflow spec documents the repeatable pass.

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
- [x] Protected Streamable HTTP MCP builds on the shared Postgres runtime instead of the old SQLite alpha shape.
- [x] The local closeout matrix passes `npm run verify`, all real-Postgres suites, UI token save/use/clear, both HiveForge profile renders, and a built-image smoke covering REST, MCP, persistence, restart, SIGTERM, and Postgres outage/recovery.
