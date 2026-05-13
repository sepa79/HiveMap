# HiveMap First-Pass Design

This document turns the POC learnings into a first product design for HiveMap.

## Product Thesis

HiveMap is a shared visual reasoning workspace for a human and an AI agent.

The chat remains the place where reasoning happens. HiveMap becomes the place where the important structure of that reasoning is made visible: concepts, decisions, risks, unknowns, rules, evidence, dependencies, and reusable learnings.

HiveMap is not a transcript parser and not a diagram editor.

## What The POC Proved

- A live map changes the quality of conversation because both human and agent can point at the same structure.
- Agent-mediated updates are more valuable than manual graph editing.
- Human feedback gestures are useful when treated as intent signals.
- Flat graphs become visually noisy very quickly.
- Overview concepts and dive-in views are required.
- Categories are critical once the map becomes a project map, not only a conversation map.

## Alpha Direction

1. Start with Conversation Map.
2. Let it become Project Map naturally when the conversation is about a project.
3. Use categories to surface the extra project semantics: decisions, risks, rules, dependencies, stale concepts, and learnings.
4. Default capture mode is delegated.
5. MCP is the primary agent interface.
6. SQLite is the first real persistence layer.
7. Core packages and tests come before API/UI.

## Core User Experience

The default screen is a Conversation Map.

It shows a small number of high-level concepts, not every captured node. Each concept can be opened as a dive-in view with more detail.

The human can:

- ask the agent to capture something,
- delegate capture to the agent,
- request a proposed map update,
- mark something as wrong, unclear, important, risky, confirmed, stale, or experimental,
- move/group concepts to communicate intent,
- dive into an overview concept,
- switch from conversation view to project view.

The agent can:

- propose graph changes,
- apply graph changes under the active capture policy,
- explain why a node or edge exists,
- interpret feedback events,
- re-project the graph into a clearer overview,
- assign categories with provenance.

## Primary Objects

### Workspace

A workspace contains one or more maps for a project, conversation, or investigation.

### Semantic Graph

The semantic graph contains the canonical nodes and edges. It does not contain layout truth.

### Projection

A projection is a readable view over the graph.

Important projection types:

- `conversation-map`: the live discussion view.
- `project-map`: longer-lived project/system view.
- `overview`: high-level grouped view.
- `dive-in`: focused subgraph behind one concept.
- `snapshot`: saved view for demo/history/review.

### Category Overlay

Categories explain how humans should read a node, edge, or projection.

Initial semantic categories:

- `confirmed`: human-approved truth.
- `inferred`: agent inference or speculative interpretation.
- `critique`: challenge, contradiction, or skepticism.
- `risk`: known risk, dangerous shortcut, or technical debt.
- `learning`: reusable knowledge or proven pattern.
- `unknown`: ambiguity, missing evidence, or unclear ownership.
- `idea`: emerging concept or experimental direction.
- `rule`: mandatory constraint or architecture standard.
- `dependency`: cross-system dependency or shared context.
- `experiment`: prototype, POC, or operational test.
- `stale`: abandoned direction or zombie architecture.
- `critical`: critical alert, rule failure, security issue, or major drift.

Categories are not node types. A `decision` can be `confirmed`, `inferred`, `rule`, or `stale`.

Playful icon themes such as Banana/Opera/Jester can be added later as display packs over stable semantic ids.

### Capture Policy

Capture policy controls how information enters the graph.

Initial modes:

- `approved`: only human-approved updates are applied.
- `delegated`: the agent may apply useful updates. This is the alpha default.
- `proposed`: the agent prepares updates for human approval.
- `custom`: project-specific rule set.

## Main Views

### Conversation Map

Purpose: show what the current conversation is about.

Default contents:

- 3-8 overview concepts.
- active decisions/risks/questions if important.
- category badges.
- visible uncertainty and speculation.
- clear affordance to dive in.

### Dive-In View

Purpose: inspect one concept without overwhelming the overview.

Contents:

- local subgraph,
- notes,
- evidence,
- open questions,
- relevant categories,
- recent feedback,
- agent explanation.

### Project Map

Purpose: longer-lived map of a system or project.

Contents:

- components/systems,
- decisions,
- rules,
- risks,
- dependencies,
- stale concepts,
- reusable learnings.

Project Map uses the same graph model as Conversation Map but emphasizes governance, risk, evidence, and categories.

### Proposal Review

Purpose: keep agent interpretation inspectable.

The agent can propose:

- add/update node,
- add/update edge,
- assign/remove category,
- create/update projection,
- group nodes,
- create a dive-in view.

The human can approve, reject, or comment.

## Interaction Model

Human interactions should express intent, not mutate semantic truth directly.

Examples:

- Dragging nodes means “these feel related” or “this grouping is wrong.”
- Marking a node as unclear creates feedback.
- Opening a dive-in requests detail.
- Confirming a node assigns `Banana`.
- Challenging a node assigns or proposes `Jester`.
- Marking a risk assigns `Dumpster Fire` or creates a risk node.

Emergency manual editing can exist, but it must not be the main UX.

## First Useful Product Slice

The first non-throwaway version should support:

1. Create workspace/map.
2. Add/update graph nodes and edges through MCP-first commands.
3. Assign categories.
4. Define capture policy.
5. Render overview projection.
6. Open dive-in projection.
7. Record feedback events.
8. Let agent read feedback and apply or propose graph updates according to policy.
9. Save snapshots.

Authentication, collaboration, advanced layout optimization, and deep HiveMind integration are not required for the first product slice.

## Success Criteria

HiveMap 1.0-alpha succeeds if:

- a human can run it locally,
- an AI agent can update the graph through explicit tools,
- the map remains readable after a real conversation,
- overview/dive-in reduces visual overload,
- categories make trust/risk/uncertainty obvious,
- delegated capture can keep up with a real conversation,
- feedback events help the agent improve the map,
- snapshots preserve useful demo/review states.

## Non-Goals For First Implementation

- Automatic capture of every message.
- Full multi-user collaboration.
- Production authentication.
- General-purpose diagram editor.
- AI layout optimization.
- Tight HiveMind coupling.
- Treating the POC JSON files as the production schema.
