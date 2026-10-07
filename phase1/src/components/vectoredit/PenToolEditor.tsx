import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type MouseEvent } from 'react';
import {
  appendNode, convertNodes, deleteNodes, insertNode, moveHandle, moveNodes, nearestSegmentT,
  pathData, penHandles, removeHandles, refKey, sameRef, segmentData, selectInRect,
  type HandleSide, type NodeRef, type VectorCommit, type VectorDocument, type VectorPoint,
} from './model';

export interface PenToolEditorProps {
  value: VectorDocument;
  /** Synchronous preview. Host should update value without adding history. */
  onChange(value: VectorDocument): void;
  /** One atomic undo entry. before is the document at gesture start. */
  onCommit?(commit: VectorCommit): void;
  onSelectionChange?(selection: NodeRef[]): void;
  onFinish?(pathId: string): void;
  onUndo?(): void;
  onRedo?(): void;
  disabled?: boolean;
  /** Only creates identities, never coordinates. Supply vectorcore's ID factory here. */
  createId?(): string;
  className?: string;
  style?: CSSProperties;
}

type Tool = 'pen' | 'node';
type Hit = { kind: 'anchor'; ref: NodeRef } | { kind: 'handle'; ref: NodeRef; side: HandleSide }
  | { kind: 'segment'; pathId: string; segment: number };
type Gesture = {
  pointerId: number; start: VectorPoint; before: VectorDocument; latest: VectorDocument;
  action: 'pen' | 'move' | 'handle' | 'marquee'; selection: NodeRef[];
  ref?: NodeRef; side?: HandleSide; shifted?: boolean; moved: boolean;
};
const ACCENT = 'var(--accent, #7c3aed)';
const toolbarStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' };
const buttonStyle: CSSProperties = { border: '1px solid var(--border, #d9dce3)', borderRadius: 10, padding: '6px 10px', background: 'var(--surface, #F8F9FB)', color: 'inherit', fontSize: 12 };
const joinSelection = (a: NodeRef[], b: NodeRef[]) => Array.from(new Map([...a, ...b].map(r => [refKey(r), r])).values());

