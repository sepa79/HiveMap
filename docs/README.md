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
- saved views for demos/history; project portability is deferred.

## Canonical Docs

- `../AGENTS.md`: contributor rules and SSOT order.
- `ENGINEERING_RULES.md`: mandatory implementation boundaries, file shape, responsibility headers, and verification rules.
- `architecture.md`: system shape and module boundaries.
- `product/vision.md`: product intent and capture model.
- `design/first-pass-design.md`: first-pass design based on POC learnings.
- `design/interaction-model.md`: human/agent interaction model.
- `design/technical-design.md`: first technical design.
- `design/mvp-slice.md`: first implementation slice.
- `design/postgres-container-hiveforge-plan.md`: tracked delivery plan for the Postgres, container, and HiveForge upgrade path.
- `specs/`: contracts that implementation must follow.
- `evidence/`: bounded visual and interaction-review artifacts for changed UI behavior.
- `ai/`: command, review, Jester, and HiveMind workflow rules.
- `ai/KNOWLEDGE_MAP_WORKFLOW.md`: repeatable workflow for correlating concepts with docs, code, tests, assets, and HiveMind.
- `specs/repository-scan.md`: repeatable agent scans, finding evidence, and before/after comparison.
- `specs/web-workspace-ui.md`: browser workspace information architecture, projection controls, inspector, and visual acceptance.
- `ai/REPOSITORY_SCAN_WORKFLOW.md`: agent procedure for executing, verifying, and repeating a scan in one environment.

## POC Boundary

Use `poc/` as evidence for product learning and demo snapshots. Do not treat its file formats, Express server, or React component structure as production architecture without a recorded decision.
