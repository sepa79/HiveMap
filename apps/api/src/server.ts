#!/usr/bin/env node
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createEmbeddingProvidersFromEnvironment } from "@hivemap/runtime";
import { openHiveMapStore } from "@hivemap/storage";

import { createApiServer } from "./index.js";

const port = Number(readRequiredValue(process.argv, process.env, "--port", "HIVEMAP_API_PORT"));
const host = readOptionalValue(process.argv, process.env, "--host", "HIVEMAP_API_HOST") ?? "127.0.0.1";
const storeConfig = readStoreConfig(process.argv, process.env);
const staticRoot = readStaticRoot(process.argv, process.env);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("HiveMap API requires a valid --port <1-65535> or HIVEMAP_API_PORT");
}
if (host.trim().length === 0) {
  throw new Error("HiveMap API requires a non-empty --host or HIVEMAP_API_HOST");
}

const store = openHiveMapStore(storeConfig);
await store.initialize();
const embeddingProviders = createEmbeddingProvidersFromEnvironment(process.env);

const server = createApiServer({
  store,
  embeddingProviders,
  ...(staticRoot === undefined ? {} : { staticRoot }),
});
server.listen(port, host, () => {
  console.error(
    `HiveMap API listening on http://${host}:${port} with ${describeStoreConfig(storeConfig)}${staticRoot === undefined ? "" : ` and web dist ${staticRoot}`}`,
  );
});

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

function shutdown(): void {
  server.close(() => {
    store.close().finally(() => {
      process.exit(0);
    });
  });
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
    throw new Error(`HiveMap API requires ${flagName} <value> or ${envName}`);
  }

  return envValue;
}

function readStoreConfig(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): { backend: "postgres"; connectionString: string } {
  const postgresUrl = readRequiredValue(argv, env, "--postgres-url", "HIVEMAP_POSTGRES_URL");
  return { backend: "postgres", connectionString: postgresUrl };
}

function readOptionalValue(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  flagName: string,
  envName: string,
): string | undefined {
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
    return undefined;
  }

  return envValue;
}

function describeStoreConfig(config: { backend: "postgres"; connectionString: string }): string {
  return `Postgres ${config.connectionString}`;
}

function readStaticRoot(argv: readonly string[], env: NodeJS.ProcessEnv): string | undefined {
  const explicit = readOptionalValue(argv, env, "--web-dist", "HIVEMAP_WEB_DIST");
  if (explicit !== undefined) {
    const resolved = resolve(explicit);
    if (!existsSync(resolved)) {
      throw new Error(`HiveMap API static web root does not exist: ${resolved}`);
    }
    return resolved;
  }

  const defaultDist = resolve(dirname(fileURLToPath(import.meta.url)), "../../web/dist");
  return existsSync(defaultDist) ? defaultDist : undefined;
}
