/**
 * Responsibility: Define the UI projection grouping for finding severity priorities.
 * Must not: Change finding semantics, persist categories, or derive graph authority.
 * Contract: Maps the canonical finding severity values to stable projection group ids and labels.
 */
import type { FindingMetadata } from "./api.js";

export const FINDING_PRIORITY_GROUPS: Array<{ id: string; label: string; severity: FindingMetadata["severity"] }> = [
  { id: "severity-critical", label: "Critical", severity: "critical" },
  { id: "severity-high", label: "High", severity: "high" },
  { id: "severity-medium", label: "Medium", severity: "normal" },
  { id: "severity-low", label: "Low", severity: "low" },
];

export const FINDING_PRIORITY_GROUP_IDS = new Set(FINDING_PRIORITY_GROUPS.map((group) => group.id));
