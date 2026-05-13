#!/usr/bin/env node
import { HiveMapRuntime } from "@hivemap/runtime";
import { SqliteHiveMapStore } from "@hivemap/storage";

import { connectHiveMapStdioServer } from "./sdk-server.js";

const dbPath = readDbPath(process.argv, process.env);
const store = SqliteHiveMapStore.open(dbPath);
store.initialize();

await connectHiveMapStdioServer(new HiveMapRuntime({ store }));
console.error(`HiveMap MCP server running on stdio with db ${dbPath}`);

function readDbPath(argv: readonly string[], env: NodeJS.ProcessEnv): string {
  const dbFlagIndex = argv.indexOf("--db");
  if (dbFlagIndex !== -1) {
    const value = argv[dbFlagIndex + 1];
    if (value === undefined || value.trim().length === 0) {
      throw new Error("--db requires a non-empty SQLite path");
    }
    return value;
  }

  const envValue = env.HIVEMAP_DB_PATH;
  if (envValue === undefined || envValue.trim().length === 0) {
    throw new Error("HiveMap MCP requires --db <path> or HIVEMAP_DB_PATH");
  }

  return envValue;
}
