import { bbox, flatten, length, nearest, split, unionBBox } from './bezier';
import type { BBox, Cubic, VNode, Vec, VectorPath } from './types';

const P = (n: VNode): Vec => ({ x: n.x, y: n.y });

export function segmentCount(p: VectorPath): number {
  const n = p.nodes.length;
  return n < 2 ? 0 : p.closed ? n : n - 1;
}
export function segmentAt(p: VectorPath, i: number): Cubic {
  const a = p.nodes[i], b = p.nodes[(i + 1) % p.nodes.length];
  const p0 = P(a), p1 = P(b);
  return { p0, c1: a.out ?? p0, c2: b.in ?? p1, p1 };
}
export function segments(p: VectorPath): Cubic[] {
  const out: Cubic[] = [];
  for (let i = 0; i < segmentCount(p); i++) out.push(segmentAt(p, i));
  return out;
}
export function pathBBox(p: VectorPath): BBox | null {
  if (p.nodes.length === 0) return null;
  if (p.nodes.length === 1) { const n = p.nodes[0]; return { minX: n.x, minY: n.y, maxX: n.x, maxY: n.y }; }
  let box: BBox | null = null;
  for (const c of segments(p)) box = unionBBox(box, bbox(c));
  return box;
}
export const pathLength = (p: VectorPath): number => segments(p).reduce((a, c) => a + length(c), 0);

export function flattenPath(p: VectorPath, tolerance = 0.25): Vec[] {
  if (p.nodes.length === 1) return [P(p.nodes[0])];
  const pts: Vec[] = [];
  segments(p).forEach((c, i) => { const f = flatten(c, tolerance); pts.push(...(i === 0 ? f : f.slice(1))); });
  return pts;
}

/** Insert a node at parameter t of segment i, preserving the exact shape. Returns a new path; `newId` names the new node. */
export function splitSegment(p: VectorPath, i: number, t: number, newId: string): VectorPath {
  if (!(i >= 0 && i < segmentCount(p))) throw new RangeError('segment index out of range');
  if (!(t > 0 && t < 1)) throw new RangeError('t must be within (0,1)');
  if (p.nodes.some((n) => n.id === newId)) throw new Error(`Duplicate node id ${newId}`);
  const j = (i + 1) % p.nodes.length;
  const a = p.nodes[i], b = p.nodes[j];
  const curved = !!a.out || !!b.in;
  const [l, r] = split(segmentAt(p, i), t);
  const na: VNode = { ...a }; const nb: VNode = { ...b };
  if (curved) { na.out = l.c1; nb.in = r.c2; }
  const mid: VNode = curved ? { id: newId, x: l.p1.x, y: l.p1.y, kind: 'smooth', in: l.c2, out: r.c1 } : { id: newId, x: l.p1.x, y: l.p1.y, kind: 'corner' };
  const nodes = p.nodes.slice();
  nodes[i] = na; nodes[j] = nb;
  if (j === 0) nodes.push(mid); else nodes.splice(i + 1, 0, mid);
  return { ...p, nodes };
}

export function nearestOnPath(p: VectorPath, pt: Vec): { segment: number; t: number; point: Vec; distance: number } | null {
  let best: { segment: number; t: number; point: Vec; distance: number } | null = null;
  for (let i = 0; i < segmentCount(p); i++) {
    const r = nearest(segmentAt(p, i), pt);
    if (!best || r.distance < best.distance) best = { segment: i, ...r };
  }
  return best;
}
