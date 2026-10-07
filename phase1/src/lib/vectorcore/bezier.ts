import type { BBox, Cubic, Vec } from './types';

const lerp = (a: Vec, b: Vec, t: number): Vec => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

export function evaluate(c: Cubic, t: number): Vec {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, d = 3 * u * t * t, e = t * t * t;
  return { x: a * c.p0.x + b * c.c1.x + d * c.c2.x + e * c.p1.x, y: a * c.p0.y + b * c.c1.y + d * c.c2.y + e * c.p1.y };
}

export function derivative(c: Cubic, t: number): Vec {
  const u = 1 - t;
  const f = (a: number, b: number, cc: number, d: number) => 3 * u * u * (b - a) + 6 * u * t * (cc - b) + 3 * t * t * (d - cc);
  return { x: f(c.p0.x, c.c1.x, c.c2.x, c.p1.x), y: f(c.p0.y, c.c1.y, c.c2.y, c.p1.y) };
}

/** de Casteljau split. Both halves together reproduce the original curve. */
export function split(c: Cubic, t: number): [Cubic, Cubic] {
  const a = lerp(c.p0, c.c1, t), b = lerp(c.c1, c.c2, t), d = lerp(c.c2, c.p1, t);
  const e = lerp(a, b, t), f = lerp(b, d, t);
  const m = lerp(e, f, t);
  return [{ p0: c.p0, c1: a, c2: e, p1: m }, { p0: m, c1: f, c2: d, p1: c.p1 }];
}

// 5-point Gauss-Legendre on [-1,1]
const GX = [0, -0.5384693101056831, 0.5384693101056831, -0.9061798459386640, 0.9061798459386640];
const GW = [0.5688888888888889, 0.4786286704993665, 0.4786286704993665, 0.2369268850561891, 0.2369268850561891];

function lengthRange(c: Cubic, t0: number, t1: number): number {
  const h = (t1 - t0) / 2, m = (t1 + t0) / 2;
  let s = 0;
  for (let i = 0; i < 5; i++) { const d = derivative(c, m + h * GX[i]); s += GW[i] * Math.hypot(d.x, d.y); }
  return s * h;
}

/** Arc length via adaptive Gauss-Legendre (subdivide until halves agree within tol). */
export function length(c: Cubic, tol = 1e-6): number {
  const rec = (t0: number, t1: number, whole: number, depth: number): number => {
    const mid = (t0 + t1) / 2;
    const l = lengthRange(c, t0, mid), r = lengthRange(c, mid, t1);
    if (depth >= 12 || Math.abs(l + r - whole) < tol) return l + r;
    return rec(t0, mid, l, depth + 1) + rec(mid, t1, r, depth + 1);
  };
  return rec(0, 1, lengthRange(c, 0, 1), 0);
}

/** Roots of the derivative per axis in (0,1). */
function extrema(a: number, b: number, c: number, d: number): number[] {
  // derivative/3: A t^2 + B t + C
  const A = -a + 3 * b - 3 * c + d, B = 2 * (a - 2 * b + c), C = b - a;
  const out: number[] = [];
  if (Math.abs(A) < 1e-12) { if (Math.abs(B) > 1e-12) out.push(-C / B); }
  else {
    const disc = B * B - 4 * A * C;
    if (disc >= 0) { const s = Math.sqrt(disc); out.push((-B + s) / (2 * A), (-B - s) / (2 * A)); }
  }
  return out.filter((t) => t > 0 && t < 1);
}

/** Tight bounding box using derivative roots. */
export function bbox(c: Cubic): BBox {
  const ts = [0, 1, ...extrema(c.p0.x, c.c1.x, c.c2.x, c.p1.x), ...extrema(c.p0.y, c.c1.y, c.c2.y, c.p1.y)];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const t of ts) { const p = evaluate(c, t); minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  return { minX, minY, maxX, maxY };
}

export const unionBBox = (a: BBox | null, b: BBox): BBox => a
  ? { minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) }
  : { ...b };

/** Closest point on the curve: coarse sampling then ternary-style refinement. */
export function nearest(c: Cubic, pt: Vec, samples = 32): { t: number; point: Vec; distance: number } {
  let bestT = 0, bestD = Infinity;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples, p = evaluate(c, t), d = (p.x - pt.x) ** 2 + (p.y - pt.y) ** 2;
    if (d < bestD) { bestD = d; bestT = t; }
  }
  let lo = Math.max(0, bestT - 1 / samples), hi = Math.min(1, bestT + 1 / samples);
  for (let i = 0; i < 40; i++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    const p1 = evaluate(c, m1), p2 = evaluate(c, m2);
    if ((p1.x - pt.x) ** 2 + (p1.y - pt.y) ** 2 < (p2.x - pt.x) ** 2 + (p2.y - pt.y) ** 2) hi = m2; else lo = m1;
  }
  const t = (lo + hi) / 2, point = evaluate(c, t);
  return { t, point, distance: Math.hypot(point.x - pt.x, point.y - pt.y) };
}

/** Polyline approximation (uniform in t, count scales with control polygon size). */
export function flatten(c: Cubic, tolerance = 0.25): Vec[] {
  const poly = Math.hypot(c.c1.x - c.p0.x, c.c1.y - c.p0.y) + Math.hypot(c.c2.x - c.c1.x, c.c2.y - c.c1.y) + Math.hypot(c.p1.x - c.c2.x, c.p1.y - c.c2.y);
  const n = Math.min(256, Math.max(1, Math.ceil(Math.sqrt(poly / Math.max(tolerance, 1e-3)))));
  const pts: Vec[] = [];
  for (let i = 0; i <= n; i++) pts.push(evaluate(c, i / n));
  return pts;
}

export const isLine = (c: Cubic): boolean => c.c1 === c.p0 || (c.c1.x === c.p0.x && c.c1.y === c.p0.y && c.c2.x === c.p1.x && c.c2.y === c.p1.y);

// ---- Contract aliases (pen-tool). Cubic may be {p0,c1,c2,p1} or a 4-tuple [p0,c1,c2,p1]. ----
export type CubicLike = Cubic | readonly [Vec, Vec, Vec, Vec];
const toCubic = (c: CubicLike): Cubic => (Array.isArray(c) ? { p0: c[0], c1: c[1], c2: c[2], p1: c[3] } : (c as Cubic));
export const pointAt = (c: CubicLike, t: number): Vec => evaluate(toCubic(c), t);
export const splitCubic = (c: CubicLike, t: number): [Cubic, Cubic] => split(toCubic(c), t);
export const cubicBBox = (c: CubicLike): BBox => bbox(toCubic(c));
export const cubicLength = (c: CubicLike, tol?: number): number => length(toCubic(c), tol);
