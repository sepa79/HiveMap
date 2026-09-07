/**
 * Responsibility: Render the primary workspace destination rail.
 * Must not: Fetch workspace data, mutate graph state, or own destination content.
 * Contract: Emits one explicit destination selection and displays bounded scan/finding counts.
 */
import { GitBranchPlus, Map, ScanSearch, Settings, TriangleAlert } from "lucide-react";

export const WORKSPACE_SECTION_VALUES = ["map", "scans", "findings", "settings"] as const;
export type WorkspaceSection = (typeof WORKSPACE_SECTION_VALUES)[number];

export function WorkspaceNavigationRail(props: {
  activeSection: WorkspaceSection;
  scanCount: number;
  findingCount: number;
  onSelect: (section: WorkspaceSection) => void;
}) {
  const items = [
    { id: "map" as const, label: "Map", icon: Map },
    { id: "scans" as const, label: "Scans", icon: ScanSearch, count: props.scanCount },
    { id: "findings" as const, label: "Findings", icon: TriangleAlert, count: props.findingCount },
    { id: "settings" as const, label: "Settings", icon: Settings },
  ];

  return (
    <nav aria-label="Workspace sections" className="workspace-rail">
      <div className="workspace-rail-mark" aria-hidden="true"><GitBranchPlus size={24} /></div>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            aria-current={props.activeSection === item.id ? "page" : undefined}
            aria-label={item.label}
            className={props.activeSection === item.id ? "rail-button rail-button-active" : "rail-button"}
            key={item.id}
            onClick={() => props.onSelect(item.id)}
            type="button"
          >
            <span className="rail-icon"><Icon size={22} /></span>
            <span>{item.label}</span>
            {item.count !== undefined && item.count > 0 && <small>{item.count}</small>}
          </button>
        );
      })}
    </nav>
  );
}
