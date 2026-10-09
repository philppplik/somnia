import type { VectorDocument } from '../../../lib/vectorio';
import { deleteSelectedNodes, setNodeKind, straightenNodes, translateNodes, type NodeRef, type VectorToolCommit } from './operations';
import { vectorControlStyle } from './VectorToolsPanel';
export interface VectorNodePanelProps {
  value: VectorDocument;
  nodeSelection: NodeRef[];
  onNodeSelectionChange(selection: NodeRef[]): void;
  onCommit(commit: VectorToolCommit): void;
  disabled?: boolean;
}
export function VectorNodePanel({ value, nodeSelection, onNodeSelectionChange, onCommit, disabled }: VectorNodePanelProps) {
  const first = nodeSelection.length === 1 ? value.paths.find(p => p.id === nodeSelection[0].pathId)?.nodes.find(n => n.id === nodeSelection[0].nodeId) : undefined;
  const apply = (label: string, after: VectorDocument) => { if (JSON.stringify(value) !== JSON.stringify(after)) onCommit({ before: value, after, label }); };
  return <fieldset disabled={disabled || !nodeSelection.length} aria-label="Edit nodes" data-testid="vector-node-panel" style={{ border: 0, margin: 0, padding: 0, display: 'grid', gap: 8, fontSize: 12 }}>
    <legend style={{ fontWeight: 600, marginBottom: 8 }}>Edit nodes</legend>
    {first && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {(['x', 'y'] as const).map(axis => <label key={axis} style={{ display: 'grid', gap: 4 }}>{axis.toUpperCase()}
        <input key={`${first.id}:${first[axis]}`} type="number" step="any" defaultValue={+first[axis].toFixed(3)} style={vectorControlStyle} aria-label={`Node ${axis}`} data-testid={`vector-node-${axis}`}
          onBlur={e => { const next = Number(e.currentTarget.value); if (e.currentTarget.value && Number.isFinite(next)) apply(`Move node ${axis}`, translateNodes(value, nodeSelection, axis === 'x' ? next - first.x : 0, axis === 'y' ? next - first.y : 0)); }}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
      </label>)}
    </div>}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {(['corner', 'smooth', 'symmetric'] as const).map(kind => <button key={kind} type="button" style={vectorControlStyle} aria-pressed={first?.kind === kind} data-testid={`vector-node-${kind}`}
        onClick={() => apply(`Convert nodes to ${kind}`, setNodeKind(value, nodeSelection, kind))}>{kind[0].toUpperCase() + kind.slice(1)}</button>)}
      <button type="button" style={vectorControlStyle} data-testid="vector-node-straighten" onClick={() => apply('Remove node handles', straightenNodes(value, nodeSelection))}>Remove handles</button>
      <button type="button" style={vectorControlStyle} data-testid="vector-node-delete" onClick={() => { apply('Delete nodes', deleteSelectedNodes(value, nodeSelection)); onNodeSelectionChange([]); }}>Delete nodes</button>
    </div>
    <p style={{ margin: 0, opacity: 0.65 }}>{nodeSelection.length ? `${nodeSelection.length} nodes selected. Drag handles on the canvas to reshape the curve.` : 'Select nodes on the canvas to edit their position and handles.'}</p>
  </fieldset>;
}
