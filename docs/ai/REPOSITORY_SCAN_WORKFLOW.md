# Repository Scan Workflow

Use this workflow when an agent maps documentation, code, tests, deployment, or another repository concern through HiveMap.

## Start

1. Read the target repository rules and canonical docs.
2. Load the target HiveMap workspace.
3. Call `scan_profile_list` and select an explicit profile id and version.
4. Resolve or create a completed repository index for the target repository and revision.
5. Call `scan_start` with the explicit `repositoryIndexId`. Treat the returned instructions, derived coverage, criteria, SSOT order, outputs, and overlay status as a provisional run checklist, not immediate permission to file final findings.

## Calibration Loop

Before recording findings on a new repository shape or newly refined profile, run one explicit calibration pass:

1. Review the `scan_start` response for effective profile identity, overlay status, included inventory shape, and coverage warnings.
2. Call `repository_evidence_candidates` for representative criteria before broad repository reading.
3. Record one explicit calibration decision with `scan_calibration_decide`: `continue`, `refine-overlay`, `correct-coverage`, `build-boundary-map`, or `restart-scan`.
4. For code/test/tool scans, call `scan_boundary_map_build` after recording `build-boundary-map` when the repository shape is new, uncertain, or suspiciously broad.
5. Inspect the preliminary output for structural mismatches such as fixture corpora treated as first-class boundaries, missing docs or CLI surfaces, helper exports treated as public API, or tests attached to the wrong boundary.
6. Use `scan_finding_validate` for representative criteria once the provisional repository shape looks coherent enough to distinguish real repository gaps from calibration defects.
7. If the profile shape is wrong, call `scan_profile_overlay_suggest` for one concrete symptom first, then refine the repository-local overlay or criterion-oriented evidence recipe fields, including duplicate-authority claim/topic selectors, missing-owner materiality markers, stale-documentation currentness markers, or duplicate-responsibility symbol/path selectors, or record one explicit coverage correction, and then restart the scan from the same completed repository index with a new scan id.
8. Only after the preliminary pass looks coherent should the agent record `continue` and proceed into the normal findings workflow.

This loop is the preferred place to discover that a repository needs different include/exclude scope, SSOT order, criteria emphasis, or boundary-map heuristics. Do not paper over those issues by pushing low-confidence findings into the first pass.

## Overlay Build Process

Use the same repeatable process for any repository:

1. Start from one completed repository index and one provisional `scan_start`; do not tune overlay fields against an unbounded local working tree.
2. Look at one concrete calibration symptom first: wrong roots, wrong test/contract linking, noisy authority packets, missing-owner materiality drift, stale-documentation currentness drift, or mis-ranked SSOT.
3. Call `scan_profile_overlay_help` and pick the smallest matching field set from `symptomToFieldHints` instead of editing unrelated fields.
4. Call `scan_profile_overlay_suggest` with that symptom id to get a repo-aware YAML scaffold seeded from the active effective profile and current boundary-map config.
5. Change recipe fields before broad scope fields when the problem is packet shape; change scope fields before recipe fields when the wrong files are included at all.
6. Record `refine-overlay`, restart the scan from the same repository index, and compare whether the new provisional pass removed the original symptom.
7. Keep only overlay fields that changed calibration outcome; remove guesses that did not materially change coverage, boundary shape, or evidence packets.

## Retrieve Evidence Packets

1. For each profile criterion, call `repository_evidence_candidates` first when the selected profile/index combination exposes bounded candidates.
2. Treat each returned candidate as the primary review unit for that criterion.
3. Use `candidate.kind` to separate machine-proven evidence from interpretation work.
4. Read beyond the returned packets only when the candidate itself points to a missing or ambiguous source that must be verified.
5. If a criterion currently returns no evidence candidates, fall back to the derived included coverage for that criterion and record the gap as workflow feedback when it materially increases agent discovery work.

The current documentation/SSOT slice is intentionally selective:

