/**
 * Responsibility: Enforce one per-execution budget while repository retrieval facts are constructed.
 * Must not: Parse repository content, acquire repositories, persist facts, or coordinate executions.
 * Contract: Implements safe-mode generated-fact limits in docs/specs/repository-indexing.md.
 */
import { SAFE_REPOSITORY_INDEX_LIMITS } from "./repository-index-contracts.js";
import { RepositoryIndexExecutionError } from "./repository-index-execution-error.js";

export type RepositoryFactKind = "chunk" | "symbol" | "reference" | "dependency";

export class RepositoryFactBudget {
  readonly #maxFacts: number;
  readonly #maxChunks: number;
  #factCount = 0;
  #chunkCount = 0;

  constructor(options: { maxFacts?: number; maxChunks?: number } = {}) {
    this.#maxFacts = options.maxFacts ?? SAFE_REPOSITORY_INDEX_LIMITS.maxFacts;
    this.#maxChunks = options.maxChunks ?? SAFE_REPOSITORY_INDEX_LIMITS.maxChunks;
  }

  consume(kind: RepositoryFactKind): void {
    if (kind === "chunk" && this.#chunkCount >= this.#maxChunks) {
      throw new RepositoryIndexExecutionError(
        "REPOSITORY_CHUNK_LIMIT_EXCEEDED",
        `Repository produces more than ${this.#maxChunks} safe-mode chunks`,
      );
    }
    if (this.#factCount >= this.#maxFacts) {
      throw new RepositoryIndexExecutionError(
        "REPOSITORY_FACT_LIMIT_EXCEEDED",
        `Repository produces more than ${this.#maxFacts} safe-mode retrieval facts`,
      );
    }

    this.#factCount += 1;
    if (kind === "chunk") {
      this.#chunkCount += 1;
    }
  }
}
