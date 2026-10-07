import type { FillRule, NodeKind, VNode, Vec, VectorDocument, VectorPath } from './types';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, w: string): number => { if (typeof v !== 'number' || !Number.isFinite(v)) throw new TypeError(`${w} must be a finite number`); return v; };
const str = (v: unknown, w: string): string => { if (typeof v !== 'string' || !v) throw new TypeError(`${w} must be a non-empty string`); return v; };
const vec = (v: unknown, w: string): Vec => { if (!isObj(v)) throw new TypeError(`${w} must be {x,y}`); return { x: num(v.x, `${w}.x`), y: num(v.y, `${w}.y`) }; };

// ---------- JSON ----------
export function pathFromJSON(v: unknown, w = 'path'): VectorPath {
  if (!isObj(v) || !Array.isArray(v.nodes)) throw new TypeError(`${w} must have nodes[]`);
  const ids = new Set<string>();
  const nodes: VNode[] = v.nodes.map((n, i) => {
    const ww = `${w}.nodes[${i}]`;
    if (!isObj(n)) throw new TypeError(`${ww} must be an object`);
    const id = str(n.id, `${ww}.id`); if (ids.has(id)) throw new TypeError(`duplicate node id ${id}`); ids.add(id);
    const kind = n.kind === undefined ? 'corner' : n.kind;
    if (kind !== 'corner' && kind !== 'smooth') throw new TypeError(`${ww}.kind invalid`);
    const o: VNode = { id, x: num(n.x, `${ww}.x`), y: num(n.y, `${ww}.y`), kind: kind as NodeKind };
    if (n.in != null) o.in = vec(n.in, `${ww}.in`);
    if (n.out != null) o.out = vec(n.out, `${ww}.out`);
    return o;
  });
  const out: VectorPath = { id: str(v.id, `${w}.id`), closed: v.closed === true, nodes };
  if (v.fill !== undefined) out.fill = v.fill === null ? null : str(v.fill, `${w}.fill`);
  if (v.stroke !== undefined) out.stroke = v.stroke === null ? null : str(v.stroke, `${w}.stroke`);
  if (v.strokeWidth !== undefined) { out.strokeWidth = num(v.strokeWidth, `${w}.strokeWidth`); if (out.strokeWidth < 0) throw new RangeError(`${w}.strokeWidth must be >= 0`); }
  if (v.fillRule !== undefined) { if (v.fillRule !== 'nonzero' && v.fillRule !== 'evenodd') throw new TypeError(`${w}.fillRule invalid`); out.fillRule = v.fillRule as FillRule; }
  return out;
}
export function documentFromJSON(v: unknown): VectorDocument {
  if (!isObj(v) || !Array.isArray(v.paths)) throw new TypeError('not a vector document');
  const width = num(v.width, 'width'), height = num(v.height, 'height');
  if (width <= 0 || height <= 0) throw new RangeError('width/height must be > 0');
  const paths = v.paths.map((p, i) => pathFromJSON(p, `paths[${i}]`));
  if (new Set(paths.map((p) => p.id)).size !== paths.length) throw new TypeError('duplicate path ids');
  return { width, height, paths };
}
export const documentToJSON = (d: VectorDocument): string => JSON.stringify(d);
export const documentFromString = (s: string): VectorDocument => documentFromJSON(JSON.parse(s));

// ---------- Canonical SVG path data: absolute M/L/C/Z only, max 3 decimals, no -0 ----------
export function fmt(n: number): string {
  if (!Number.isFinite(n)) throw new RangeError('non-finite coordinate');
  const s = (Math.round(n * 1000) / 1000).toFixed(3).replace(/\.?0+$/, '');
  return s === '-0' || s === '' ? '0' : s;
}
const pt = (x: number, y: number) => `${fmt(x)} ${fmt(y)}`;

export function serializePath(p: VectorPath): string {
  const n = p.nodes;
  if (n.length === 0) return '';
  const parts = [`M${pt(n[0].x, n[0].y)}`];
  const seg = (a: VNode, b: VNode) => (a.out || b.in)
    ? `C${pt((a.out ?? a).x, (a.out ?? a).y)} ${pt((b.in ?? b).x, (b.in ?? b).y)} ${pt(b.x, b.y)}`
    : `L${pt(b.x, b.y)}`;
  for (let i = 0; i + 1 < n.length; i++) parts.push(seg(n[i], n[i + 1]));
  if (p.closed && n.length > 1) {
    const a = n[n.length - 1], b = n[0];
    if (a.out || b.in) parts.push(seg(a, b)); // straight closing edge is implied by Z
    parts.push('Z');
  } else if (p.closed) parts.push('Z');
  return parts.join('');
}

const TOKEN = /([MLCZ])|(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)/g;
/** Parses absolute uppercase M/L/C/Z (single contour) path data into a path. Node ids are `${idPrefix}${index}`. */
export function parsePath(d: string, id = 'path', idPrefix = 'n'): VectorPath {
  const toks: (string | number)[] = [];
  let last = 0, m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(d))) {
    if (/[^\s,]/.test(d.slice(last, m.index))) throw new SyntaxError(`unsupported path data near "${d.slice(last, m.index).trim()}" (only absolute M/L/C/Z)`);
    toks.push(m[1] ? m[1] : Number(m[2])); last = TOKEN.lastIndex;
  }
  if (/[^\s,]/.test(d.slice(last))) throw new SyntaxError('unsupported path data (only absolute M/L/C/Z)');
  const nodes: VNode[] = []; let closed = false, i = 0, started = false;
  const nextNum = (): number => { const t = toks[i++]; if (typeof t !== 'number') throw new SyntaxError('expected number'); return t; };
  const mk = (x: number, y: number): VNode => ({ id: `${idPrefix}${nodes.length}`, x, y, kind: 'corner' });
  while (i < toks.length) {
    const cmd = toks[i++];
    if (cmd === 'M') { if (started) throw new SyntaxError('multiple subpaths are not supported'); started = true; nodes.push(mk(nextNum(), nextNum())); }
    else if (!started) throw new SyntaxError('path must start with M');
    else if (cmd === 'L') { while (typeof toks[i] === 'number') nodes.push(mk(nextNum(), nextNum())); }
    else if (cmd === 'C') {
      while (typeof toks[i] === 'number') {
        const c1 = { x: nextNum(), y: nextNum() }, c2 = { x: nextNum(), y: nextNum() }, x = nextNum(), y = nextNum();
        nodes[nodes.length - 1].out = c1;
        const nn = mk(x, y); nn.in = c2; nodes.push(nn);
      }
    } else if (cmd === 'Z') { closed = true; }
    else throw new SyntaxError('unexpected token');
  }
  if (closed && nodes.length > 1) {
    const f = nodes[0], l = nodes[nodes.length - 1];
    if (l.x === f.x && l.y === f.y) { if (l.in) f.in = l.in; nodes.pop(); }
  }
  for (const n of nodes) if (n.in && n.out) {
    const a = { x: n.x - n.in.x, y: n.y - n.in.y }, b = { x: n.out.x - n.x, y: n.out.y - n.y };
    const cross = a.x * b.y - a.y * b.x, dot = a.x * b.x + a.y * b.y;
    if (dot > 0 && Math.abs(cross) <= 1e-3 * Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y)) n.kind = 'smooth';
  }
  return { id, closed, nodes };
}
