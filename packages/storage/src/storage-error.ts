/**
 * Responsibility: Represent explicit persistence-contract failures.
 * Must not: Select HTTP status codes, recover invalid state, or perform IO.
 * Contract: Storage adapters throw this error when persisted data or operations violate the store contract.
 */
export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}
