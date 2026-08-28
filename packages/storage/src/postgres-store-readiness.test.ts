import { EventEmitter } from "node:events";

import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { PostgresHiveMapStore } from "./postgres-store.js";

describe("PostgresHiveMapStore readiness", () => {
  it("retains an idle pool failure for readiness without throwing from the event", async () => {
    const pool = new EventEmitter() as EventEmitter & { query: ReturnType<typeof vi.fn> };
    pool.query = vi.fn().mockResolvedValue({ rows: [], rowCount: 1 });
    const store = new PostgresHiveMapStore(pool as unknown as Pool);
    const infrastructureError = new Error("terminating connection due to administrator command");

    expect(() => pool.emit("error", infrastructureError)).not.toThrow();
    await expect(store.checkConnection()).rejects.toBe(infrastructureError);
    await expect(store.checkConnection()).resolves.toBeUndefined();
    expect(pool.query).toHaveBeenCalledOnce();
  });
});
