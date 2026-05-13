# AGENTS.md — HiveMap

This repository contains HiveMap, an AI-assisted concept graph workspace for live conversations and project reasoning.

The `poc/` directory is a delivered proof of concept. It is evidence, not the architecture for 1.0.

## Non-Negotiable Rules

- No defensive coding.
- No silent fallbacks.
- No duplicate sources of truth.
- Fail fast on invalid input, invalid state, and missing required data.
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
- AI operating docs: `docs/ai/*`
- Contracts and schemas: `docs/specs/*`
- POC evidence and demo snapshots: `poc/`

If a source conflicts, this order wins:

1. `AGENTS.md`
2. `docs/specs/*`
3. `docs/architecture.md`
4. `docs/product/vision.md`
5. implementation evidence
6. POC artifacts

## Intended Repository Layout

- `apps/`: runnable applications.
- `packages/graph-core/`: semantic graph domain model and validation.
- `packages/projections/`: overview, dive-in, project map, and saved view projection logic.
- `packages/categories/`: category catalog and category assignment rules.
- `packages/capture/`: capture policy and agent-intent event contracts.
- `packages/storage/`: persistence adapters behind explicit interfaces.
- `packages/api-contracts/`: REST/MCP contracts if generated/shared code is needed.
- `docs/`: product, architecture, rules, and specs.
- `poc/`: throwaway proof of concept and demo evidence.

Do not create a package until it owns a clear concern.

## Module Boundaries

- Graph modules own graph invariants and validation only.
- Projection modules derive views from graph data; they do not mutate graph semantics.
- Capture modules model user/agent intent and feedback events.
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

## Before Editing

1. Read this file.
2. Read `docs/README.md`.
3. Read the relevant docs/specs.
4. Inspect existing code or POC evidence before changing behavior.
5. Identify the affected SSOT.

## Before Final Response Or Commit

- Run relevant checks from `docs/ai/COMMANDS.md`.
- Apply `docs/ai/REVIEW_CHECKS.md`.
- Apply `docs/ai/JESTER_CHECKS.md` for architecture, storage, API, async, or agent-mediated flows.
- Update docs/specs with behavior or contract changes.
- Record durable learnings in HiveMind when they change product or architecture direction.
