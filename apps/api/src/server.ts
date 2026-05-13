#!/usr/bin/env node
import { SqliteHiveMapStore } from "@hivemap/storage";

import { createApiServer } from "./index.js";

const dbPath = readRequiredValue(process.argv, process.env, "--db", "HIVEMAP_DB_PATH");
const port = Number(readRequiredValue(process.argv, process.env, "--port", "HIVEMAP_API_PORT"));

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("HiveMap API requires a valid --port <1-65535> or HIVEMAP_API_PORT");
}

const store = SqliteHiveMapStore.open(dbPath);
store.initialize();

const server = createApiServer({ store });
server.listen(port, "127.0.0.1", () => {
  console.error(`HiveMap API listening on http://127.0.0.1:${port} with db ${dbPath}`);
});

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

function shutdown(): void {
  server.close(() => {
    store.close();
    process.exit(0);
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
