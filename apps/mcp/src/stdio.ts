#!/usr/bin/env node
import { HiveMapRuntime, createEmbeddingProvidersFromEnvironment } from "@hivemap/runtime";
import { openHiveMapStore } from "@hivemap/storage";

import { connectHiveMapStdioServer } from "./sdk-server.js";

const storeConfig = readStoreConfig(process.argv, process.env);
const store = openHiveMapStore(storeConfig);
await store.initialize();
const embeddingProviders = createEmbeddingProvidersFromEnvironment(process.env);

await connectHiveMapStdioServer(new HiveMapRuntime({ store, embeddingProviders }));
console.error(`HiveMap MCP server running on stdio with ${describeStoreConfig(storeConfig)}`);

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

function describeStoreConfig(config: { backend: "postgres"; connectionString: string }): string {
  return `Postgres ${config.connectionString}`;
}
