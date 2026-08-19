# Bootstrap Prompt — Adapt The HiveMind Base Profile To HiveMap

You are adapting the HiveMind base AI starter files that were copied into HiveMap.

## Your job

Inspect the repository and update the starter files so they describe this specific project.

## Rules

- Do not blindly fill placeholders.
- Read the repository first.
- Infer facts from real files: README, build files, package manifests, Docker files, CI files, tests, docs, source layout.
- Do not invent architecture.
- If uncertain, write `TODO:` or `ASSUMPTION:` clearly.
- Do not modify application code unless explicitly asked.
- Prefer updating these AI/docs files over changing existing project behavior.
- Keep wording concise and practical.
- Preserve hard rules such as SSOT, explicit configuration, git safety, and no silent fallbacks unless the human explicitly asks to change them.
- In this repository, `AGENTS.md` and `docs/specs/*` outrank generic starter text.
- Do not weaken the semantic-graph-as-SSOT model.

## Files to update

- `AGENTS.md` only if the human explicitly wants starter rules merged into the repo rules
- `docs/ai/PROJECT_CONTEXT.md`
- `docs/ai/COMMANDS.md`
- `docs/ai/REVIEW_CHECKS.md`
- `docs/ARCHITECTURE.md` as a bootstrap summary that must align with `docs/architecture.md`
- `docs/specs/README.md`

## Steps

1. Read `AGENTS.md`, `docs/README.md`, `docs/architecture.md`, and the relevant specs first.
2. Identify language, frameworks, build tools, test tools, and current runtime/deployment model.
3. Fill `docs/ai/PROJECT_CONTEXT.md` with verified repository facts.
4. Fill `docs/ai/COMMANDS.md` with canonical commands that already work in this repo.
5. Update `docs/ai/REVIEW_CHECKS.md` with HiveMap-specific architecture and scan concerns.
6. Update `docs/ARCHITECTURE.md` as a concise bootstrap view aligned with `docs/architecture.md`.
7. Update `docs/specs/README.md` only if the current contract list is stale.
8. Leave `TODO:` or `ASSUMPTION:` only where the repository truly does not answer the question.
9. Stop and summarize what changed, what remains unknown, and whether the HiveMind marker should be refreshed.

## Output expected

- Updated Markdown files.
- Summary of detected stack.
- TODO list for missing project knowledge.
- No application code changes.
