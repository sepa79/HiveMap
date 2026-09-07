/**
 * Responsibility: Build one complete repository fact set from a bounded checkout capability.
 * Must not: Acquire repositories, execute Git, classify file formats, or persist facts.
 * Contract: Implements safe-mode fact aggregation in docs/specs/repository-indexing.md.
 */
import type {
  RepositoryChunkRecord,
  RepositoryDependencyRecord,
  RepositoryFileRecord,
  RepositoryReferenceRecord,
  RepositorySymbolRecord,
} from "@hivemap/storage";

import type { SafeRepositoryCheckout } from "./repository-checkout.js";
import { createRepositoryContentFacts } from "./repository-content-facts.js";
import { RepositoryFactBudget } from "./repository-fact-budget.js";
import {
  SAFE_REPOSITORY_INDEX_LIMITS,
  type SafeRepositoryIndexResult,
} from "./repository-index-contracts.js";
import { RepositoryIndexExecutionError } from "./repository-index-execution-error.js";
import { createRepositoryDependencies, createRepositorySyntaxFacts } from "./repository-syntax.js";

export async function buildRepositoryIndexFacts(options: {
  workspaceId: string;
  indexId: string;
  checkout: SafeRepositoryCheckout;
}): Promise<SafeRepositoryIndexResult> {
  const files: RepositoryFileRecord[] = [];
  const chunks: RepositoryChunkRecord[] = [];
  const symbols: RepositorySymbolRecord[] = [];
  const references: RepositoryReferenceRecord[] = [];
  const factBudget = new RepositoryFactBudget();
  let indexedBytes = 0;

  for (const normalizedPath of options.checkout.trackedFiles) {
    const bytes = await options.checkout.readTrackedFile(normalizedPath);
    indexedBytes += bytes.byteLength;
    if (indexedBytes > SAFE_REPOSITORY_INDEX_LIMITS.maxTotalBytes) {
      throw new RepositoryIndexExecutionError(
        "REPOSITORY_BYTE_LIMIT_EXCEEDED",
        `Repository indexed content exceeds the ${SAFE_REPOSITORY_INDEX_LIMITS.maxTotalBytes}-byte safe-mode limit`,
      );
    }
    const contentFacts = createRepositoryContentFacts({
      workspaceId: options.workspaceId,
      indexId: options.indexId,
      filePath: normalizedPath,
      bytes,
      factBudget,
    });
    files.push(contentFacts.file);
    for (const chunk of contentFacts.chunks) {
      chunks.push(chunk);
    }
    if (contentFacts.text !== undefined) {
      const syntaxFacts = createRepositorySyntaxFacts({
        workspaceId: options.workspaceId,
        indexId: options.indexId,
        filePath: normalizedPath,
        language: contentFacts.file.language,
        sourceKind: contentFacts.file.sourceKind,
        text: contentFacts.text,
        factBudget,
      });
      for (const symbol of syntaxFacts.symbols) {
        symbols.push(symbol);
      }
      for (const reference of syntaxFacts.references) {
        references.push(reference);
      }
    }
  }

  const dependencies: RepositoryDependencyRecord[] = createRepositoryDependencies({ files, symbols, references, factBudget });

  return {
    resolvedCommit: options.checkout.resolvedCommit,
    files,
    chunks,
    symbols,
    references,
    dependencies,
    stats: {
      fileCount: files.length,
      chunkCount: chunks.length,
      indexedBytes,
    },
  };
}
