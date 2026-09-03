/**
 * Responsibility: Render explicit operator-only workspace, graph, feedback, and proposal controls.
 * Must not: Fetch data, own authentication persistence, or render the primary map workflow.
 * Contract: Emits typed form and proposal intents supplied by the workspace screen.
 */
import {
  Check,
  CircleSlash,
  FolderPlus,
  GitBranchPlus,
  GitCommitHorizontal,
  MessageSquarePlus,
  Plus,
  Search,
} from "lucide-react";
import { type FormEvent } from "react";

import { type GraphNodeType, type WorkspaceState } from "./api.js";
import { AuthTokenPanel } from "./AuthTokenPanel.js";

export const EDITABLE_NODE_TYPES: Array<Exclude<GraphNodeType, "finding">> = [
  "concept",
  "decision",
  "risk",
  "question",
  "evidence",
  "component",
  "system",
  "role",
  "pattern",
];

export function WorkspaceSettingsPanel(props: {
  state: WorkspaceState | null;
  newWorkspaceId: string;
  newWorkspaceName: string;
  nodeLabel: string;
  nodeType: GraphNodeType;
  edgeFrom: string;
  edgeTo: string;
  edgeRelation: string;
  proposalLabel: string;
  proposalType: GraphNodeType;
  proposalExplanation: string;
  feedbackText: string;
  onAuthTokenChanged: (hasToken: boolean) => void | Promise<void>;
  onNewWorkspaceIdChange: (value: string) => void;
  onNewWorkspaceNameChange: (value: string) => void;
  onNodeLabelChange: (value: string) => void;
  onNodeTypeChange: (value: GraphNodeType) => void;
  onEdgeFromChange: (value: string) => void;
  onEdgeToChange: (value: string) => void;
  onEdgeRelationChange: (value: string) => void;
  onProposalLabelChange: (value: string) => void;
  onProposalTypeChange: (value: GraphNodeType) => void;
  onProposalExplanationChange: (value: string) => void;
  onFeedbackTextChange: (value: string) => void;
  onWorkspaceSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onAddNode: (event: FormEvent<HTMLFormElement>) => void;
  onAddEdge: (event: FormEvent<HTMLFormElement>) => void;
  onCreateOverview: () => void;
  onCreateProjectMap: () => void;
  onFeedback: (event: FormEvent<HTMLFormElement>) => void;
  onCreateProposal: (event: FormEvent<HTMLFormElement>) => void;
  onApproveProposal: (proposalId: string) => void;
  onApplyProposal: (proposalId: string) => void;
  onRejectProposal: (proposalId: string) => void;
}) {
  return (
    <div className="settings-stack">
      <div className="context-heading"><span>Settings</span></div>

      <AuthTokenPanel onTokenChanged={props.onAuthTokenChanged} />

      <section className="panel">
        <div className="panel-heading">Create workspace</div>
        <form className="nested-form" onSubmit={props.onWorkspaceSubmit}>
          <label>Workspace ID<input value={props.newWorkspaceId} onChange={(event) => props.onNewWorkspaceIdChange(event.currentTarget.value)} required /></label>
          <label>Name<input value={props.newWorkspaceName} onChange={(event) => props.onNewWorkspaceNameChange(event.currentTarget.value)} required /></label>
          <button type="submit"><FolderPlus size={16} />Create</button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-heading">Projection tools</div>
        <div className="button-row">
          <button type="button" onClick={props.onCreateOverview} disabled={props.state === null}><Search size={16} />Overview</button>
          <button type="button" onClick={props.onCreateProjectMap} disabled={props.state === null}><GitBranchPlus size={16} />Project map</button>
        </div>
      </section>

      <details className="panel emergency-tools">
        <summary>Emergency graph editing</summary>
        <form className="nested-form" onSubmit={props.onAddNode}>
          <label>Node label<input value={props.nodeLabel} onChange={(event) => props.onNodeLabelChange(event.currentTarget.value)} required /></label>
          <label>Type<select value={props.nodeType} onChange={(event) => props.onNodeTypeChange(event.currentTarget.value as GraphNodeType)}>{EDITABLE_NODE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
          <button type="submit" disabled={props.state === null}><Plus size={16} />Add node</button>
        </form>
        <form className="nested-form" onSubmit={props.onAddEdge}>
          <label>Source<select value={props.edgeFrom} onChange={(event) => props.onEdgeFromChange(event.currentTarget.value)} required><option value="" disabled>Select source</option>{props.state?.graph.nodes.map((node) => <option key={node.id} value={node.id}>{node.label}</option>)}</select></label>
          <label>Relation<input value={props.edgeRelation} onChange={(event) => props.onEdgeRelationChange(event.currentTarget.value)} required /></label>
          <label>Target<select value={props.edgeTo} onChange={(event) => props.onEdgeToChange(event.currentTarget.value)} required><option value="" disabled>Select target</option>{props.state?.graph.nodes.map((node) => <option key={node.id} value={node.id}>{node.label}</option>)}</select></label>
          <button type="submit" disabled={props.state === null || props.edgeFrom === "" || props.edgeTo === ""}><GitCommitHorizontal size={16} />Add edge</button>
        </form>
      </details>

      <form className="panel" onSubmit={props.onFeedback}>
        <label>Feedback<textarea value={props.feedbackText} onChange={(event) => props.onFeedbackTextChange(event.currentTarget.value)} required /></label>
        <button type="submit" disabled={props.state === null}><MessageSquarePlus size={16} />Record</button>
      </form>

      <form className="panel" onSubmit={props.onCreateProposal}>
        <div className="panel-heading">Graph proposal</div>
        <label>Node label<input value={props.proposalLabel} onChange={(event) => props.onProposalLabelChange(event.currentTarget.value)} required /></label>
        <label>Type<select value={props.proposalType} onChange={(event) => props.onProposalTypeChange(event.currentTarget.value as GraphNodeType)}>{EDITABLE_NODE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
        <label>Explanation<textarea value={props.proposalExplanation} onChange={(event) => props.onProposalExplanationChange(event.currentTarget.value)} required /></label>
        <button type="submit" disabled={props.state === null}><MessageSquarePlus size={16} />Propose</button>
      </form>

      <section className="panel proposal-list">
        <div className="panel-heading">Proposals</div>
        {(props.state?.proposals.length ?? 0) === 0 ? <p className="muted">No proposals</p> : props.state?.proposals.map((proposal) => (
          <article key={proposal.id} className="proposal-item">
            <div><strong>{proposal.status}</strong><span>{proposal.explanation}</span></div>
            <details><summary>{proposal.graphCommands.length} command(s)</summary><pre>{JSON.stringify(proposal.graphCommands, null, 2)}</pre></details>
            <div className="button-row">
              <button type="button" onClick={() => props.onApproveProposal(proposal.id)} disabled={proposal.status !== "pending"}><Check size={16} />Approve</button>
              <button type="button" onClick={() => props.onApplyProposal(proposal.id)} disabled={proposal.status !== "approved"}><Plus size={16} />Apply</button>
              <button type="button" onClick={() => props.onRejectProposal(proposal.id)} disabled={proposal.status !== "pending"}><CircleSlash size={16} />Reject</button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
