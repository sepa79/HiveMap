/**
 * Responsibility: Compose one safe repository checkout with deterministic repository fact construction.
 * Must not: Implement Git acquisition details, repository source policy, fact parsing, or persistence.
 * Contract: Implements the safe-mode execution flow in docs/specs/repository-indexing.md.
 */
import { withSafeRepositoryCheckout } from "./repository-checkout.js";
import { createRepositoryChunks } from "./repository-content-facts.js";
import { buildRepositoryIndexFacts } from "./repository-facts.js";
import type { RepositoryIndexExecutor } from "./repository-index-contracts.js";

export {
  SAFE_REPOSITORY_INDEX_LIMITS,
  type RepositoryIndexExecutor,
  type RepositorySourcePolicy,
  type SafeRepositoryIndexResult,
} from "./repository-index-contracts.js";
export { RepositoryIndexExecutionError } from "./repository-index-execution-error.js";
export { assertRepositorySourcePolicy } from "./repository-source.js";
export { createRepositoryChunks };

export const executeSafeRepositoryIndex: RepositoryIndexExecutor = async (options) =>
  withSafeRepositoryCheckout(
    {
      repositoryUrl: options.repositoryUrl,
      sourcePolicy: options.sourcePolicy ?? "remote-only",
      requestedRef: options.requestedRef ?? "HEAD",
    },
    (checkout) => buildRepositoryIndexFacts({
      workspaceId: options.workspaceId,
      indexId: options.indexId,
      checkout,
    }),
  );
