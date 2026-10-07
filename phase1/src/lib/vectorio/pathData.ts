export type Segment =
  | { t: 'M'; x: number; y: number }
  | { t: 'L'; x: number; y: number }
  | { t: 'Q'; x1: number; y1: number; x: number; y: number }
  | { t: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { t: 'Z' };

export class PathParseError extends Error {}

const ARGS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/** Tokenizer: handles "1.5.5", "1-2", "1e-3", and arc flags written without separators ("a1 1 0 00.5.5"). */
class Reader {
  i = 0;
  constructor(readonly s: string) {}
  ws() { while (this.i < this.s.length && /[\s,]/.test(this.s[this.i])) this.i++; }
  eof() { this.ws(); return this.i >= this.s.length; }
  peek() { this.ws(); return this.s[this.i]; }
  number(): number {
    this.ws();
    const m = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;
    m.lastIndex = this.i;
    const r = m.exec(this.s);
    if (!r) throw new PathParseError(`number expected at ${this.i}`);
    this.i = m.lastIndex;
    return Number(r[0]);
  }
  flag(): number {
    this.ws();
    const c = this.s[this.i];
    if (c !== '0' && c !== '1') throw new PathParseError(`flag expected at ${this.i}`);
    this.i++;
    return c === '1' ? 1 : 0;
  }
}

/**
 * Parse path data to absolute M/L/Q/C/Z segments. H/V/S/T/relative commands and arcs are normalised.
 * On a malformed tail the valid prefix is returned and `error` describes the problem (per SVG error handling).
 */
export function parsePathData(d: string): { segments: Segment[]; error?: string } {
  const out: Segment[] = [];
  const r = new Reader(d);
  let cx = 0, cy = 0, sx = 0, sy = 0;
  let prevCmd = '', lcx = 0, lcy = 0; // last control point for S/T reflection
  let cmd = '';
  try {
    while (!r.eof()) {
      const c = r.peek();
      if (/[A-Za-z]/.test(c)) {
        if (!(c.toUpperCase() in ARGS)) throw new PathParseError(`unknown command ${c}`);
        cmd = c; r.i++;
        if (out.length === 0 && c.toUpperCase() !== 'M') throw new PathParseError('path must start with M');
        if (c === 'Z' || c === 'z') {
          out.push({ t: 'Z' }); cx = sx; cy = sy; prevCmd = 'Z'; continue;
        }
      } else if (!cmd) throw new PathParseError('path must start with a command');
      else if (cmd === 'Z' || cmd === 'z') throw new PathParseError('number after Z');
      const rel = cmd === cmd.toLowerCase();
      const up = cmd.toUpperCase();
      const ox = rel ? cx : 0, oy = rel ? cy : 0;
      switch (up) {
        case 'M': {
          const x = r.number() + ox, y = r.number() + oy;
          out.push({ t: 'M', x, y }); cx = sx = x; cy = sy = y;
          cmd = rel ? 'l' : 'L'; prevCmd = 'M'; continue;
        }
        case 'L': { const x = r.number() + ox, y = r.number() + oy; out.push({ t: 'L', x, y }); cx = x; cy = y; break; }
        case 'H': { const x = r.number() + ox; out.push({ t: 'L', x, y: cy }); cx = x; break; }
        case 'V': { const y = r.number() + oy; out.push({ t: 'L', x: cx, y }); cy = y; break; }
        case 'C': {
          const x1 = r.number() + ox, y1 = r.number() + oy, x2 = r.number() + ox, y2 = r.number() + oy, x = r.number() + ox, y = r.number() + oy;
          out.push({ t: 'C', x1, y1, x2, y2, x, y }); lcx = x2; lcy = y2; cx = x; cy = y; break;
        }
        case 'S': {
          const x2 = r.number() + ox, y2 = r.number() + oy, x = r.number() + ox, y = r.number() + oy;
          const refl = prevCmd === 'C' || prevCmd === 'S';
          const x1 = refl ? 2 * cx - lcx : cx, y1 = refl ? 2 * cy - lcy : cy;
          out.push({ t: 'C', x1, y1, x2, y2, x, y }); lcx = x2; lcy = y2; cx = x; cy = y; prevCmd = 'S'; continue;
        }
        case 'Q': {
          const x1 = r.number() + ox, y1 = r.number() + oy, x = r.number() + ox, y = r.number() + oy;
          out.push({ t: 'Q', x1, y1, x, y }); lcx = x1; lcy = y1; cx = x; cy = y; break;
        }
        case 'T': {
          const x = r.number() + ox, y = r.number() + oy;
          const refl = prevCmd === 'Q' || prevCmd === 'T';
          const x1 = refl ? 2 * cx - lcx : cx, y1 = refl ? 2 * cy - lcy : cy;
          out.push({ t: 'Q', x1, y1, x, y }); lcx = x1; lcy = y1; cx = x; cy = y; prevCmd = 'T'; continue;
        }
        case 'A': {
          const rx = r.number(), ry = r.number(), rot = r.number(), large = r.flag(), sweep = r.flag();
          const x = r.number() + ox, y = r.number() + oy;
          for (const seg of arcToCubics(cx, cy, rx, ry, rot, !!large, !!sweep, x, y)) out.push(seg);
          cx = x; cy = y; prevCmd = 'A'; continue;
        }
      }
      prevCmd = up;
    }
  } catch (e) {
    if (e instanceof PathParseError) return { segments: out, error: e.message };
    throw e;
  }
  return { segments: out };
}

/** SVG arc (endpoint parameterisation) -> cubic Béziers, per SVG 1.1 implementation notes F.6. */
export function arcToCubics(x1: number, y1: number, rx: number, ry: number, rotDeg: number, large: boolean, sweep: boolean, x2: number, y2: number): Segment[] {
  if (x1 === x2 && y1 === y2) return [];
  rx = Math.abs(rx); ry = Math.abs(ry);
  if (rx === 0 || ry === 0) return [{ t: 'L', x: x2, y: y2 }];
  const phi = (rotDeg * Math.PI) / 180, cp = Math.cos(phi), sp = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
  const x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; }
  const rx2 = rx * rx, ry2 = ry * ry;
  const num = rx2 * ry2 - rx2 * y1p * y1p - ry2 * x1p * x1p;
  const den = rx2 * y1p * y1p + ry2 * x1p * x1p;
  let k = den === 0 ? 0 : Math.sqrt(Math.max(0, num / den));
  if (large === sweep) k = -k;
  const cxp = (k * rx * y1p) / ry, cyp = (-k * ry * x1p) / rx;
  const cx = cp * cxp - sp * cyp + (x1 + x2) / 2, cy = sp * cxp + cp * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dth > 0) dth -= 2 * Math.PI;
  else if (sweep && dth < 0) dth += 2 * Math.PI;
  const n = Math.max(1, Math.ceil(Math.abs(dth) / (Math.PI / 2) - 1e-9));
  const step = dth / n;
  const t = (4 / 3) * Math.tan(step / 4);
  const segs: Segment[] = [];
  let a = th1;
  const pt = (ang_: number) => ({ c: Math.cos(ang_), s: Math.sin(ang_) });
  for (let i = 0; i < n; i++) {
    const b = a + step;
    const A = pt(a), B = pt(b);
    // points on unit circle, then scale/rotate/translate
    const map = (ux: number, uy: number) => ({
      x: cp * rx * ux - sp * ry * uy + cx,
      y: sp * rx * ux + cp * ry * uy + cy,
    });
    const p1 = map(A.c - t * A.s, A.s + t * A.c);
    const p2 = map(B.c + t * B.s, B.s - t * B.c);
    const e = i === n - 1 ? { x: x2, y: y2 } : map(B.c, B.s); // snap the endpoint exactly
    segs.push({ t: 'C', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, x: e.x, y: e.y });
    a = b;
  }
  return segs;
}

