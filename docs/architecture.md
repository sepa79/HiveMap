# HiveMap Architecture

This is the architecture direction for HiveMap 1.0. The POC is evidence, not a blueprint.

## Purpose

HiveMap turns intentional conversation capture into a persistent semantic graph and human-readable visual projections.

## Core Principle

The semantic graph is the source of truth. Everything visual is a projection.

```text
capture policy + human/agent intent
  -> validated graph command
  -> semantic graph
  -> projection/view model
  -> UI
  -> feedback event
  -> agent interpretation
  -> next graph command
```

## Main Components

| Component | Responsibility | Must not do |
|---|---|---|
| Graph Core | Node/edge model, validation, graph mutation commands | Store UI layout or agent guesses as truth |
| Capture | Capture policy, feedback events, agent intent events | Parse every message automatically by default |
| Categories | Category catalog and category assignment validation | Replace core node types |
| Projections | Overview concepts, dive-in views, project map views, saved snapshots | Mutate graph semantics |
| API/MCP | Explicit operations for agents and clients | Auto-switch protocols or hide failures |
| UI | Render projections and emit feedback | Become the semantic editor by default |
| Storage | Persist graph, views, snapshots, events | Invent duplicate schemas |
| Scans | Profile agent scans, validate coverage/findings, compare immutable run evidence | Crawl repositories or replace agent interpretation |

## Data Model Direction

Core graph:

- `GraphNode`: stable id, label, node type, optional notes, metadata references.
- `GraphEdge`: stable id, source, target, relation type/label, optional notes.
- `CategoryAssignment`: graph item id, category id, provenance, status.
- `CapturePolicy`: approved, delegated, proposed, or project-specific policy.
- `FeedbackEvent`: user gesture/comment/selection signal for agent interpretation.
- `Projection`: named view over a graph, including overview and dive-in views.

Node type answers “what kind of graph object is this?”

Category answers “how should humans read/trust/react to this?”

## Projection Direction

Flat graphs are not the product.

HiveMap should default to:

1. Overview concepts.
2. Dive-in views for focused detail.
3. Category overlays for trust/risk/uncertainty/urgency.
4. Saved views/snapshots for demos, history, and review.

## Integration Direction

HiveMap should remain independent from HiveMind.

- HiveMap stores concept graph and projections.
- HiveMind stores durable learnings, decisions, evidence, and workflow memory.
- They may reference each other through explicit ids or links.

No implicit coupling.

## Open Architecture Questions

- Which storage backend should 1.0 use first?
- Should MCP be primary and REST secondary, or REST first with MCP adapter?
- How should category assignment provenance be represented?
- What is the minimal projection schema for overview and dive-in views?
- How should agent proposals be reviewed before graph mutation?
