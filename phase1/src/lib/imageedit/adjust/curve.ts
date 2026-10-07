import { IDENTITY_CURVE, type CurvePoint } from './types';

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Clean a control-point list: finite values only, clamped 0..1, sorted by x,
 * duplicate x collapsed (last wins), endpoint anchors at x=0 and x=1 guaranteed
 * (default y 0 and 1 when the caller gave none). Never returns fewer than 2 points.
 */
export function normalizeCurve(points: unknown): CurvePoint[] {
  const raw: CurvePoint[] = [];
  if (Array.isArray(points)) {
    for (const p of points) {
      if (!p || typeof p !== 'object') continue;
      const x = Number((p as CurvePoint).x);
      const y = Number((p as CurvePoint).y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      raw.push({ x: clamp01(x), y: clamp01(y) });
    }
  }
  raw.sort((a, b) => a.x - b.x);
  const out: CurvePoint[] = [];
  for (const p of raw) {
    const last = out[out.length - 1];
    if (last && last.x === p.x) last.y = p.y;
    else out.push({ x: p.x, y: p.y });
  }
  if (!out.length || out[0].x > 0) out.unshift({ x: 0, y: 0 });
  if (out[out.length - 1].x < 1) out.push({ x: 1, y: 1 });
  return out;
}

export function isIdentityCurve(points: readonly CurvePoint[] | undefined): boolean {
  if (!points) return true;
  const c = normalizeCurve(points);
  return c.every((p) => Math.abs(p.x - p.y) < 1e-9);
}

/** Evaluate the piecewise-linear curve at x (0..1). */
export function evalCurve(points: readonly CurvePoint[], x: number): number {
  const c = normalizeCurve(points);
  const t = clamp01(x);
  for (let i = 1; i < c.length; i++) {
    if (t <= c[i].x) {
      const a = c[i - 1];
      const b = c[i];
      const span = b.x - a.x;
      return span <= 0 ? b.y : a.y + ((b.y - a.y) * (t - a.x)) / span;
    }
  }
  return c[c.length - 1].y;
}

/** 256-entry lookup table (8-bit in, 8-bit out). */
export function buildCurveLut(points: readonly CurvePoint[] | undefined): Uint8Array {
  const c = normalizeCurve(points ?? IDENTITY_CURVE);
  const lut = new Uint8Array(256);
  let seg = 1;
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    while (seg < c.length - 1 && x > c[seg].x) seg++;
    const a = c[seg - 1];
    const b = c[seg];
    const span = b.x - a.x;
    const y = span <= 0 ? b.y : a.y + ((b.y - a.y) * (x - a.x)) / span;
    lut[i] = Math.round(clamp01(y) * 255);
  }
  return lut;
}
