/**
 * Responsibility: Derive presentational styles and labels for projected map nodes and groups.
 * Must not: Mutate semantic data, persist layout, access the DOM, or select projections.
 * Contract: Returns deterministic visual values from explicit node, severity, and group inputs.
 */
import type { FindingMetadata, GraphNodeType } from "./api.js";
import { MAP_CARD_HEIGHT } from "./MapCard.js";

export function nodeStyle(type: GraphNodeType, selected: boolean, findingSeverity?: "low" | "normal" | "high" | "critical") {
  const colors: Record<GraphNodeType, { background: string; border: string }> = {
    concept: { background: "rgba(51, 225, 255, 0.10)", border: "rgba(51, 225, 255, 0.45)" },
    decision: { background: "rgba(86, 211, 145, 0.10)", border: "rgba(86, 211, 145, 0.42)" },
    risk: { background: "rgba(255, 117, 117, 0.10)", border: "rgba(255, 117, 117, 0.45)" },
    question: { background: "rgba(255, 200, 87, 0.10)", border: "rgba(255, 200, 87, 0.42)" },
    evidence: { background: "rgba(255, 255, 255, 0.04)", border: "rgba(255, 255, 255, 0.18)" },
    component: { background: "rgba(167, 139, 250, 0.10)", border: "rgba(167, 139, 250, 0.42)" },
    system: { background: "rgba(96, 165, 250, 0.10)", border: "rgba(96, 165, 250, 0.42)" },
    role: { background: "rgba(244, 114, 182, 0.10)", border: "rgba(244, 114, 182, 0.42)" },
    pattern: { background: "rgba(45, 212, 191, 0.10)", border: "rgba(45, 212, 191, 0.42)" },
    finding: { background: "rgba(255, 117, 117, 0.10)", border: "rgba(255, 117, 117, 0.55)" },
  };

  const findingColors = findingSeverity === "critical"
    ? { background: "rgba(255, 80, 80, 0.18)", border: "rgba(255, 80, 80, 0.82)" }
    : findingSeverity === "high"
    ? { background: "rgba(255, 117, 117, 0.12)", border: "rgba(255, 117, 117, 0.62)" }
    : findingSeverity === "normal"
    ? { background: "rgba(255, 200, 87, 0.10)", border: "rgba(255, 200, 87, 0.48)" }
    : colors[type];

  return {
    background: findingColors.background,
    border: selected ? "2px solid #33e1ff" : `1px solid ${findingColors.border}`,
    borderRadius: 10,
    boxShadow: selected ? "0 0 20px rgba(51, 225, 255, 0.24)" : "0 12px 24px rgba(0, 0, 0, 0.22)",
    color: "rgba(255, 255, 255, 0.94)",
    padding: 12,
    height: MAP_CARD_HEIGHT,
    width: 180,
  };
}
export function orientationNoteStyle(groupCount: number) {
  return {
    background: "linear-gradient(135deg, rgba(51, 225, 255, 0.14), rgba(255, 193, 7, 0.08))",
    border: "1px solid rgba(51, 225, 255, 0.52)",
    borderRadius: 14,
    boxShadow: "0 18px 42px rgba(0, 0, 0, 0.32)",
    color: "rgba(255, 255, 255, 0.92)",
    fontSize: 13,
    lineHeight: 1.55,
    minHeight: 160,
    padding: 18,
    textAlign: "left" as const,
    whiteSpace: "pre-line" as const,
    width: Math.max(620, groupCount * 260 - 20),
  };
}

export function humanSeverity(severity: FindingMetadata["severity"] | undefined): string {
  if (severity === undefined) return "unknown";
  return severity === "normal" ? "medium" : severity;
}

export function projectionGroupHeaderStyle(groupId: string, width: number) {
  const palette = groupId === "severity-critical"
    ? { background: "rgba(255, 80, 80, 0.22)", border: "rgba(255, 80, 80, 0.86)", color: "#ffb0b0" }
    : groupId === "severity-high"
    ? { background: "rgba(255, 117, 117, 0.14)", border: "rgba(255, 117, 117, 0.64)", color: "#ffc2c2" }
    : groupId === "severity-medium"
    ? { background: "rgba(255, 200, 87, 0.12)", border: "rgba(255, 200, 87, 0.58)", color: "#ffdc91" }
    : groupId === "severity-low"
    ? { background: "rgba(86, 211, 145, 0.10)", border: "rgba(86, 211, 145, 0.48)", color: "#8be8b4" }
    : { background: "rgba(51, 225, 255, 0.10)", border: "rgba(51, 225, 255, 0.45)", color: "#8cedff" };
  return {
    ...palette,
    border: `1px solid ${palette.border}`,
    borderRadius: 12,
    fontSize: 16,
    fontWeight: 900,
    letterSpacing: 0.5,
    lineHeight: 1.35,
    minHeight: 64,
    padding: 10,
    textTransform: "uppercase" as const,
    whiteSpace: "pre-line" as const,
    width,
  };
}
