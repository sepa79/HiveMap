---
name: repository-understanding-scan
description: "Run HiveMap repository scans as a calibration-first workflow for unfamiliar repositories or newly changed scan profiles before creating durable findings."
---

# Repository Understanding Scan

Use this skill when a HiveMap repository scan depends on understanding repository shape before filing findings, especially for:

- unfamiliar repositories;
- newly added or recently changed overlays/profiles;
- code/test/tool reviews where boundary shape is still uncertain;
- repeat scans meant to tune heuristics or compare calibration quality.

Do not treat `scan_start` as permission to file findings immediately. The first pass is provisional until repository shape is calibrated.

## Default Workflow

1. Start from a completed repository index and call `scan_start`.
2. Treat the response as calibration state. Review `workflowPhase`, calibration checklist, effective profile, overlay status, coverage summary, and warnings.
3. If repository structure matters or is still unclear, build a boundary map before creating findings.
4. Map what you learned onto the machine-visible calibration state:
   `findings-ready`
   `profile-gap`
   `missing-evidence`
   `ambiguous-shape`
5. If calibration is wrong, refine the repository-local overlay or record one explicit coverage correction, then restart with a new scan id from the same completed repository index.
6. Create durable findings only after the run is `findings-ready`, or provide an explicit `scan_complete.calibrationOverrideReason` that explains why a non-ready classification is being accepted intentionally.
7. Use completed-scan comparison to tune overlays, heuristics, and process instead of patching around one-off failures.

## Expected Outputs

Produce these artifacts or conclusions explicitly:

- a calibration verdict for the current run;
- an updated overlay or an explicit statement that the current overlay is good enough;
- a boundary map or a clear reason why it was unnecessary;
- findings only after the scan is `findings-ready`, unless a deliberate override is recorded explicitly;
- comparison notes when a rerun is used for tuning.

## Stop Conditions

Stop and return the calibration result instead of forcing findings when:

- obvious code, tool, test, or contract surfaces are still outside the active scan shape;
- boundary output is dominated by fixture noise, generated material, or the wrong repository roots;
- the suspected problem is actually a profile/overlay mismatch or an indexing/heuristic gap;
- the repository still has unresolved structural ambiguity after one reasonable calibration pass.

For the classification rules and restart decisions, read [references/calibration-decision-matrix.md](references/calibration-decision-matrix.md).

When the scan needs repository-specific tuning, read [references/overlay-tuning.md](references/overlay-tuning.md).
