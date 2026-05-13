# Lessons Learned

Prefer storing lessons in HiveMind.

Use this file only:
- when HiveMind is unavailable,
- for portable repository-level lessons,
- for recurring production/project failure patterns that should travel with the repo.

Keep entries short and actionable.

## 2026-05-13 — AI project starter v2 is enough for HiveMap POC

`ai-project-starter-v2.zip` works as a project initialization aid: it provides baseline rules, AI workflow docs, review/Jester prompts, HiveMind guidance, and spec placeholders. It should not block this POC.

Potential v3 improvements should come from real friction observed during HiveMap POC instead of pre-optimizing the starter. Likely v3 candidates:

- project type profiles, especially `throwaway POC`,
- concrete HiveMind MCP workflow using `project_register`, `context_open`, `learning_search`, `learning_capture`, and `context_close`,
- a `POC_EXIT_CRITERIA.md` template,
- a short learning capture guide,
- lighter AGENTS rules for experiments that must avoid becoming accidental 1.0 architecture.

## 2026-05-13 — Manual graph editing should be emergency-only

Manual UI editing can break the important information flow: human intent should be expressed as feedback, then interpreted by the AI agent, then applied to the graph model through the API. Direct manual updates are useful as an emergency escape hatch, but they should stay hidden from the primary workflow.

Rule/action: keep the normal UI focused on selection, movement, comments, and feedback markers. Treat direct add/update controls as secondary emergency tooling unless a later POC learning proves otherwise.

## Template

```text
Date: YYYY-MM-DD
Area: TODO
Lesson: TODO
Trigger: TODO
Rule/Action: TODO
```
