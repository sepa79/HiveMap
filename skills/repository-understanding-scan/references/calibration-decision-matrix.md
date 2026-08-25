# Calibration Decision Matrix

Use this matrix after the first provisional scan pass.

## Classify The Result

`Real finding`
- The scan scope is coherent.
- The relevant boundary, contract, and test surfaces are included.
- The problem still exists after calibration.
- Action: create a finding with bounded evidence.

`Profile or overlay gap`
- Coverage includes the wrong roots, excludes obvious repo surfaces, or treats fixture/generated noise as first-class boundaries.
- Boundary map misses an obvious code/test/tool surface because the active overlay does not describe the repository shape.
- Action: update the repository-local overlay or record one explicit coverage correction, then restart with a new scan id.

`Missing evidence`
- The suspected issue might be real, but the current run does not yet link the right contract, test, or structural evidence to support it.
- Action: retrieve bounded evidence candidates, build a boundary map, or leave an open question. Do not turn lack of evidence into a confident finding.

`Ambiguous repository shape`
- The scan still cannot tell whether a path belongs to a product boundary, support tooling, fixture corpus, generated output, or verification surface.
- Action: stop at calibration, record the ambiguity, and refine overlay or heuristics before findings.

## Continue Only When

The run is findings-ready only when all of these are true:

- effective profile identity is accepted for this repository;
- included inventory roughly matches intended code/test/tool/contract scope;
- obvious public surfaces are present or consciously excluded;
- boundary map is coherent enough to explain ownership and verification shape;
- repeated warnings are understood rather than ignored.

## Restart Instead Of Forcing Findings

Restart the scan when:

- the overlay changed materially;
- coverage had to be corrected materially;
- the first boundary map proved the repository shape was wrong;
- the rerun is needed to distinguish repository defects from tool/process defects.

Use the same completed repository index when the repository revision did not change. The point is to compare calibration quality, not to hide the original mismatch.
