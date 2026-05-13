# Project Context — HiveMap POC

## Purpose

Validate whether an AI-assisted conversation can intentionally capture concepts into a visual graph, and whether human spatial feedback in the UI helps the agent improve the semantic model.

## What this project does

HiveMap POC is a local throwaway app with a small HTTP API, JSON file persistence, and a React Flow browser UI. The semantic graph is the source of truth. The UI displays the graph and records feedback gestures such as moving nodes, marking relationships unclear, or flagging important concepts. Agents can read the graph and feedback, then decide how to update the model.

## What this project does not do

- It is not HiveMap 1.0.
- It does not implement authentication, collaboration, production storage, or full MCP.
- It does not automatically parse every conversation.
- It does not treat UI layout as semantic truth.

## Main users / operators

- Human discussing a concept with an AI agent.
- AI agent adding graph nodes/edges and interpreting feedback.

## Main modules

TODO: List main modules/services/apps/packages.

| Module | Purpose | Notes |
|---|---|---|
| `server/` | Local HTTP API and JSON persistence | Module boundary for side effects |
| `src/` | React Flow UI | Emits feedback; does not own semantic truth |
| `data/` | Graph, view state, feedback event log | Throwaway local persistence |

## Runtime model

Local-only Node/Vite development runtime.

## Deployment model

No deployment for the POC.

## Data/storage model

- `data/graph.json`: semantic graph SSOT.
- `data/view.json`: canvas positions and UI state.
- `data/events.jsonl`: append-only feedback events.

## External integrations

HiveMind is used outside this app to capture durable learnings from the experiment.

## Important risks

- UI edits accidentally becoming semantic truth.
- Graph becoming noisy if capture is too automatic.
- POC growing into accidental architecture.
- Missing the learning capture before rebuilding 1.0.

## Things AI agents must not guess

- Do not infer that moved node positions mean a semantic relationship.
- Do not add hidden fallback persistence or alternate data sources.
- Do not turn this POC into production architecture without a recorded decision.
