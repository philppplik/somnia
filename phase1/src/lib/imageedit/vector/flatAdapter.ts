/**
 * Adapter between the flat pen/vectorcore/vectorio document ({@link FlatDocument}: paths with absolute-handle nodes)
 * and the structured {@link VectorScene}. Both directions validate through validateScene, so scene limits apply
 * (nodes, depth, segments). Anything that cannot be carried over is returned as a warning, never dropped silently.
 *
 * flat -> scene: one path node per flat path (subpaths sharing `compound` become ONE path node), layers become groups
 * (in first-seen order), hidden -> visible:false, style opacity -> node opacity, fill/stroke opacity folded into paint alpha.
 * scene -> flat: transforms are baked into coordinates, shapes become paths, arcs/quads become cubics, ancestor
 * opacity is multiplied in, the top-level group name becomes the layer. Gradients (url(#..)) have no scene paint and become 'none'.
 */
import type { Diagnostic, Style, VectorDocument as FlatDocument, VectorNode as FlatNode, VectorPath as FlatPath } from '../../vectorio/types';
import { DEFAULT_STYLE } from '../../vectorio/types';
import { inferKind, r3 } from '../../vectorio/nodes';
import { arcToCubics } from '../../vectorio/pathData';
import type { Matrix, NodeId, Paint, PathSegment, ShapeStyle, VectorNode, VectorScene } from './types';
import { applyMatrix, multiply } from './math';
import { geometryOf, geometryToSegments } from './path';
import { LIMITS, emptyNodeFields, parentIndex, validateScene, worldMatrix } from './scene';

const NAMED: Record<string, [number, number, number]> = {
  black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0], green: [0, 128, 0], blue: [0, 0, 255], yellow: [255, 255, 0], orange: [255, 165, 0],
  purple: [128, 0, 128], pink: [255, 192, 203], gray: [128, 128, 128], grey: [128, 128, 128], brown: [165, 42, 42], cyan: [0, 255, 255],
  magenta: [255, 0, 255], lime: [0, 255, 0], navy: [0, 0, 128], teal: [0, 128, 128], maroon: [128, 0, 0], olive: [128, 128, 0],
  silver: [192, 192, 192], aqua: [0, 255, 255], fuchsia: [255, 0, 255], gold: [255, 215, 0], indigo: [75, 0, 130], violet: [238, 130, 238], coral: [255, 127, 80], crimson: [220, 20, 60],
};
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
export interface AdapterResult<T> { readonly value: T; readonly warnings: readonly Diagnostic[] }

/** Flat colour string -> scene paint. `currentColor`, url(#..) and unknown values need a warning and become none. */
export function paintFromFlat(v: string | undefined, alpha: number, warn: (m: string) => void, what: string): Paint {
  const s = (v ?? 'none').trim().toLowerCase();
  if (s === 'none' || s === 'transparent') return { kind: 'none' };
  let rgb: [number, number, number] | undefined, a = 1;
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(s);
  if (m) { rgb = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) as [number, number, number]; if (m[2]) a = parseInt(m[2], 16) / 255; }
  else if (NAMED[s]) rgb = NAMED[s];
  if (!rgb) { warn(`${what} "${v}" has no scene equivalent and became none`); return { kind: 'none' }; }
  return { kind: 'solid', rgba: [rgb[0], rgb[1], rgb[2], Math.round(clamp01(a * alpha) * 1000) / 1000] };
}
const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
export function paintToFlat(p: Paint): { color: string; alpha: number } {
  if (p.kind === 'none') return { color: 'none', alpha: 1 };
  return { color: `#${hex2(p.rgba[0])}${hex2(p.rgba[1])}${hex2(p.rgba[2])}`, alpha: p.rgba[3] };
}

function styleFromFlat(s: Partial<Style> | undefined, warn: (m: string) => void): { style: ShapeStyle; opacity: number } {
  const t = { ...DEFAULT_STYLE, ...(s ?? {}) };
  const dash = t.dashArray.filter((d) => Number.isFinite(d) && d >= 0).slice(0, 16);
  return {
    opacity: clamp01(t.opacity),
    style: {
      fill: paintFromFlat(t.fill, t.fillOpacity, warn, 'fill'), stroke: paintFromFlat(t.stroke, t.strokeOpacity, warn, 'stroke'),
      strokeWidth: Math.max(0, Math.min(10_000, t.strokeWidth)), fillRule: t.fillRule, lineCap: t.lineCap, lineJoin: t.lineJoin,
      miterLimit: Math.max(1, Math.min(1000, t.miterLimit)), dash: dash.length && dash.some((d) => d > 0) ? dash : [], dashOffset: t.dashOffset,
    },
  };
}

