# Overlay Tuning

Use this reference when calibration shows that the repository shape is wrong but the problem is repository-specific rather than a generic HiveMap code defect.

## What Belongs In The Overlay

Repository-specific scan recipe fields such as:

- include and exclude scope;
- boundary roots;
- contract markers and contract-like file stems;
- test directory families;
- entrypoint path or suffix markers;
- ignore tokens used for contract matching;
- other repository-shaped scan recipe hints already supported by the profile contract.

## What Does Not Belong In The Overlay

Do not hide generic product defects in repo-local config:

- missing parser or indexer support that should work across repositories;
- broken dependency resolution that is not repository-specific;
- silent fallbacks or guessed behavior;
- one-off workarounds for evidence you have not actually understood.

If the mismatch is generic, fix HiveMap code or contracts instead of encoding the bug into one repository overlay.

## Tuning Workflow

1. Capture the exact calibration mismatch.
2. Decide whether the mismatch is repository-specific or generic.
3. If repository-specific, update the overlay only in the fields that describe repository shape.
4. Restart the scan with a new scan id from the same completed repository index.
5. Compare before and after runs to confirm the change improved scope or linking rather than merely changing wording.

## Desired Outcome

A good overlay should:

- reduce false boundaries and fixture noise;
- include the real contract, tool, and test surfaces for the repository;
- preserve fail-fast behavior on invalid config;
- stay easy to replace when the repository evolves.
