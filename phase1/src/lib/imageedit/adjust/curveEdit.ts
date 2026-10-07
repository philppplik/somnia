import { normalizeCurve } from './curve';
import type { CurvePoint } from './types';

const c01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const MIN_GAP = 0.01;

/** Add a point (ignored when one already sits within MIN_GAP in x). Returns new list + its index. */
export function addPoint(points: CurvePoint[], x: number, y: number): { points: CurvePoint[]; index: number } {
  const c = normalizeCurve(points);
  const px = c01(x);
  const near = c.findIndex((p) => Math.abs(p.x - px) < MIN_GAP);
  if (near >= 0) return { points: c, index: near };
  c.push({ x: px, y: c01(y) });
  c.sort((a, b) => a.x - b.x);
  return { points: c, index: c.findIndex((p) => p.x === px) };
}

/** Move a point. Endpoints move only vertically; interior points stay between their neighbours. */
export function movePoint(points: CurvePoint[], index: number, x: number, y: number): CurvePoint[] {
  const c = normalizeCurve(points);
  if (index < 0 || index >= c.length) return c;
  const last = c.length - 1;
  const nx = index === 0 ? 0 : index === last ? 1 : Math.min(c[index + 1].x - MIN_GAP, Math.max(c[index - 1].x + MIN_GAP, c01(x)));
  c[index] = { x: nx, y: c01(y) };
  return c;
}

/** Remove an interior point; endpoint anchors cannot be removed. */
export function removePoint(points: CurvePoint[], index: number): CurvePoint[] {
  const c = normalizeCurve(points);
  if (index <= 0 || index >= c.length - 1) return c;
  c.splice(index, 1);
  return c;
}
