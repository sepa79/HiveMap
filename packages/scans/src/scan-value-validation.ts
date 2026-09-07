/**
 * Responsibility: Validate primitive values shared by scan-domain contracts.
 * Must not: Validate complete profiles, coverage, boundary maps, runs, or graph ownership.
 * Contract: Supports the scan invariants defined in docs/specs/repository-scan.md.
 */
import { ScanValidationError } from "./scan-validation-error.js";

export function assertNonEmpty(label: string, value: string): void {
  if (value.trim().length === 0) throw new ScanValidationError(`${label} must be non-empty`);
}

export function assertOptionalNonEmpty(label: string, value: string | undefined): void {
  if (value !== undefined) assertNonEmpty(label, value);
}

export function assertUnique(label: string, values: readonly unknown[]): void {
  if (new Set(values).size !== values.length) throw new ScanValidationError(`${label} must not contain duplicates`);
}

export function validateStringArray(label: string, values: readonly string[]): void {
  for (const value of values) assertNonEmpty(label, value);
  assertUnique(label, values);
}

export function assertNonEmptyStringArray(label: string, values: readonly string[]): void {
  if (values.length === 0) throw new ScanValidationError(`${label} must contain at least one value`);
  validateStringArray(label, values);
}

export function assertDate(label: string, value: string): void {
  assertNonEmpty(label, value);
  if (Number.isNaN(Date.parse(value))) throw new ScanValidationError(`${label} must be a valid date`);
}

export function uniqueStable(values: readonly string[]): string[] {
  return [...new Set(values)];
}
