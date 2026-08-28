# AGENTS.md — HiveMap

This repository contains HiveMap, an AI-assisted concept graph workspace for live conversations and project reasoning.

The `poc/` directory is a delivered proof of concept. It is evidence, not the architecture for 1.0.

## Non-Negotiable Rules

- Read before changing.
- Update the owning docs and typed contracts before or in the same change as durable behavior or architecture.
- No defensive coding.
- No silent fallbacks.
- No duplicate sources of truth.
- Fail fast on invalid input, invalid state, and missing required data.
- Keep strict module separation: one class per file, one clear responsibility per file, and no kitchen-sink production modules.
- Add the responsibility header required by `docs/ENGINEERING_RULES.md` to every new or materially changed coordinator, adapter, boundary parser/validator, projection builder, or subsystem controller.
- Keep side effects at module boundaries.
- Keep APIs explicit and typed.
- Keep semantic graph data separate from visual projections.
- Treat human gestures as feedback for the agent, not direct semantic mutations.
- Do not harden POC shortcuts into product architecture without a recorded decision.

## Product Invariants

- The semantic graph is the source of truth.
- UI maps are projections over the graph.
- Capture is intentional and governed by user intent.
- The human communicates intent; the agent interprets intent; the graph changes through explicit API operations.
- Manual graph editing is emergency tooling, not the primary workflow.
- Category labels are a semantic/visual overlay, not a replacement for node type.
- Conversation Map and Project Map use the same graph model with different projections.

## SSOT Map

- Product direction: `docs/product/vision.md`
- Architecture direction: `docs/architecture.md`
- Project rules and workflow: `AGENTS.md`
- Implementation engineering rules: `docs/ENGINEERING_RULES.md`
- AI operating docs: `docs/ai/*`
- Contracts and schemas: `docs/specs/*`
- POC evidence and demo snapshots: `poc/`

If a source conflicts, this order wins:

1. `AGENTS.md`
2. `docs/ENGINEERING_RULES.md`
3. `docs/specs/*`
4. `docs/architecture.md`
5. `docs/product/vision.md`
6. implementation evidence
7. POC artifacts

## Intended Repository Layout

- `apps/`: runnable applications.
- `packages/graph-core/`: semantic graph domain model and validation.
- `packages/projections/`: overview, dive-in, project map, and saved view projection logic.
- `packages/categories/`: category catalog and category assignment rules.
- `packages/capture/`: capture policy and agent-intent event contracts.
- `packages/scans/`: repository scan profiles, coverage, finding validation, and scan comparison.
- `packages/storage/`: persistence adapters behind explicit interfaces.
- `packages/api-contracts/`: REST/MCP contracts if generated/shared code is needed.
- `docs/`: product, architecture, rules, and specs.
- `poc/`: throwaway proof of concept and demo evidence.

Do not create a package until it owns a clear concern.

## Module Boundaries

- Graph modules own graph invariants and validation only.
- Projection modules derive views from graph data; they do not mutate graph semantics.
- Capture modules model user/agent intent and feedback events.
- Scan modules validate agent-executed scan evidence; they do not crawl repositories or perform IO.
- Category modules own category definitions and category assignment validation.
- Storage modules own IO and persistence.
- API/MCP modules expose explicit commands and validate at boundaries.
- UI modules render projections and emit feedback/intents.

## Required Design Shape

Every graph-changing flow should be expressible as:

```text
human intent or agent decision
  -> typed command/event
  -> validation
  -> graph mutation
  -> projection refresh
  -> optional learning/evidence capture
```

Do not let UI layout state become semantic truth.

## POC Policy

- Keep `poc/` runnable for demo and reference.
- Do not use `poc/data/*.json` as production schema.
- New implementation should copy learnings, not code structure, unless there is an explicit decision.
- Preserve `poc/data/snapshots/` unless the human asks to archive or remove them.

## HiveMind

Use HiveMind for durable learnings when available.

For meaningful development work, HiveMind is the default durable memory layer.

Meaningful work includes:

- product or architecture decisions,
- storage or deployment direction,
- MCP/API contract changes,
- scan workflow changes,
- important failures, risks, or proven fixes,
- reusable workflow learnings.

