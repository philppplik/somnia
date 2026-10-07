import { flattenPath, nearestOnPath } from './path';
import type { HandleKind, Vec, VectorPath } from './types';

export type Hit =
  | { kind: 'handle'; pathId: string; nodeId: string; node: number; handle: HandleKind; distance: number }
  | { kind: 'node'; pathId: string; nodeId: string; node: number; distance: number }
  | { kind: 'segment'; pathId: string; segment: number; t: number; point: Vec; distance: number }
  | { kind: 'fill'; pathId: string; distance: 0 };

const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

export function hitNode(p: VectorPath, pt: Vec, radius: number): { node: number; distance: number } | null {
  let best: { node: number; distance: number } | null = null;
  p.nodes.forEach((n, i) => { const d = dist(n, pt); if (d <= radius && (!best || d < best.distance)) best = { node: i, distance: d }; });
  return best;
}
export function hitHandle(p: VectorPath, pt: Vec, radius: number): { node: number; handle: HandleKind; distance: number } | null {
  let best: { node: number; handle: HandleKind; distance: number } | null = null;
  p.nodes.forEach((n, i) => {
    for (const k of ['in', 'out'] as const) {
      const h = n[k]; if (!h) continue;
      const d = dist(h, pt);
      if (d <= radius && (!best || d < best.distance)) best = { node: i, handle: k, distance: d };
    }
  });
  return best;
}
export function hitSegment(p: VectorPath, pt: Vec, tolerance: number) {
  const r = nearestOnPath(p, pt);
  return r && r.distance <= tolerance ? r : null;
}

/** Point-in-path on the flattened outline (open paths are implicitly closed for filling). */
export function pointInPath(p: VectorPath, pt: Vec): boolean {
  const poly = flattenPath(p);
  if (poly.length < 3) return false;
  let winding = 0, crossings = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if ((a.y <= pt.y) !== (b.y <= pt.y)) {
      const x = a.x + ((pt.y - a.y) / (b.y - a.y)) * (b.x - a.x);
      if (x > pt.x) { crossings++; winding += b.y > a.y ? 1 : -1; }
    }
  }
  return p.fillRule === 'evenodd' ? crossings % 2 === 1 : winding !== 0;
}

export interface HitOptions { handleRadius?: number; nodeRadius?: number; strokeTolerance?: number; includeFill?: boolean; showHandles?: boolean }

/** Priority: handles > nodes > segments > fill. */
export function hitTestPath(p: VectorPath, pt: Vec, o: HitOptions = {}): Hit | null {
  const hr = o.handleRadius ?? 5, nr = o.nodeRadius ?? 6, st = o.strokeTolerance ?? Math.max(4, (p.strokeWidth ?? 1) / 2);
  if (o.showHandles !== false) { const h = hitHandle(p, pt, hr); if (h) return { kind: 'handle', pathId: p.id, nodeId: p.nodes[h.node].id, ...h }; }
  const a = hitNode(p, pt, nr); if (a) return { kind: 'node', pathId: p.id, nodeId: p.nodes[a.node].id, ...a };
  const s = hitSegment(p, pt, st); if (s) return { kind: 'segment', pathId: p.id, segment: s.segment, t: s.t, point: s.point, distance: s.distance };
  if (o.includeFill && p.fill && pointInPath(p, pt)) return { kind: 'fill', pathId: p.id, distance: 0 };
  return null;
}
/** Later paths are on top and win. */
export function hitTestDocument(paths: readonly VectorPath[], pt: Vec, o: HitOptions = {}): Hit | null {
  for (let i = paths.length - 1; i >= 0; i--) { const h = hitTestPath(paths[i], pt, o); if (h) return h; }
  return null;
}
