import type { VectorDocument } from '../../../lib/vectorio';
import { deleteSelectedNodes, setNodeKind, straightenNodes, translateNodes, type NodeRef, type VectorToolCommit } from './operations';
import { vectorControlClass } from './VectorToolsPanel';
import {NativeButton,NativeInput} from '../../ui/native-controls';
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
  return <fieldset disabled={disabled || !nodeSelection.length} aria-label="Edit nodes" data-testid="vector-node-panel" className="m-0 grid gap-2 border-0 p-0 text-xs">
    <legend className="mb-2 font-semibold">Edit nodes</legend>
    {first && <div className="grid grid-cols-2 gap-2">
      {(['x', 'y'] as const).map(axis => <label key={axis} className="grid gap-1">{axis.toUpperCase()}
        <NativeInput key={`${first.id}:${first[axis]}`} type="number" step="any" defaultValue={+first[axis].toFixed(3)} className={vectorControlClass} aria-label={`Node ${axis}`} data-testid={`vector-node-${axis}`}
          onBlur={e => { const next = Number(e.currentTarget.value); if (e.currentTarget.value && Number.isFinite(next)) apply(`Move node ${axis}`, translateNodes(value, nodeSelection, axis === 'x' ? next - first.x : 0, axis === 'y' ? next - first.y : 0)); }}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
      </label>)}
    </div>}
    <div className="flex flex-wrap gap-1.5">
      {(['corner', 'smooth', 'symmetric'] as const).map(kind => <NativeButton key={kind} type="button" className={vectorControlClass} aria-pressed={first?.kind === kind} data-testid={`vector-node-${kind}`}
        onClick={() => apply(`Convert nodes to ${kind}`, setNodeKind(value, nodeSelection, kind))}>{kind[0].toUpperCase() + kind.slice(1)}</NativeButton>)}
      <NativeButton type="button" className={vectorControlClass} data-testid="vector-node-straighten" onClick={() => apply('Remove node handles', straightenNodes(value, nodeSelection))}>Remove handles</NativeButton>
      <NativeButton type="button" className={vectorControlClass} data-testid="vector-node-delete" onClick={() => { apply('Delete nodes', deleteSelectedNodes(value, nodeSelection)); onNodeSelectionChange([]); }}>Delete nodes</NativeButton>
    </div>
    <p className="m-0 opacity-65">{nodeSelection.length ? `${nodeSelection.length} nodes selected. Drag handles on the canvas to reshape the curve.` : 'Select nodes on the canvas to edit their position and handles.'}</p>
  </fieldset>;
}
