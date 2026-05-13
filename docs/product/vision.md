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

## Capture Modes

- `Approved`: only human-approved information is saved.
- `Delegated`: the agent chooses what is worth saving.
- `Proposed`: the agent suggests changes before applying them.

## Key Product Rule

The human communicates intent. The agent interprets intent. The graph model changes through explicit API operations.
