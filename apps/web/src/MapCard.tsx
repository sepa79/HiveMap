/**
 * Responsibility: Render the reusable React Flow card node and expose its layout constants.
 * Must not: Fetch data, mutate graph semantics, own selection, or persist projection layout.
 * Contract: Renders supplied title/tags as a non-editing visual projection node.
 */
import { Handle, Position, type Node, type NodeProps, type NodeTypes } from "@xyflow/react";
import { Boxes, Globe2 } from "lucide-react";
import type { Projection } from "./api.js";

export const MAP_CARD_HEIGHT = 126;
export const MAP_CARD_WIDTH = 180;
export const MAP_CARD_ROW_PITCH = 154;
export const MAP_CARD_COLUMN_PITCH = 218;
export type MapCardData = {
  title: string;
  tags: string[];
  variant: "finding" | "concept";
  boundaryKind?: string | undefined;
};
type MapCardNode = Node<MapCardData, "map-card">;
export const FLOW_NODE_TYPES: NodeTypes = { "map-card": MapCard };
export const FINDINGS_OVERVIEW_NOTE: NonNullable<NonNullable<Projection["layout"]>["orientationNote"]> = {
  title: "Documentation review map",
  purpose: "Review documentation problems found by the repository scan and open the evidence needed to fix them.",
  usage: [
    "Start with the Critical and High priority columns.",
    "Use the problem kind shown on each card to understand the type of cleanup.",
    "Click a finding to inspect its evidence in the sidebar.",
    "Use the inspector's Dive in action to open its focused map.",
    "Read source files, conflicting claims, and the recommended action in the inspector.",
    "Use Back to return to this review map.",
  ],
};

function MapCard({ data }: NodeProps<MapCardNode>) {
  const BoundaryIcon = data.boundaryKind === "surface" ? Globe2 : Boxes;
  return (
    <div className={`map-card map-card-${data.variant}`}>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <BoundaryIcon aria-hidden="true" className="map-card-icon" size={20} />
      <div className="map-card-title">{data.title}</div>
      <div className="map-card-tags">
        {data.tags.map((tag) => (
          <span className={`map-card-tag map-card-tag-${tag.replace(/[^a-z0-9]+/g, "-").toLowerCase()}`} key={tag}>
            {tag}
          </span>
        ))}
      </div>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}
