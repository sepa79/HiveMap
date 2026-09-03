/**
 * Responsibility: Represent explicit scan-domain validation failures.
 * Must not: Map failures to transports, persist state, or recover invalid scan data.
 * Contract: Provides the stable error type used by scan validators and operations.
 */
export class ScanValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScanValidationError";
  }
}