function contourSegments(nodes: readonly FlatNode[], closed: boolean): PathSegment[] {
  if (nodes.length === 0) return [];
  const out: PathSegment[] = [{ kind: 'M', x: nodes[0].x, y: nodes[0].y }];
  const edge = (a: FlatNode, b: FlatNode) => {
    if (a.out || b.in) { const c1 = a.out ?? a, c2 = b.in ?? b; out.push({ kind: 'C', x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y, x: b.x, y: b.y }); }
    else out.push({ kind: 'L', x: b.x, y: b.y });
  };
  for (let i = 1; i < nodes.length; i++) edge(nodes[i - 1], nodes[i]);
  if (closed) { if (nodes.length > 1) edge(nodes[nodes.length - 1], nodes[0]); out.push({ kind: 'Z' }); }
  return out;
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** Flat document -> validated scene. Throws RangeError when scene limits are exceeded. */
export function flatToScene(doc: FlatDocument): AdapterResult<VectorScene> {
  const warnings: Diagnostic[] = [], seenWarn = new Set<string>();
  const warn = (m: string) => { if (!seenWarn.has(m)) { seenWarn.add(m); warnings.push({ severity: 'warning', message: m }); } };
  const nodes: Record<NodeId, VectorNode> = {};
  const used = new Set<string>();
  let counter = 0;
  const fresh = (preferred?: string) => {
    if (preferred && SAFE_ID.test(preferred) && !used.has(preferred) && preferred !== '__proto__') { used.add(preferred); return preferred; }
    let id: string; do { id = `n${++counter}`; } while (used.has(id));
    used.add(id); return id;
  };
  const groups = new Map<string, NodeId>(), roots: NodeId[] = [], kids = new Map<NodeId, NodeId[]>();
  const compound = new Map<string, { id: NodeId; segs: PathSegment[]; first: FlatPath }>();
  const placeIn = (layer: string | undefined, id: NodeId) => {
    if (!layer) { roots.push(id); return; }
    let g = groups.get(layer);
    if (!g) { g = fresh(); groups.set(layer, g); roots.push(g); kids.set(g, []); }
    kids.get(g)!.push(id);
  };
  for (const p of doc.paths) {
    const segs = contourSegments(p.nodes, p.closed);
    if (segs.length === 0) { warn('Empty path skipped'); continue; }
    const hit = p.compound ? compound.get(p.compound) : undefined;
    if (hit) { hit.segs.push(...segs); continue; }
    const id = fresh(p.id);
    const { style, opacity } = styleFromFlat(p.style, warn);
    const common = { ...emptyNodeFields, id, name: (p.name ?? p.layer ?? `Path ${counter + 1}`).slice(0, LIMITS.name) || 'Path', opacity, visible: !p.hidden };
    const node = { ...common, kind: 'path' as const, segments: segs, style } as VectorNode & { segments: PathSegment[] };
    nodes[id] = node;
    if (p.compound) compound.set(p.compound, { id, segs: node.segments as PathSegment[], first: p });
    placeIn(p.layer, id);
  }
  for (const [layer, gid] of groups) nodes[gid] = { ...emptyNodeFields, id: gid, name: layer.slice(0, LIMITS.name) || 'Layer', kind: 'group', children: kids.get(gid)! };
  const w = Math.max(1e-6, Math.min(100_000, doc.width)), h = Math.max(1e-6, Math.min(100_000, doc.height));
  const scene = validateScene({ viewBox: [0, 0, doc.width > 0 ? doc.width : w, doc.height > 0 ? doc.height : h], outputSize: { width: w, height: h }, roots, nodes });
  return { value: scene, warnings };
}

const cubicOf = (x0: number, y0: number, x1: number, y1: number, x: number, y: number) => ({ c1x: x0 + (2 / 3) * (x1 - x0), c1y: y0 + (2 / 3) * (y1 - y0), c2x: x + (2 / 3) * (x1 - x), c2y: y + (2 / 3) * (y1 - y) });

/** Segments -> flat contours with a baked matrix. Quads/arcs become cubics. */
function toContours(segs: readonly PathSegment[], m: Matrix): { nodes: FlatNode[]; closed: boolean }[] {
  const out: { nodes: FlatNode[]; closed: boolean }[] = [];
  let cur: { nodes: FlatNode[]; closed: boolean } | null = null, start: [number, number] = [0, 0], pos: [number, number] = [0, 0];
  const tp = (x: number, y: number) => { const [a, b] = applyMatrix(m, x, y); return { x: a, y: b }; };
  const mkNode = (x: number, y: number): FlatNode => ({ id: '', x: tp(x, y).x, y: tp(x, y).y, kind: 'corner' });
  const curve = (x1: number, y1: number, x2: number, y2: number, x: number, y: number) => {
    if (!cur) return;
    const last = cur.nodes[cur.nodes.length - 1], c1 = tp(x1, y1), c2 = tp(x2, y2);
    last.out = c1; cur.nodes.push({ ...mkNode(x, y), in: c2 }); pos = [x, y];
  };
  const begin = (x: number, y: number) => { cur = { nodes: [mkNode(x, y)], closed: false }; out.push(cur); start = [x, y]; pos = [x, y]; };
  for (const s of segs) {
    if (s.kind === 'M') begin(s.x, s.y);
    else if (s.kind === 'Z') {
      if (!cur) continue;
      const c = cur as { nodes: FlatNode[]; closed: boolean }, first = c.nodes[0], last = c.nodes[c.nodes.length - 1];
      if (c.nodes.length > 1 && Math.abs(first.x - last.x) < 1e-9 && Math.abs(first.y - last.y) < 1e-9) { if (last.in) first.in = last.in; c.nodes.pop(); }
      c.closed = true; pos = start; cur = null;
    } else {
      if (!cur) begin(pos[0], pos[1]);
      if (s.kind === 'L') { cur!.nodes.push(mkNode(s.x, s.y)); pos = [s.x, s.y]; }
      else if (s.kind === 'C') curve(s.x1, s.y1, s.x2, s.y2, s.x, s.y);
      else if (s.kind === 'Q') { const c = cubicOf(pos[0], pos[1], s.x1, s.y1, s.x, s.y); curve(c.c1x, c.c1y, c.c2x, c.c2y, s.x, s.y); }
      else if (s.kind === 'A') for (const a of arcToCubics(pos[0], pos[1], s.rx, s.ry, s.rotation, s.largeArc, s.sweep, s.x, s.y)) {
        if (a.t === 'L') { cur!.nodes.push(mkNode(a.x, a.y)); pos = [a.x, a.y]; } else if (a.t === 'C') curve(a.x1, a.y1, a.x2, a.y2, a.x, a.y);
      }
    }
  }
  return out;
}

/** Scene -> flat document (see the file header for what is baked in). */
export function sceneToFlat(input: VectorScene): AdapterResult<FlatDocument> {
  const scene = validateScene(input), warnings: Diagnostic[] = [];
  const parents = parentIndex(scene);
  const [vx, vy, vw, vh] = scene.viewBox, origin: Matrix = [1, 0, 0, 1, -vx, -vy];
  const paths: FlatPath[] = [];
  let pid = 0, nid = 0, cid = 0, sawOpacityFlatten = false;
  const walk = (ids: readonly NodeId[], layer: string | undefined, hidden: boolean, opacity: number) => {
    for (const id of ids) {
      const n = scene.nodes[id];
      const hid = hidden || !n.visible, op = opacity * n.opacity;
      if (n.kind === 'group') { walk(n.children, layer ?? n.name, hid, op); continue; }
      if (op !== 1 && opacity !== 1) sawOpacityFlatten = true;
      const m = multiply(origin, worldMatrix(scene, id, parents));
      const contours = toContours(geometryToSegments(geometryOf(n)), m);
      const fill = paintToFlat(n.style.fill), stroke = paintToFlat(n.style.stroke);
      const style: Partial<Style> = {
        fill: fill.color, stroke: stroke.color, strokeWidth: n.style.strokeWidth, fillOpacity: fill.alpha, strokeOpacity: stroke.alpha, opacity: op,
        fillRule: n.style.fillRule, lineCap: n.style.lineCap, lineJoin: n.style.lineJoin, miterLimit: n.style.miterLimit, dashArray: [...n.style.dash], dashOffset: n.style.dashOffset,
      };
      const comp = contours.length > 1 ? `c${++cid}` : undefined;
      for (const c of contours) {
        const nodes = c.nodes.map((q): FlatNode => {
          const node: FlatNode = { id: `n${++nid}`, x: r3(q.x), y: r3(q.y), kind: 'corner' };
          if (q.in) node.in = { x: r3(q.in.x), y: r3(q.in.y) };
          if (q.out) node.out = { x: r3(q.out.x), y: r3(q.out.y) };
          node.kind = inferKind(node.x, node.y, node.in, node.out);
          return node;
        });
        const p: FlatPath = { id: `p${++pid}`, closed: c.closed, nodes, style: { ...style }, name: n.name };
        if (layer) p.layer = layer;
        if (comp) p.compound = comp;
        if (hid) p.hidden = true;
        paths.push(p);
      }
    }
  };
  walk(scene.roots, undefined, false, 1);
  if (sawOpacityFlatten) warnings.push({ severity: 'warning', message: 'Group opacity was multiplied into each path (flat paths have no group compositing)' });
  return { value: { width: vw, height: vh, paths }, warnings };
}
