import type { NodeKind, Point, VectorDocument, VectorNode, VectorPath } from './types';
import { DEFAULT_STYLE } from './types';

export const r3 = (n: number): number => { const v = Math.round(n * 1000) / 1000; return Object.is(v, -0) ? 0 : v; };

/** Infer node kind from absolute handles. Tolerances are on direction (collinear, opposite) and length. */
export function inferKind(x: number, y: number, i?: Point, o?: Point): NodeKind {
  if (!i || !o) return 'corner';
  const ax = i.x - x, ay = i.y - y, bx = o.x - x, by = o.y - y;
  const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
  if (la < 1e-9 || lb < 1e-9) return 'corner';
  const cross = Math.abs(ax * by - ay * bx) / (la * lb);
  const dot = (ax * bx + ay * by) / (la * lb);
  if (cross > 1e-3 || dot > 0) return 'corner';
  return Math.abs(la - lb) <= 1e-3 * Math.max(la, lb) + 1e-9 ? 'symmetric' : 'smooth';
}

/** Round to the canonical 3 decimals and re-infer node kinds. Export output always equals what this produces. */
export function normalizeDoc(doc: VectorDocument): VectorDocument {
  const pt = (p?: Point): Point | undefined => (p ? { x: r3(p.x), y: r3(p.y) } : undefined);
  return {
    width: r3(doc.width), height: r3(doc.height),
    paths: doc.paths.map((p): VectorPath => {
      const out: VectorPath = {
        id: p.id, closed: p.closed,
        nodes: p.nodes.map((n): VectorNode => {
          const x = r3(n.x), y = r3(n.y);
          let i = pt(n.in), o = pt(n.out);
          if (i && i.x === x && i.y === y) i = undefined; // retracted handle == absent
          if (o && o.x === x && o.y === y) o = undefined;
          const nn: VectorNode = { id: n.id, x, y, kind: inferKind(x, y, i, o) };
          if (i) nn.in = i;
          if (o) nn.out = o;
          return nn;
        }),
      };
      if (p.style) {
        const s: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(p.style)) {
          const d = (DEFAULT_STYLE as unknown as Record<string, unknown>)[k];
          const val = typeof v === 'number' ? (k === 'miterLimit' || k === 'strokeWidth' || k === 'dashOffset' ? r3(v) : Math.round(v * 1000) / 1000) : Array.isArray(v) ? v.map(r3) : v;
          if (JSON.stringify(val) !== JSON.stringify(d)) s[k] = val;
        }
        if (Object.keys(s).length) out.style = s as VectorPath['style'];
      }
      if (p.layer !== undefined) out.layer = p.layer;
      if (p.compound !== undefined) out.compound = p.compound;
      if (p.name !== undefined) out.name = p.name;
      if (p.hidden) out.hidden = true;
      return out;
    }),
  };
}

/** Does the segment from a to b (a.out, b.in) have curve handles? */
export const isCurve = (a: VectorNode, b: VectorNode): boolean => !!(a.out || b.in);
