import {applyOperations, getState, patchState} from '../store/appStore';
import type {EditorNode} from './editorPort';
import {alignDeltas, distributeDeltas, shiftStyle, type AlignMode, type Axis, type Box, type Delta} from './alignDistribute';

/** Measures the selected, unlocked elements inside the design iframe. */
export function measureSelection(frame: HTMLIFrameElement | null): Box[] {
  const doc = frame?.contentDocument;
  if (!doc) return [];
  const s = getState();
  const locked = lockedIds(s.nodes);
  return s.selectedElementIds.flatMap(id => {
    if (locked.has(id)) return [];
    const el = doc.querySelector(`[data-editor-node="${id}"]`);
    if (!el) return [];
    const r = el.getBoundingClientRect();
    return [{id, x: r.x, y: r.y, w: r.width, h: r.height}];
  });
}

/** Ids of nodes that are locked or sit inside a locked ancestor. */
export function lockedIds(nodes: EditorNode[], inherited = false, out = new Set<string>()): Set<string> {
  for (const n of nodes) {
    const l = inherited || !!n.locked;
    if (l) out.add(n.id);
    lockedIds(n.children, l, out);
  }
  return out;
}

/** Writes the moves as one transaction, so one undo restores everything. Returns how many elements moved. */
export function applyDeltas(frame: HTMLIFrameElement | null, deltas: Delta[]): number {
  const doc = frame?.contentDocument, win = frame?.contentWindow;
  if (!doc || !win || !deltas.length) return 0;
  const s = getState();
  const breakpoint = s.viewport === 1280 ? undefined : s.viewport === 820 ? 900 : 600;
  const ops = deltas.flatMap(d => {
    const el = doc.querySelector(`[data-editor-node="${d.id}"]`);
    if (!el) return [];
    const cs = win.getComputedStyle(el);
    const properties = shiftStyle({position: cs.position, left: cs.left, top: cs.top}, d.dx, d.dy);
    return Object.keys(properties).length ? [{type: 'setStyle' as const, file: s.designFile, nodeId: d.id, properties, breakpoint}] : [];
  });
  if (!ops.length) return 0;
  try { applyOperations(ops); } catch (error) { patchState({notice: error instanceof Error ? error.message : String(error)}); return 0; }
  return ops.length;
}

export function alignSelection(frame: HTMLIFrameElement | null, mode: AlignMode): number {
  return applyDeltas(frame, alignDeltas(measureSelection(frame), mode));
}
export function distributeSelection(frame: HTMLIFrameElement | null, axis: Axis): number {
  return applyDeltas(frame, distributeDeltas(measureSelection(frame), axis));
}
