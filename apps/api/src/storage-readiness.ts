/**
 * Responsibility: Convert one live store connection probe into an explicit runtime-readiness result.
 * Must not: Route HTTP requests, expose storage errors, or recover an unavailable store.
 * Contract: Readiness is healthy only when HiveMapStore.checkConnection resolves successfully.
 */
import type { HiveMapStore } from "@hivemap/storage";

export type StorageReadiness = { status: "ok" } | { status: "unavailable" };

export async function readStorageReadiness(store: HiveMapStore): Promise<StorageReadiness> {
  try {
    await store.checkConnection();
    return { status: "ok" };
  } catch {
    return { status: "unavailable" };
  }
}
