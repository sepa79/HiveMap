/**
 * Responsibility: Render presentation-only controls for the active projection.
 * Must not: Mutate semantic graph state, persist projection filters, or fetch workspace data.
 * Contract: Emits search, group visibility, edge visibility, view-help, and Back intents.
 */
import { ArrowLeft, Check, Info, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { type Projection } from "./api.js";
import { describeProjection } from "./projection-navigation.js";

export function ProjectionToolbar(props: {
  projection: Projection | null;
  query: string;
  visibleGroupIds: ReadonlySet<string>;
  showDependencies: boolean;
  showVerifications: boolean;
  canGoBack: boolean;
  onBack: () => void;
  onQueryChange: (query: string) => void;
  onToggleGroup: (groupId: string) => void;
  onToggleDependencies: () => void;
  onToggleVerifications: () => void;
}) {
  const searchInput = useRef<HTMLInputElement>(null);
  const [showHelp, setShowHelp] = useState(false);
  const orientationNote = props.projection?.layout?.orientationNote;

  useEffect(() => {
    function focusSearch(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        searchInput.current?.focus();
      }
    }
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  useEffect(() => setShowHelp(false), [props.projection?.id]);

  return (
    <div className="projection-toolbar-shell">
      <header className="projection-toolbar">
        {props.canGoBack && <button aria-label="Back" className="toolbar-back" onClick={props.onBack} type="button"><ArrowLeft size={17} /></button>}
        <label className="map-search">
          <Search size={16} />
          <input
            aria-label="Search components"
            onChange={(event) => props.onQueryChange(event.currentTarget.value)}
            placeholder="Search components…"
            ref={searchInput}
            type="search"
            value={props.query}
          />
          <kbd>⌘K</kbd>
        </label>
        <div className="projection-group-filters" aria-label="Projection groups">
          {props.projection?.groups?.map((group) => (
            <button
              aria-pressed={props.visibleGroupIds.has(group.id)}
              className={props.visibleGroupIds.has(group.id) ? "filter-chip filter-chip-active" : "filter-chip"}
              key={group.id}
              onClick={() => props.onToggleGroup(group.id)}
              type="button"
            >
              {group.label}<small>{group.nodeIds.length}</small>
            </button>
          ))}
        </div>
        <label className="edge-toggle">
          <input checked={props.showDependencies} onChange={props.onToggleDependencies} type="checkbox" />
          <span><Check size={11} /></span>Dependencies
        </label>
        <label className="edge-toggle">
          <input checked={props.showVerifications} onChange={props.onToggleVerifications} type="checkbox" />
          <span><Check size={11} /></span>Tests
        </label>
        <div className="projection-kind">
          <span className="visually-hidden">{describeProjection(props.projection)}</span>
          {orientationNote !== undefined && (
            <button
              aria-expanded={showHelp}
              aria-label="About this view"
              className="view-help"
              onClick={() => setShowHelp((current) => !current)}
              type="button"
            >
              <Info size={16} />
            </button>
          )}
        </div>
      </header>
      {showHelp && orientationNote !== undefined && (
        <section aria-label="View help" className="view-help-panel">
          <div>
            <strong>{orientationNote.title}</strong>
            <p>{orientationNote.purpose}</p>
          </div>
          <ol>{orientationNote.usage.map((step) => <li key={step}>{step}</li>)}</ol>
        </section>
      )}
    </div>
  );
}
