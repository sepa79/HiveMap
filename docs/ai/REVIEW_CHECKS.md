# Review Checks — HiveMap

Use this checklist for code, docs, and architecture changes.

## Product Fit

- Does the change preserve semantic graph as SSOT?
- Does it keep UI projection separate from graph semantics?
- Does it preserve intentional capture?
- Does it avoid turning manual editing into the primary workflow?
- Does it support overview/dive-in instead of forcing a flat graph?

## Contracts

- Were durable behavior, architecture, or boundary changes written to the owning docs before or in the same change?
- Is the affected contract documented in `docs/specs/`?
- Is there one schema/contract per concern?
- Are node type and category overlay kept separate?
- Are capture policy, feedback event, and graph command shapes explicit?

## Agent Workflow

- Can an agent update the graph through explicit operations?
- Can the human inspect or challenge agent interpretation?
- Are speculative/inferred changes marked as such?
- Are proposal vs apply flows distinguishable?

## Module Integrity

- Does every production file own one coherent responsibility?
- Is each class in its own file, except for a rare tightly coupled value-object case?
- Do new or materially changed coordinators, adapters, boundary parsers/validators, projection builders, and subsystem controllers have an accurate `Responsibility / Must not / Contract` header?
- Does the implementation fit that header without broadening it for convenience?
- Are domain, storage/IO, runtime orchestration, transport, and UI concerns separated?
- Are dependencies explicit and directed inward toward typed contracts and domain invariants?
- Are there kitchen-sink files, vague helper modules, hidden global state, import-order coupling, or bidirectional subsystem dependencies?

Reject mixed-responsibility production files and undocumented boundary changes. Follow `docs/ENGINEERING_RULES.md` for the complete rule set.

## Authority And Adapters

- Does the semantic graph remain the only confirmed semantic authority?
- Do projections derive views without mutating graph meaning?
- Do REST and MCP delegate to the same typed runtime operations instead of duplicating business logic?
- Does storage only persist/hydrate explicit domain shapes without inventing recovery behavior?
- Do scan-validation modules remain free of repository crawling and other IO?
- Does UI state remain presentation state rather than a second graph store?

## Failure Handling

- Does invalid input fail clearly?
- Are missing graph ids, category ids, or projection ids rejected?
- Are there hidden fallbacks or silent recovery paths?
- Is persistence failure visible?

## Evidence

- Are meaningful tests added or updated?
- Does the evidence exercise the boundary that actually changed?
- Were real Postgres, transport, built-image, rendered-stack, or visual checks used when the changed surface requires them?
- Are unverified areas stated explicitly?
- Are POC learnings preserved when they are used as evidence?
- Are durable learnings recorded in HiveMind when product/architecture direction changes?
