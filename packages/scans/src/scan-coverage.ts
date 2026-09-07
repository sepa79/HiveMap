/**
 * Responsibility: Define and validate repository scan coverage classification.
 * Must not: Discover files, apply profile scope, validate findings, or compare completed runs.
 * Contract: Implements coverage completeness rules in docs/specs/repository-scan.md.
 */
import { ScanValidationError } from "./scan-validation-error.js";
import { assertNonEmpty, assertNonEmptyStringArray, assertUnique } from "./scan-value-validation.js";

export type ScanCoverageException = {
  target: string;
  reason: string;
};

export type ScanCoverage = {
  discovered: string[];
  included: string[];
  excluded: ScanCoverageException[];
  failed: ScanCoverageException[];
};

export function validateScanCoverage(coverage: ScanCoverage): void {
  assertNonEmptyStringArray("coverage.discovered", coverage.discovered);
  assertNonEmptyStringArray("coverage.included", coverage.included);
  assertUnique("coverage.discovered", coverage.discovered);
  assertUnique("coverage.included", coverage.included);
  const discovered = new Set(coverage.discovered);
  for (const target of coverage.included) {
    if (!discovered.has(target)) throw new ScanValidationError(`Included source was not discovered: ${target}`);
  }
  validateCoverageExceptions("coverage.excluded", coverage.excluded, discovered);
  validateCoverageExceptions("coverage.failed", coverage.failed, discovered);
  const classified = [
    ...coverage.included,
    ...coverage.excluded.map((entry) => entry.target),
    ...coverage.failed.map((entry) => entry.target),
  ];
  assertUnique("coverage classified targets", classified);
}

function validateCoverageExceptions(
  label: string,
  entries: readonly ScanCoverageException[],
  discovered: ReadonlySet<string>,
): void {
  assertUnique(
    label,
    entries.map((entry) => entry.target),
  );
  for (const entry of entries) {
    assertNonEmpty(`${label}.target`, entry.target);
    assertNonEmpty(`${label}.reason`, entry.reason);
    if (!discovered.has(entry.target)) throw new ScanValidationError(`${label} source was not discovered: ${entry.target}`);
  }
}
