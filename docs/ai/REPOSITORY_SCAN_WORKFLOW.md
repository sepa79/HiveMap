# Repository Scan Workflow

Use this workflow when an agent maps documentation, code, tests, deployment, or another repository concern through HiveMap.

## Start

1. Read the target repository rules and canonical docs.
2. Load or import the target HiveMap workspace.
3. Call `scan_profile_list` and select an explicit profile id and version.
4. Resolve or create a completed repository index for the target repository and revision.
5. Call `scan_start` with the explicit `repositoryIndexId`. Treat the returned instructions, derived coverage, criteria, SSOT order, and outputs as the run checklist.

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

## Review Derived Coverage

1. Use the derived `coverage` returned by `scan_start` as the normal bounded inventory for the run.
2. Review only `coverage.included` sources during normal scan execution, and prefer evidence-candidate packets over broad file-by-file reading when they are available.
3. Call `scan_record_coverage` only when the derived inventory needs one explicit full correction.
4. If corrected coverage is recorded, replace the entire discovered, included, excluded, and failed inventory in one operation.

Coverage is evidence of what the scan considered. A source that was not discovered cannot appear as included, excluded, or failed.

## Map And Record Findings

1. Use explicit `graph_command` operations to map bounded concepts and relationships after reviewing the selected evidence packets for the active criterion.
2. Call `scan_finding_create` for bounded problems. Documentation scans commonly use conflicts, stale claims, missing ownership, implementation drift, broken references, or quality problems. Technical scans should use precise kinds such as architecture-risk, runtime-risk, authority-gap, test-gap, or deployment-risk when those better describe the cleanup.
3. Give every finding a stable semantic fingerprint that should recur across scans when the same problem remains.
4. Attach exact source references, bounded claims, criterion ids, affected concepts, severity, confidence, and a recommended action.
5. Conflict findings require at least two claims.
6. Create a findings-first overview projection using the stable `Critical`, `High`, `Medium`, and `Low` priority columns from the scan contract. Keep finding kind visible on each card and keep the underlying domain map as a separate view.
7. Verify that diving into a finding shows the finding and every concept named by `affectedNodeIds`; source claims remain in the detail panel.
8. Add a projection orientation note describing what the scan map is for, how priority columns and finding kinds are used, how to open evidence, and how Back returns to the review queue.
9. Verify the same overview → finding → overview transition with both the application Back button and browser Back.

Do not create a finding merely because a file changed. Record a bounded semantic problem supported by the selected criterion.

## Complete

1. Confirm every profile criterion was applied, including criteria that produced zero findings.
2. Confirm every required output exists.
3. Call `scan_complete` with the exact criterion and output ids.
4. Fix incomplete coverage or evidence if HiveMap rejects completion. Do not bypass validation.

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
9. Call `workspace_export_zip` to produce the verification bundle.

The ZIP contains both immutable runs, generated comparison evidence, source coverage, the resolved profile instructions, and a repeat-scan procedure.

## Portability Check

For release-quality evidence:

1. Import the ZIP into a clean HiveMap database with `workspace_import_zip` in `new` mode.
2. Call `scan_list` and `scan_compare` in the imported workspace.
3. Re-export with the same timestamp when testing determinism; the archive must be byte-identical.

Use `replace` only when the receiving database already contains the same workspace id and replacement is intentional.
