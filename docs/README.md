# HiveMap Docs

This directory is for the next implementation, not for preserving every POC detail.

## POC Learnings

- Conversation Map works as a second channel for live AI collaboration.
- Flat graphs become unreadable quickly.
- HiveMap needs overview concepts and dive-in views.
- Gestures should produce feedback events for the agent.
- Manual graph editing should be emergency-only.
- Categories should be a separate semantic/visual overlay, not a replacement for node type.
- Conversation Map can become Project Map when categories, rules, decisions, risks, and dependencies matter.

## Implementation Direction

Design HiveMap 1.0 around:

- semantic graph SSOT,
- projection/view models,
- category overlays,
- user-controlled capture policy,
- agent-mediated interpretation,
- saved snapshots or views for demos/history.

## Canonical Docs

- `../AGENTS.md`: contributor rules and SSOT order.
- `architecture.md`: system shape and module boundaries.
- `product/vision.md`: product intent and capture model.
- `design/first-pass-design.md`: first-pass design based on POC learnings.
- `design/interaction-model.md`: human/agent interaction model.
- `design/technical-design.md`: first technical design.
- `design/mvp-slice.md`: first implementation slice.
- `specs/`: contracts that implementation must follow.
- `ai/`: command, review, Jester, and HiveMind workflow rules.

## POC Boundary

Use `poc/` as evidence for product learning and demo snapshots. Do not treat its file formats, Express server, or React component structure as production architecture without a recorded decision.
