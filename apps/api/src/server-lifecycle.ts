/**
 * Responsibility: Coordinate HTTP server and store shutdown for process signals.
 * Must not: Parse configuration, implement routes, or own application semantics.
 * Contract: SIGINT/SIGTERM stop accepting HTTP work, close storage, then exit once.
 */
import type { Server } from "node:http";

import type { HiveMapStore } from "@hivemap/storage";

export function installShutdownHandlers(server: Server, store: HiveMapStore): void {
  let shutdownStarted = false;

  const shutdown = (): void => {
    if (shutdownStarted) {
      return;
    }
    shutdownStarted = true;
    server.close((serverError) => {
      if (serverError !== undefined) {
        console.error("HiveMap API HTTP shutdown failed", serverError);
        process.exit(1);
      }
      store.close().then(
        () => process.exit(0),
        (storeError: unknown) => {
          console.error("HiveMap API storage shutdown failed", storeError);
          process.exit(1);
        },
      );
    });
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
