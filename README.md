# HiveMap

HiveMap is an AI-assisted concept map for live conversations and project reasoning.

The POC proved the core loop:

1. Human and AI discuss a system or idea.
2. The human chooses what should enter the map, or delegates capture to the agent.
3. The agent updates a semantic graph through an API.
4. The UI shows a visual projection of the graph.
5. Human gestures and comments become feedback for the agent, not direct semantic edits.

## Current State

- `poc/` contains the delivered proof of concept.
- `poc/data/snapshots/` contains preserved demo graph states.
- `poc/data/category-catalog.json` contains the first category overlay model.

The next implementation should be designed from the POC learnings rather than by hardening the POC directly.

## POC Commands

```bash
cd poc
npm install
npm run dev
```

UI: `http://localhost:5173/`

API: `http://localhost:8787/api/graph`
