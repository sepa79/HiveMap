/**
 * Responsibility: Render global HiveMap identity, current workspace/projection context, and operation status.
 * Must not: Fetch data, own navigation, or mutate workspace state.
 * Contract: Presents explicit labels and one bounded busy/error/ready status.
 */
import { AlertCircle, CheckCircle2, ChevronRight, GitBranchPlus, Loader2 } from "lucide-react";

export function WorkspaceHeader(props: {
  workspaceName?: string | undefined;
  projectionName?: string | undefined;
  busy: boolean;
  error: string | null;
}) {
  return (
    <header className="top-bar">
      <div className="brand" aria-label="HiveMap">
        <GitBranchPlus className="brand-mark" size={27} />
        <span className="brand-wordmark"><span>Hive</span><strong>Map</strong></span>
      </div>
      <div className="workspace-breadcrumb">
        <span>{props.workspaceName ?? "AI-assisted concept graph"}</span>
        {props.projectionName !== undefined && <><ChevronRight size={15} /><strong>{props.projectionName}</strong></>}
      </div>
      {props.busy || props.error === null ? (
        <div aria-live="polite" className="top-bar-status" role="status">
          {props.busy ? <Loader2 className="spin" size={14} /> : <CheckCircle2 size={14} />}
          <span>{props.busy ? "Working" : "Ready"}</span>
        </div>
      ) : (
        <details className="top-bar-error">
          <summary><AlertCircle size={14} /><span>Error</span></summary>
          <div className="top-bar-error-message" role="alert">{props.error}</div>
        </details>
      )}
    </header>
  );
}
