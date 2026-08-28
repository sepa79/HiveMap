# MCP Tools

Draft MCP surface for agents. MCP is the primary HiveMap agent interface for alpha.

## Required Tools

- `workspace_list`
- `workspace_get`
- `workspace_resolve`
- `project_create`
- `graph_get`
- `repository_index_list`
- `repository_index_get`
- `repository_index_start`
- `repository_index_execute`
- `repository_search`
- `repository_evidence_candidates`
- `scan_boundary_map_build`
- `scan_profile_overlay_help`
- `scan_profile_overlay_suggest`
- `graph_command`
- `category_assign`
- `projection_get`
- `projection_create`
- `feedback_list`
- `proposal_create`
- `proposal_approve`
- `proposal_apply`
- `scan_profile_list`
- `scan_list`
- `scan_start`
- `scan_record_coverage`
- `scan_calibration_decide`
- `scan_finding_validate`
- `scan_finding_create`
- `finding_update`
- `scan_complete`
- `scan_compare`
- `workspace_export_zip`
- `workspace_import_zip`

## Rules

- Workspace discovery must not require direct SQL or out-of-band database access.
- `workspace_resolve` must accept canonical id, slug, or exact workspace name.
- Workspace discovery errors must be stable and machine-distinguishable.
- Tools must validate required ids and fail clearly.
- Tools must not infer missing project/map ids.
- Tools must not silently create categories.
- Proposal and apply flows must be distinguishable.
- All graph mutations must be explicit.
- REST endpoints, if present, must call the same command handlers as MCP tools.
- Scan tools instruct and validate an agent; they do not silently crawl the repository.
- ZIP paths and import mode are explicit. Import never merges or rewrites ids silently.
- Repository-index tools persist explicit job records; they do not silently crawl or execute repository code in this phase.

## Implementation Direction

The MCP app exposes tool handlers over the shared HiveMap runtime. Transport-specific MCP server wiring must stay thin and must not reimplement graph, category, projection, feedback, or proposal behavior.

The installed/container runtime exposes stateless Streamable HTTP MCP at `/mcp` in the same HTTP process and port as REST. It creates transport/server wiring per request while sharing the process-owned `HiveMapRuntime` and Postgres store with REST. The endpoint requires the same exact bearer token as REST through `Authorization: Bearer <token>`. The HTTP runtime accepts exactly one source for that token: direct `HIVEMAP_AUTH_TOKEN`/`--auth-token` or file-backed `HIVEMAP_AUTH_TOKEN_FILE`/`--auth-token-file`; HiveForge uses the file-backed external-secret path. The legacy stdio entrypoint remains available only for explicit local development and is not part of the installed runtime contract.

For repository-backed scans, transport and agent UX should expose one explicit calibration checkpoint between `scan_start` and final findings. The caller should be asked to confirm that the effective profile, derived coverage, and preliminary evidence shape make sense before the workflow proceeds to durable findings or `scan_complete`.

## Workspace Discovery Flow

Agents discover a workspace before calling graph or scan tools:

1. `workspace_list({ query, limit, includeArchived })` returns lightweight canonical candidates in user-friendly order.
2. `workspace_resolve({ ref })` converts a user-facing id, slug, or exact name into one canonical workspace record.
3. `workspace_get({ workspaceId })` can fetch one canonical lightweight workspace record directly by id.
4. Tools such as `graph_get` and `scan_start` then use the returned canonical `workspaceId`.

Repository index flow in the current phase:

1. `repository_index_start({ workspaceId, index })` persists one explicit safe-mode request with stage `requested`.
2. `repository_index_execute({ workspaceId, indexId })` runs the current minimal safe-mode indexer for one persisted request.
3. `repository_index_list({ workspaceId })` lists persisted job records for that workspace.
4. `repository_index_get({ workspaceId, indexId })` reads one job record and its current lifecycle stage.
5. `repository_search({ workspaceId, indexId, query, limit })` searches bounded file/chunk evidence inside one completed repository index.
6. `repository_evidence_candidates({ workspaceId, indexId, profileId, profileVersion, criterionId, limit })` returns bounded criterion-scoped evidence packets plus the effective profile, overlay status, and coverage summary when HiveMap can pre-select deterministic or interpretation-ready sources.
7. `scan_profile_overlay_help({ workspaceId, profileId, profileVersion })` explains the optional repository-local overlay contract at `.hivemap/scan-profiles/<profile>.yaml`, including template, merge rules, defaults behavior, fail-fast validation, which profile fields are append-vs-replace, a repeatable overlay-build workflow, and symptom-to-field tuning hints.
8. `scan_profile_overlay_suggest({ workspaceId, scanId, symptomId })` returns the smallest repo-aware YAML scaffold for one explicit calibration symptom, seeded from the current in-progress scan's effective profile and active boundary-map config.

