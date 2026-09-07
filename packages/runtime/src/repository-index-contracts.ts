import type {
  RepositoryChunkRecord,
  RepositoryDependencyRecord,
  RepositoryFileRecord,
  RepositoryReferenceRecord,
  RepositorySymbolRecord,
} from "@hivemap/storage";

export const SAFE_REPOSITORY_INDEX_LIMITS = {
  maxFiles: 20_000,
  maxFileBytes: 5 * 1024 * 1024,
  maxTotalBytes: 250 * 1024 * 1024,
  maxChunks: 100_000,
  maxFacts: 100_000,
  gitTimeoutMs: 120_000,
  gitOutputBytes: 32 * 1024 * 1024,
  gitFileWriteBytes: 300 * 1024 * 1024,
  gitAddressSpaceBytes: 1024 * 1024 * 1024,
  gitCpuSeconds: 120,
} as const;

export type SafeRepositoryIndexResult = {
  resolvedCommit: string;
  files: RepositoryFileRecord[];
  chunks: RepositoryChunkRecord[];
  symbols?: RepositorySymbolRecord[];
  references?: RepositoryReferenceRecord[];
  dependencies?: RepositoryDependencyRecord[];
  stats: {
    fileCount: number;
    chunkCount: number;
    indexedBytes: number;
  };
};

export type RepositoryIndexExecutor = (options: {
  workspaceId: string;
  indexId: string;
  repositoryUrl: string;
  sourcePolicy?: RepositorySourcePolicy;
  requestedRef?: string;
}) => Promise<SafeRepositoryIndexResult>;

export type RepositorySourcePolicy = "remote-only" | "local-allowed";