Store:

- product learnings,
- architecture decisions,
- failed assumptions,
- capture/category/projection model discoveries,
- operational evidence worth remembering.

Do not store:

- raw transcripts,
- secrets,
- noisy implementation steps,
- unreviewed speculation as fact.

Minimum workflow when HiveMind is available:

1. Resolve the project first. Do not guess the HiveMind project id when `project_resolve` can confirm it.
2. Read the active HiveMind project rules near the start of meaningful work.
3. Open a HiveMind session near the start of meaningful work.
4. Open a feature-scoped context token for the current work unit.
5. Read the bounded project brief through that context token.
6. Check recent learnings or entries when touching storage, runtime, projections, scans, or MCP/API boundaries.
7. Record at least the durable decision, progress, feedback, or risk that would otherwise be lost after the session.
8. Link the relevant repo files when they anchor the memory.
9. Close the active context token after the work unit. Do not leave routine work with dangling active contexts.

Required operational flow for meaningful work:

1. `project_resolve`
2. `rules_get`
3. `session_start`
4. `context_open`
5. `context_get_project_brief`
6. `learning_get_recent` and/or `entry_search`
7. implementation work
8. `learning_capture` and/or another durable entry write
9. `context_close`

Do not reduce HiveMind usage to `learning_get_recent` plus `learning_capture` on a long-lived token. That loses project rules, current open threads, and session hygiene.

HiveMap remains the semantic graph system of record for concept maps and projections. HiveMind remains the durable project memory for development workflow, decisions, and learnings. Do not collapse one into the other.

Durable product, architecture, and public-contract decisions must also be written to their canonical repository docs. HiveMind records decision history, evidence, risks, and learnings; it does not replace the repository SSOT.

## Near-Term Delivery Direction

The current near-term engineering direction is:

1. DB/storage upgrade suitable for hosted/containerized evolution.
2. One containerized local runtime tested through Docker.
3. Only after that, HiveForge integration and repeated deploy/e2e loops.

Until an explicit ADR says otherwise:

- prefer changes that move HiveMap toward a container-friendly single runtime,
- do not assume the current shared SQLite shape is good enough for hosted multi-process deployment,
- treat Streamable HTTP MCP and HiveForge integration as follow-on work after the local container/runtime slice is proven.

## Project Knowledge Maps

When work maps product concepts to documentation, code, tests, assets, or HiveMind evidence, read and follow:

- `docs/specs/project-knowledge-map.md`
- `docs/ai/KNOWLEDGE_MAP_WORKFLOW.md`

These maps are navigation and semantic correlation layers. They must preserve the owning source of truth for every referenced concern instead of copying detailed contracts into graph notes.

## Before Editing

1. Read this file.
2. Read `docs/README.md`.
3. Read `docs/ENGINEERING_RULES.md` for production implementation work.
4. If the task is meaningful HiveMap work and HiveMind is available, run the required HiveMind operational flow in this file before making substantive changes.
5. Read the relevant docs/specs.
6. Inspect existing code or POC evidence before changing behavior.
7. Identify the affected SSOT and module responsibility before editing.

## Repository Scans

Agent-driven documentation or code scans must follow `docs/specs/repository-scan.md`. The agent performs repository discovery and interpretation; HiveMap MCP supplies the versioned profile, validates coverage and findings, persists evidence, and compares completed runs.

Operational scan execution must also follow `docs/ai/REPOSITORY_SCAN_WORKFLOW.md`.

## Before Final Response Or Commit

- Run relevant checks from `docs/ai/COMMANDS.md`.
- Apply `docs/ENGINEERING_RULES.md` to every materially changed production file.
- Apply `docs/ai/REVIEW_CHECKS.md`.
- Apply `docs/ai/JESTER_CHECKS.md` for architecture, storage, API, async, or agent-mediated flows.
- Update docs/specs with behavior or contract changes.
- Record durable learnings in HiveMind when they change product or architecture direction, or explicitly state that no durable HiveMind update was needed.
- Close any active feature-scoped HiveMind context opened for the work unit.