Scan flow in the current repository-index-backed phase:

1. `repository_index_start({ workspaceId, index })` persists one explicit repository-index request.
2. `repository_index_execute({ workspaceId, indexId })` completes the safe-mode file/chunk index for one exact revision.
3. `scan_start({ workspaceId, scan: { id, profileId, profileVersion, repositoryIndexId, actor, startedAt } })` starts one scan from that completed index, derives coverage from the effective profile include/exclude rules, snapshots that effective profile onto the run, and returns the base profile, effective profile, overlay status, coverage summary, calibration checklist, calibration assessment, decision guidance, and instructions.
4. The caller should treat `scan_start` as a calibration checkpoint and review the returned effective profile, overlay status, coverage summary, calibration assessment, and decision guidance before creating findings.
5. `repository_evidence_candidates(...)` should be called per criterion when the selected profile/rule can use bounded evidence packets instead of raw repository discovery; it also returns a calibration assessment and decision guidance for the current evidence state.
6. `scan_calibration_decide({ workspaceId, scanId, decision, rationale, recordedAt })` records one explicit next step for the run: `continue`, `refine-overlay`, `correct-coverage`, `build-boundary-map`, or `restart-scan`.
7. `scan_boundary_map_build({ workspaceId, scanId })` derives one candidate typed `boundaryMap` artifact from the current scan coverage plus the selected completed repository index facts, plus a calibration assessment and decision guidance for the structural result. The caller should record `build-boundary-map` explicitly before this step.
8. `scan_profile_overlay_suggest({ workspaceId, scanId, symptomId })` should follow `refine-overlay` when the caller wants the smallest repo-aware patch scaffold for one concrete calibration symptom instead of editing YAML ad hoc.
9. `scan_finding_validate({ workspaceId, scanId, criterionId, boundaryMap? })` classifies one criterion-level suspected issue as `likely-real-finding`, `profile-gap`, `missing-evidence`, or `ambiguous-shape` before the caller creates a durable finding node.
10. If calibration shows that the repository shape is wrong, the caller should refine the repository-local overlay or record one explicit coverage correction, then restart with a new scan id from the same completed repository index rather than forcing findings through the provisional run.
11. `scan_record_coverage({ workspaceId, scanId, coverage })` remains available only when the caller needs an explicit coverage override or correction, and should follow an explicit `correct-coverage` decision.
12. `scan_complete({ workspaceId, scanId, completedAt, appliedCriteria, declaredOutputs, boundaryMap?, calibrationOverrideReason? })` may carry an optional typed `boundaryMap` artifact, but only when `declaredOutputs` includes `boundary-map`.
13. Findings-bearing completion requires an explicit prior `continue` decision and still fails from a non-ready calibration state unless `calibrationOverrideReason` is supplied explicitly.

Overlay discovery rules in the current phase:

- Scan-profile overlays are optional repository-local YAML files under `.hivemap/scan-profiles/<profile>.yaml`.
- Missing overlay files keep the built-in profile defaults active.
- Invalid overlay files fail `scan_start` and `repository_evidence_candidates` clearly; there is no silent fallback.
- Overlay may replace repository-specific profile recipe fields such as name, description, instructions, source types, criteria, criterion-oriented evidence hints, SSOT order, required outputs, and boundary-map heuristics.
  Criterion-oriented recipe examples include duplicate-authority claim/topic selection, duplicate-responsibility symbol/path selection, missing-owner materiality markers, and stale-documentation currentness markers.
- Agents should treat `scan_profile_overlay_help.overlayBuildWorkflow` as the default step order for repository tuning after the first calibration pass, instead of editing overlay fields ad hoc.
- Agents should use `scan_profile_overlay_help.symptomToFieldHints` to choose the smallest field change that matches the observed calibration symptom before restarting the scan.
- Agents should use `scan_profile_overlay_suggest` to obtain a repo-aware starter patch for that symptom instead of manually copying active values from unrelated tool output.
- Agents should call `scan_profile_overlay_help` instead of guessing overlay fields or merge behavior.

`workspace_resolve` error codes:

- `workspace_not_found`: no exact id, slug, or name match exists.
- `workspace_ambiguous`: multiple exact name matches exist; `error.details.candidates` contains canonical candidates.
