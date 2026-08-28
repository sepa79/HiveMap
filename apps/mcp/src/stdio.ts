#!/usr/bin/env node
/**
 * Responsibility: Compose the transitional local stdio MCP process over Postgres.
 * Must not: Define installed HTTP behavior, implement tool semantics, or select fallback storage.
 * Contract: Requires one explicit Postgres URL and connects one shared runtime to stdio.
 */
import { HiveMapRuntime } from "@hivemap/runtime";
import { describePostgresTarget, openHiveMapStore } from "@hivemap/storage";

import { connectHiveMapStdioServer } from "./sdk-server.js";

const storeConfig = readStoreConfig(process.argv, process.env);
const store = openHiveMapStore(storeConfig);
await store.initialize();
await connectHiveMapStdioServer(new HiveMapRuntime({ store }));
console.error(`HiveMap MCP server running on stdio with ${describePostgresTarget(storeConfig.connectionString)}`);

function readStoreConfig(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): { backend: "postgres"; connectionString: string } {
  const postgresUrl = readRequiredValue(argv, env, "--postgres-url", "HIVEMAP_POSTGRES_URL");
  return { backend: "postgres", connectionString: postgresUrl };
}

function readRequiredValue(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  flagName: string,
  envName: string,
): string {
  const flagIndex = argv.indexOf(flagName);
  if (flagIndex !== -1) {
    const value = argv[flagIndex + 1];
    if (value === undefined || value.trim().length === 0) {
      throw new Error(`${flagName} requires a non-empty value`);
    }
    return value;
  }

  const envValue = env[envName];
  if (envValue === undefined || envValue.trim().length === 0) {
    throw new Error(`HiveMap MCP requires ${flagName} <value> or ${envName}`);
  }

  return envValue;
}
