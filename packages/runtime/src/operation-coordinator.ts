/**
 * Responsibility: Serialize asynchronous runtime operations that share one explicit coordination key.
 * Must not: Choose keys, load or persist state, implement domain mutations, or coordinate multiple processes.
 * Contract: Prevents same-key lifecycle and stale-snapshot races in the supported single-process topology.
 */
export class OperationCoordinator {
  private readonly tails = new Map<string, Promise<void>>();
  private readonly exclusiveOperations = new Set<string>();

  async runExclusive<T>(
    key: string,
    operationId: string,
    operation: () => Promise<T>,
    createBusyError: () => Error,
  ): Promise<T> {
    if (this.exclusiveOperations.has(operationId)) {
      throw createBusyError();
    }
    this.exclusiveOperations.add(operationId);
    try {
      return await this.run(key, operation);
    } finally {
      this.exclusiveOperations.delete(operationId);
    }
  }

  async run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const predecessor = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = predecessor.then(() => current);
    this.tails.set(key, tail);

    await predecessor;
    try {
      return await operation();
    } finally {
      release();
      if (this.tails.get(key) === tail) {
        this.tails.delete(key);
      }
    }
  }
}
