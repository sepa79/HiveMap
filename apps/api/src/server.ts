#!/usr/bin/env node
/**
 * Responsibility: Compose and start the HiveMap API process from validated boundary modules.
 * Must not: Parse transport requests, implement domain behavior, or expose credential values.
 * Contract: Starts one shared REST/MCP runtime and installs coordinated process shutdown.
 */

import { describePostgresTarget, openHiveMapStore } from "@hivemap/storage";

import { createApiServer } from "./index.js";
import { readApiProcessConfig } from "./server-config.js";
import { installShutdownHandlers } from "./server-lifecycle.js";

const config = readApiProcessConfig(process.argv, process.env);

const store = openHiveMapStore(config.storeConfig);
await store.initialize();
const server = createApiServer({
  store,
  authToken: config.authToken,
  ...(config.staticRoot === undefined ? {} : { staticRoot: config.staticRoot }),
});
server.listen(config.port, config.host, () => {
  console.error(
    `HiveMap API listening on http://${config.host}:${config.port} with ${describePostgresTarget(config.storeConfig.connectionString)}${config.staticRoot === undefined ? "" : ` and web dist ${config.staticRoot}`}`,
  );
});

installShutdownHandlers(server, store);