/** Standalone SVG surface. No assumptions about vectorcore operations, raster editor or host history. */
export function PenToolEditor(props: PenToolEditorProps) {
  const { value, onChange, onCommit, disabled = false } = props;
  const [tool, setTool] = useState<Tool>('pen');
  const [selection, setSelectionState] = useState<NodeRef[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<{ start: VectorPoint; end: VectorPoint } | null>(null);
  const [cursor, setCursor] = useState<VectorPoint | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const latest = useRef(value);
  const gesture = useRef<Gesture | null>(null);
  // Event handlers also keep the latest preview locally, including fast move/up before a parent render.
  if (!gesture.current) latest.current = value;
  const id = () => props.createId?.() ?? crypto.randomUUID();
  const select = (next: NodeRef[]) => { setSelectionState(next); props.onSelectionChange?.(next); };
  const preview = (next: VectorDocument) => { latest.current = next; if (gesture.current) gesture.current.latest = next; onChange(next); };
  const commit = (before: VectorDocument, after: VectorDocument, reason: VectorCommit['reason']) => {
    if (JSON.stringify(before) !== JSON.stringify(after)) onCommit?.({ before, after, reason });
  };
  const apply = (next: VectorDocument, reason: VectorCommit['reason']) => {
    const before = latest.current; preview(next); commit(before, next, reason);
  };
  const point = (e: { clientX: number; clientY: number }): VectorPoint => {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
    return { x: p.x, y: p.y };
  };
  const hit = (target: EventTarget | null): Hit | null => {
    if (!(target instanceof Element)) return null;
    const el = target.closest('[data-vector-hit]');
    const kind = el?.getAttribute('data-vector-hit');
    const pathId = el?.getAttribute('data-path-id');
    if (!pathId) return null;
    if (kind === 'segment') return { kind, pathId, segment: Number(el!.getAttribute('data-segment')) };
    const nodeId = el?.getAttribute('data-node-id');
    if (!nodeId) return null;
    const ref = { pathId, nodeId };
    if (kind === 'anchor') return { kind, ref };
    if (kind === 'handle') return { kind, ref, side: el!.getAttribute('data-side') as HandleSide };
    return null;
  };
  const finish = () => {
    if (activePath) props.onFinish?.(activePath);
    setActivePath(null); setCursor(null);
  };
  const cancelGesture = () => {
    const g = gesture.current;
    if (!g) return;
    gesture.current = null; latest.current = g.before; onChange(g.before);
    select(g.selection); setMarquee(null);
    if (svg.current?.hasPointerCapture(g.pointerId)) svg.current.releasePointerCapture(g.pointerId);
  };
  const down = (e: PointerEvent<SVGSVGElement>) => {
    if (disabled || e.button !== 0 || gesture.current) return;
    e.preventDefault(); svg.current?.focus();
    const start = point(e), target = hit(e.target), before = latest.current;
    // Clicking the first anchor closes a path. The open path already exists in the host document.
    const path = before.paths.find(p => p.id === activePath);
    if (tool === 'pen' && target?.kind === 'anchor' && path && path.nodes.length >= 3
      && target.ref.pathId === path.id && target.ref.nodeId === path.nodes[0].id) {
      apply({ ...before, paths: before.paths.map(p => p.id === path.id ? { ...p, closed: true } : p) }, 'close'); finish(); return;
    }
    const g: Gesture = { pointerId: e.pointerId, start, before, latest: before, action: 'marquee', selection, moved: false, shifted: e.shiftKey };
    gesture.current = g;
    if (target?.kind === 'handle' && tool === 'node') { g.action = 'handle'; g.ref = target.ref; g.side = target.side; }
    else if (target?.kind === 'anchor' && tool === 'node') {
      const selected = selection.some(r => sameRef(r, target.ref));
      if (e.shiftKey && selected) { select(selection.filter(r => !sameRef(r, target.ref))); gesture.current = null; return; }
      const nextSelection = selected ? selection : e.shiftKey ? [...selection, target.ref] : [target.ref];
      select(nextSelection); g.action = 'move'; g.ref = target.ref;
      // Move set is separate from the selection snapshot used when canceling.
      g.shifted = false;
      g.latest = before;
      moving.current = nextSelection;
    } else if (tool === 'pen') {
      const pathId = path && !path.closed ? path.id : id(), nodeId = id();
      if (!path || path.closed) setActivePath(pathId);
      const ref = { pathId, nodeId };
      g.action = 'pen'; g.ref = ref;
      preview(appendNode(before, pathId, { id: nodeId, ...start, kind: 'corner' })); select([ref]);
    } else {
      setMarquee({ start, end: start }); if (!e.shiftKey) select([]);
    }
    svg.current?.setPointerCapture(e.pointerId);
  };
  const moving = useRef<NodeRef[]>([]);
  const move = (e: PointerEvent<SVGSVGElement>) => {
    const p = point(e); setCursor(p);
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId || disabled) return;
    const rect = svg.current!.getBoundingClientRect();
    const threshold = 3 * latest.current.width / Math.max(1, rect.width);
    if (Math.hypot(p.x - g.start.x, p.y - g.start.y) > threshold) g.moved = true;
    if (g.action === 'pen' && g.moved) preview(penHandles(g.latest, g.ref!, p));
    else if (g.action === 'move') preview(moveNodes(g.before, moving.current, { x: p.x - g.start.x, y: p.y - g.start.y }));
    else if (g.action === 'handle') preview(moveHandle(g.before, g.ref!, g.side!, p, e.altKey));
    else if (g.action === 'marquee') {
      setMarquee({ start: g.start, end: p });
      const inside = selectInRect(g.before, g.start, p);
      select(g.shifted ? joinSelection(g.selection, inside) : inside);
    }
  };
  const up = (e: PointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    gesture.current = null; setMarquee(null);
    commit(g.before, g.latest, g.action === 'marquee' ? 'move' : g.action);
    if (svg.current?.hasPointerCapture(e.pointerId)) svg.current.releasePointerCapture(e.pointerId);
  };
  const remove = () => { apply(deleteNodes(latest.current, selection), 'delete'); select([]); };
  const convert = (kind: 'corner' | 'smooth' | 'symmetric') => apply(convertNodes(latest.current, selection, kind), 'convert');
  const doubleClick = (e: MouseEvent<SVGSVGElement>) => {
    if (disabled || tool !== 'node' || gesture.current) return;
    // Pointer capture retargets click/dblclick to the SVG in Chrome. Re-hit-test at screen coordinates.
    const target = hit(document.elementFromPoint(e.clientX, e.clientY));
    if (target?.kind !== 'segment') return;
    const path = latest.current.paths.find(p => p.id === target.pathId);
    if (!path) return;
    const nodeId = id();
    apply(insertNode(latest.current, target.pathId, target.segment, nearestSegmentT(path, target.segment, point(e)), nodeId), 'insert');
    select([{ pathId: target.pathId, nodeId }]);
  };
  const key = (e: KeyboardEvent<SVGSVGElement>) => {
    if (disabled) return;
    const lower = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
    if (['Escape', 'Enter', 'Delete', 'Backspace', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) || (mod && ['a', 'z', 'y'].includes(lower)) || (!mod && !e.altKey && ['p', 'v', 'c', 's'].includes(lower))) e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); if (gesture.current) cancelGesture(); else { finish(); setTool('node'); select([]); } return; }
    if (gesture.current) return;
    if (e.key === 'Enter') { e.preventDefault(); finish(); setTool('node'); return; }
    if (mod && lower === 'a') { e.preventDefault(); select(latest.current.paths.flatMap(p => p.nodes.map(n => ({ pathId: p.id, nodeId: n.id })))); return; }
    if (mod && lower === 'z') { e.preventDefault(); finish(); select([]); if (e.shiftKey) props.onRedo?.(); else props.onUndo?.(); return; }
    if (mod && lower === 'y') { e.preventDefault(); finish(); select([]); props.onRedo?.(); return; }
    if (!mod && !e.altKey && (lower === 'p' || lower === 'v')) { e.preventDefault(); finish(); setTool(lower === 'p' ? 'pen' : 'node'); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(); return; }
    if (lower === 'c' && !mod && !e.altKey) { e.preventDefault(); convert('corner'); return; }
    if (lower === 's' && !mod && !e.altKey) { e.preventDefault(); convert('smooth'); return; }
    const step = e.shiftKey ? 10 : 1;
    const delta: Record<string, VectorPoint> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } };
    if (delta[e.key] && !mod) { e.preventDefault(); apply(moveNodes(latest.current, selection, delta[e.key]), 'nudge'); }
  };
  const selected = new Set(selection.map(refKey));
  const hasSelection = selection.length > 0;
  const active = value.paths.find(p => p.id === activePath);
  const last = active?.nodes.at(-1);
  return (
    <section className={props.className} style={{ display: 'grid', gap: 10, padding: 14, borderRadius: 25, background: 'var(--surface, #F8F9FB)', ...props.style }} aria-label="Vector path editor" data-testid="vector-editor">
      <div style={toolbarStyle} role="toolbar" aria-label="Vector tools">
        <button style={{ ...buttonStyle, ...(tool === 'pen' ? { background: ACCENT, color: 'white', borderColor: ACCENT } : {}) }} type="button" disabled={disabled} aria-pressed={tool === 'pen'} title="Pen (P): click for corner, drag for smooth" onClick={() => { finish(); setTool('pen'); }}>Pen</button>
        <button style={{ ...buttonStyle, ...(tool === 'node' ? { background: ACCENT, color: 'white', borderColor: ACCENT } : {}) }} type="button" disabled={disabled} aria-pressed={tool === 'node'} title="Edit nodes (V)" onClick={() => { finish(); setTool('node'); }}>Nodes</button>
        <span style={{ width: 1, height: 20, background: 'var(--border, #d9dce3)' }} />
        <button style={buttonStyle} type="button" disabled={disabled || !hasSelection} title="Independent handles (C)" onClick={() => convert('corner')}>Corner</button>
        <button style={buttonStyle} type="button" disabled={disabled || !hasSelection} title="Create smooth handles (S)" onClick={() => convert('smooth')}>Smooth</button>
        <button style={buttonStyle} type="button" disabled={disabled || !hasSelection} title="Equal-length mirrored handles" onClick={() => convert('symmetric')}>Symmetric</button>
        <button style={buttonStyle} type="button" disabled={disabled || !hasSelection} title="Clear both handles" onClick={() => apply(removeHandles(latest.current, selection), 'convert')}>Remove handles</button>
        <button style={buttonStyle} type="button" disabled={disabled || !hasSelection} title="Delete selected anchors (Delete)" onClick={remove}>Delete</button>
        <button style={buttonStyle} type="button" disabled={disabled || !activePath} title="Finish open path (Enter or Escape)" onClick={finish}>Finish path</button>
      </div>
      <svg ref={svg} viewBox={`0 0 ${value.width} ${value.height}`} width="100%" tabIndex={disabled ? -1 : 0}
        role="group" aria-label="Vector canvas. P pen, V nodes, arrows move, Shift arrows move ten, Delete removes, C corner, S smooth. Enter or Escape finishes."
        aria-disabled={disabled} data-testid="vector-canvas"
        style={{ display: 'block', aspectRatio: `${value.width} / ${value.height}`, maxHeight: 620, border: '1px solid var(--border, #d9dce3)', borderRadius: 16, background: 'var(--canvas, #fff)', touchAction: 'none', cursor: tool === 'pen' ? 'crosshair' : 'default' }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancelGesture}
        onLostPointerCapture={() => { if (gesture.current) cancelGesture(); }}
        onDoubleClick={doubleClick} onKeyDown={key} onPointerLeave={() => { if (!gesture.current) setCursor(null); }}>
        {value.paths.map(path => <g key={path.id}>
          <path d={pathData(path)} fill={path.closed ? 'var(--accent, #7c3aed)' : 'none'} fillOpacity={0.07} stroke={ACCENT} strokeWidth={2} vectorEffect="non-scaling-stroke" pointerEvents="none" />
          {Array.from({ length: Math.max(0, path.nodes.length - (path.closed ? 0 : 1)) }, (_, i) => <path key={i}
            d={`M ${path.nodes[i].x} ${path.nodes[i].y} ${segmentData(path, i)}`} fill="none" stroke="transparent" strokeWidth={12} vectorEffect="non-scaling-stroke"
            data-vector-hit="segment" data-path-id={path.id} data-segment={i} />)}
        </g>)}
        {tool === 'pen' && last && cursor && !gesture.current && <path d={`M ${last.x} ${last.y} L ${cursor.x} ${cursor.y}`} stroke={ACCENT} strokeDasharray="4 4" vectorEffect="non-scaling-stroke" fill="none" pointerEvents="none" opacity={0.5} />}
        {value.paths.flatMap(path => path.nodes.map((n, i) => {
          const chosen = selected.has(refKey({ pathId: path.id, nodeId: n.id }));
          return <g key={`${path.id}:${n.id}`}>
            {chosen && (['in', 'out'] as const).map(side => n[side] && <g key={side}>
              <line x1={n.x} y1={n.y} x2={n[side]!.x} y2={n[side]!.y} stroke={ACCENT} vectorEffect="non-scaling-stroke" pointerEvents="none" />
              <circle cx={n[side]!.x} cy={n[side]!.y} r={4} fill="white" stroke={ACCENT} strokeWidth={1.5}
                data-vector-hit="handle" data-path-id={path.id} data-node-id={n.id} data-side={side} aria-label={`${side} handle of anchor ${i + 1}`} />
            </g>)}
            <circle cx={n.x} cy={n.y} r={chosen ? 5 : 4} fill={chosen ? ACCENT : 'white'} stroke={ACCENT} strokeWidth={1.5}
              data-vector-hit="anchor" data-path-id={path.id} data-node-id={n.id} aria-label={`Anchor ${i + 1}, ${n.kind}${chosen ? ', selected' : ''}`} />
          </g>;
        }))}
        {marquee && <rect x={Math.min(marquee.start.x, marquee.end.x)} y={Math.min(marquee.start.y, marquee.end.y)} width={Math.abs(marquee.end.x - marquee.start.x)} height={Math.abs(marquee.end.y - marquee.start.y)}
          fill={ACCENT} fillOpacity={0.08} stroke={ACCENT} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" pointerEvents="none" />}
      </svg>
      <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }} aria-live="polite">
        {tool === 'pen' ? 'Click for corner, drag for smooth. Click first anchor to close. Enter / Escape finishes.' : 'Drag anchors or handles. Shift selects more. Drag empty space to select. Double-click a segment to add. Alt-drag breaks handles.'}
        {hasSelection ? ` ${selection.length} anchor${selection.length === 1 ? '' : 's'} selected.` : ''}
      </p>
    </section>
  );
}