- contradictory-claim packets should already be narrowed to explicit conflicting status/selection language about the same concern;
- broken-reference packets may point at missing files or missing heading fragments;
- duplicate-authority packets should already be topic-aware rather than broad pairwise authority matches;
- stale-documentation packets should already be narrowed to lower-precedence, current-looking docs that conflict with stronger SSOT sources;
- missing-owner packets should prefer material docs over generic glossary/history pages.
- When those packet shapes are wrong for the repository, prefer changing the explicit recipe fields in the repo-local overlay over adding more runtime heuristics.

## Review Derived Coverage

1. Use the derived `coverage` returned by `scan_start` as the normal bounded inventory for the run.
2. Review only `coverage.included` sources during normal scan execution, and prefer evidence-candidate packets over broad file-by-file reading when they are available.
3. Call `scan_record_coverage` only when the derived inventory needs one explicit full correction, and record `correct-coverage` first.
4. If corrected coverage is recorded, replace the entire discovered, included, excluded, and failed inventory in one operation.

Coverage is evidence of what the scan considered. A source that was not discovered cannot appear as included, excluded, or failed.

## Map And Record Findings

1. Use explicit `graph_command` operations to map bounded concepts and relationships after reviewing the selected evidence packets for the active criterion.
2. Call `scan_finding_validate` before `scan_finding_create` for each suspected bounded problem, passing the reviewed `boundaryMap` when the scan depends on repository structure.
3. Record `continue` before calling `scan_finding_create`.
4. Call `scan_finding_create` only for bounded problems whose validation is now `likely-real-finding`. Documentation scans commonly use conflicts, stale claims, missing ownership, implementation drift, broken references, or quality problems. Technical scans should use precise kinds such as architecture-risk, runtime-risk, authority-gap, test-gap, or deployment-risk when those better describe the cleanup.
5. Give every finding a stable semantic fingerprint that should recur across scans when the same problem remains.
6. Attach exact source references, bounded claims, criterion ids, affected concepts, severity, confidence, and a recommended action.
7. Conflict findings require at least two claims.
8. Create a findings-first overview projection using the stable `Critical`, `High`, `Medium`, and `Low` priority columns from the scan contract. Keep finding kind visible on each card and keep the underlying domain map as a separate view.
9. Verify that diving into a finding shows the finding and every concept named by `affectedNodeIds`; source claims remain in the detail panel.
10. Add a projection orientation note describing what the scan map is for, how priority columns and finding kinds are used, how to open evidence, and how Back returns to the review queue.
11. Verify the same overview → finding → overview transition with both the application Back button and browser Back.

Do not create a finding merely because a file changed. Record a bounded semantic problem supported by the selected criterion.

## Complete

1. Confirm every profile criterion was applied, including criteria that produced zero findings.
2. Confirm every required output exists.
3. If calibration is still not `findings-ready`, either restart after tuning or provide an explicit `calibrationOverrideReason` that explains why freezing the run is still intentional.
4. Call `scan_complete` with the exact criterion and output ids.
5. Fix incomplete coverage or evidence if HiveMap rejects completion. Do not bypass validation.

Completion freezes finding evidence and the graph digest for the run. Active finding nodes may later gain acknowledgement or resolution evidence without rewriting the completed baseline.

## Verify A Fix

1. Start a new run with the same profile against the changed repository.
2. Resolve or create a completed repository index for the changed revision and start the run from that index.
3. Use the newly derived coverage, recording an explicit override only when correction is required.
4. Emit findings that still exist using the same fingerprints.
5. Complete the second run.
6. Call `scan_compare` with the baseline and verification scan ids.
7. Investigate every `new`, `regressed`, or `unverifiable` item.
8. Update active resolved findings through `finding_update` with explicit resolution evidence.
9. Retain both immutable runs and their comparison in the workspace as the current verification evidence.

## Portability Status

The current runtime has no workspace or project import/export operation. Do not claim cross-instance portability or attempt to move scan state through an undocumented format. The deferred direction is the versioned streaming NDJSON full-project snapshot described in `docs/specs/storage-format.md`; implementation belongs to a later explicit work unit.
