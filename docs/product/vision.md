# HiveMap Vision

HiveMap is a living concept graph for AI-assisted conversations.

It should help humans and AI agents keep shared context visible without turning the conversation into a transcript parser or a manual diagram editor.

## Core Concepts

- `Semantic graph`: source of truth for concepts and relationships.
- `Conversation Map`: current visual projection of what the discussion is about.
- `Project Map`: a longer-lived projection where decisions, risks, rules, dependencies, and stale concepts matter.
- `Overview concepts`: high-level groupings shown first.
- `Dive-in views`: focused subgraphs or details behind an overview concept.
- `Category overlay`: visual/semantic labels such as confirmed truth, inference, risk, unknown, rule, experiment, or stale architecture.
- `Feedback event`: a human gesture or comment that expresses intent for the agent to interpret.
- `Projection`: a named visual/readable view derived from the semantic graph.

## Capture Modes

- `Approved`: only human-approved information is saved.
- `Delegated`: the agent chooses what is worth saving.
- `Proposed`: the agent suggests changes before applying them.

## Key Product Rule

The human communicates intent. The agent interprets intent. The graph model changes through explicit API operations.

## Repository Scan Evidence

HiveMap can instruct an agent to scan a changing repository through a versioned profile. The agent records explicit coverage, semantic graph changes, and first-class findings. A second completed scan can be compared with the baseline, while both immutable runs remain available for human review and machine-verifiable evidence in the originating environment. Cross-instance portability is deferred to a future streaming NDJSON full-project snapshot.

HiveMap does not silently crawl or judge the repository. MCP provides the recipe and validation boundary; the agent performs discovery and interpretation.

## Category Language

The initial category vocabulary is intentionally expressive:

- `Banana`: confirmed human-approved truth.
- `Opera`: AI inference or speculative interpretation.
- `Jester`: critique or contradiction.
- `Dumpster Fire`: known risk or dangerous shortcut.
- `Hive`: reusable learning or proven pattern.
- `Fog`: unknown, ambiguous, or missing evidence.
- `Spark`: emerging idea.
- `Law`: mandatory rule or architecture standard.
- `Thread`: cross-system dependency or shared context.
- `Lab Rat`: experiment or operational test.
- `Ghost`: stale concept or abandoned direction.
- `Siren`: critical issue or rule failure.

Projects may define their own categories, but custom categories must be explicit project data.
