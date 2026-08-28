# HiveMind Rules — HiveMap

HiveMind is durable project memory for HiveMap work. HiveMap itself should remain a separate concept graph tool.

When HiveMind is available, treat it as required workflow support for meaningful development work, not an optional afterthought.

## Store In HiveMind

- Product learnings from POC or user testing.
- Architecture decisions.
- Failed assumptions.
- Category model changes.
- Projection model changes.
- Capture policy changes.
- Integration decisions between HiveMap and HiveMind.

## Do Not Store

- Raw conversation transcripts.
- Secrets or credentials.
- Noisy implementation steps.
- Unconfirmed speculation as durable fact.

## Suggested Tags

- `HiveMap`
- `Conversation Map`
- `Project Map`
- `capture-policy`
- `category-overlay`
- `projection`
- `dive-in`
- `POC`

## Workflow

1. Resolve the HiveMind project first. Do not guess the project id when `project_resolve` can confirm it.
2. Read `rules_get` before substantive work so the active enforceable rules are visible.
3. Open `session_start` for the work unit and `context_open` for the active feature.
4. Read `context_get_project_brief` through the feature-scoped context token.
5. Search recent learnings or entries when touching capture, projection, categories, storage, runtime, scans, or MCP/API.
6. Record durable outcomes with the right entry type:
   - `decision` for settled direction,
   - `progress` for meaningful completed milestones,
   - `feedback` for user/testing friction,
   - `risk` for unresolved concerns,
   - `tooling_note` for workflow behavior worth repeating or avoiding.
7. Link relevant repo files, specs, commands, or exported workspace artifacts.
8. Close the active context after the work unit. Do not rely on long-lived dangling context tokens.

## Active Project Ruleset

The active HiveMind ruleset is the short, enforceable projection of repository
governance. The canonical implementation detail remains in `AGENTS.md` and
`docs/ENGINEERING_RULES.md`.

The ruleset must retain checks for:

- correct HiveMind bootstrap and context hygiene,
- a durable HiveMind outcome for meaningful work,
- docs and typed contracts updated with durable behavior,
- strict module separation and required responsibility headers,
- semantic graph authority preserved across projections, UI, transports, and storage,
- explicit inward dependency direction and boundary-owned side effects,
- verification evidence that exercises the changed surface.

Do not copy the full engineering checklist into HiveMind. Keep stable,
project-wide invariants in the ruleset and contextual review detail in
`docs/ENGINEERING_RULES.md` plus `docs/ai/REVIEW_CHECKS.md`.

## Required Tool Sequence

For meaningful HiveMap development work, the default sequence is:

1. `project_resolve`
2. `rules_get`
3. `session_start`
4. `context_open`
5. `context_get_project_brief`
6. `learning_get_recent` and/or `entry_search`
7. implementation work
8. durable HiveMind write
9. `context_close`

Do not treat HiveMind as only a `learning_capture` sink. The project/session/rules layer is part of the workflow contract.

## Minimum Expectations

For meaningful HiveMap work, do not finish the task with all durable context left only in chat if any of the following happened:

- storage or deployment direction changed,
- a reusable workflow pattern was discovered,
- a product or architecture decision was made,
- a significant failure or risk was diagnosed,
- scan behavior or projection semantics changed.

If no HiveMind update was needed, say so explicitly in the final summary.

## Near-Term Focus

During the current delivery phase, pay special attention to durable memory for:

- storage/backend decisions after SQLite,
- container/runtime shape,
- local Docker workflow and health checks,
- assumptions needed before HiveForge integration,
- any rule about single-runtime versus split-process deployment.

For Project Knowledge Maps, HiveMind contributes decisions, rationale, learnings, risks, and open threads. Store only explicit references and bounded summaries in HiveMap; do not copy raw transcripts or turn HiveMind history into current product truth.
