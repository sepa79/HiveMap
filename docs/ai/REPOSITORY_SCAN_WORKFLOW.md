# Repository Scan Workflow

Use this workflow when an agent maps documentation, code, tests, deployment, or another repository concern through HiveMap.

## Start

1. Read the target repository rules and canonical docs.
2. Load or import the target HiveMap workspace.
3. Call `scan_profile_list` and select an explicit profile id and version.
4. Resolve the repository branch, commit, and dirty-worktree digest when applicable.
5. Call `scan_start`. Treat the returned instructions, discovery rules, criteria, SSOT order, and outputs as the run checklist.

## Discover And Record Coverage

1. Rediscover repository sources using the profile include/exclude patterns.
2. Do not copy the prior run inventory as current truth.
3. Classify every discovered source as included, excluded with reason, or failed with reason.
4. Call `scan_record_coverage` once the inventory is complete.

Coverage is evidence of what the agent considered. A source that was not discovered cannot appear as included, excluded, or failed.

## Map And Record Findings

1. Use explicit `graph_command` operations to map bounded concepts and relationships.
2. Call `scan_finding_create` for conflicts, stale claims, missing ownership, implementation drift, broken references, or quality problems.
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
2. Rediscover and record current coverage.
3. Emit findings that still exist using the same fingerprints.
4. Complete the second run.
5. Call `scan_compare` with the baseline and verification scan ids.
6. Investigate every `new`, `regressed`, or `unverifiable` item.
7. Update active resolved findings through `finding_update` with explicit resolution evidence.
8. Call `workspace_export_zip` to produce the verification bundle.

The ZIP contains both immutable runs, generated comparison evidence, source coverage, the resolved profile instructions, and a repeat-scan procedure.

## Portability Check

For release-quality evidence:

1. Import the ZIP into a clean HiveMap database with `workspace_import_zip` in `new` mode.
2. Call `scan_list` and `scan_compare` in the imported workspace.
3. Re-export with the same timestamp when testing determinism; the archive must be byte-identical.

Use `replace` only when the receiving database already contains the same workspace id and replacement is intentional.
