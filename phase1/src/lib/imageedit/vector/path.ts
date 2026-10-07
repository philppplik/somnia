import type { Matrix, NodeKind, PathSegment, ShapeNode } from './types';

export const MAX_COORD = 1_000_000;
export const MAX_POLYGON_SIDES = 128;
export const MAX_SEGMENTS_PER_PATH = 100_000;
const KAPPA = 0.5522847498307936;

export function num(v: unknown, name: string, min = -MAX_COORD, max = MAX_COORD): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new TypeError(`${name} must be a finite number`);
  if (v < min || v > max) throw new RangeError(`${name} must be between ${min} and ${max}`);
  return v;
}
export function matrix(v: unknown, name = 'matrix'): Matrix {
  if (!Array.isArray(v) || v.length !== 6) throw new TypeError(`${name} must have 6 numbers`);
  return Object.freeze(v.map((n, i) => num(n, `${name}[${i}]`))) as unknown as Matrix;
}
function obj(v: unknown, name: string): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new TypeError(`${name} must be an object`);
  return v as Record<string, unknown>;
}
function exact(o: Record<string, unknown>, keys: readonly string[], name: string) {
  for (const k of Object.keys(o)) if (!keys.includes(k)) throw new TypeError(`${name} has unknown key: ${k}`);
}
function flag(v: unknown, name: string): boolean { if (typeof v !== 'boolean') throw new TypeError(`${name} must be a boolean`); return v; }

export function validateSegments(input: unknown): readonly PathSegment[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_SEGMENTS_PER_PATH) throw new RangeError(`path needs 1..${MAX_SEGMENTS_PER_PATH} segments`);
  let drawing = false;
  const out = input.map((raw, i): PathSegment => {
    const s = obj(raw, `segments[${i}]`), n = (k: string) => num(s[k], `segments[${i}].${k}`);
    switch (s.kind) {
      case 'M': exact(s, ['kind', 'x', 'y'], 'M'); drawing = true; return Object.freeze({ kind: 'M', x: n('x'), y: n('y') });
      case 'L': exact(s, ['kind', 'x', 'y'], 'L'); if (!drawing) throw new TypeError('Path needs a move (M) first'); return Object.freeze({ kind: 'L', x: n('x'), y: n('y') });
      case 'C': exact(s, ['kind', 'x1', 'y1', 'x2', 'y2', 'x', 'y'], 'C'); if (!drawing) throw new TypeError('Path needs a move (M) first');
        return Object.freeze({ kind: 'C', x1: n('x1'), y1: n('y1'), x2: n('x2'), y2: n('y2'), x: n('x'), y: n('y') });
      case 'Q': exact(s, ['kind', 'x1', 'y1', 'x', 'y'], 'Q'); if (!drawing) throw new TypeError('Path needs a move (M) first');
        return Object.freeze({ kind: 'Q', x1: n('x1'), y1: n('y1'), x: n('x'), y: n('y') });
      case 'A': exact(s, ['kind', 'rx', 'ry', 'rotation', 'largeArc', 'sweep', 'x', 'y'], 'A'); if (!drawing) throw new TypeError('Path needs a move (M) first');
        return Object.freeze({ kind: 'A', rx: num(s.rx, 'rx', 0), ry: num(s.ry, 'ry', 0), rotation: num(s.rotation, 'rotation', -360, 360), largeArc: flag(s.largeArc, 'largeArc'), sweep: flag(s.sweep, 'sweep'), x: n('x'), y: n('y') });
      case 'Z': exact(s, ['kind'], 'Z'); if (!drawing) throw new TypeError('Path needs a move (M) first'); return Object.freeze({ kind: 'Z' });
      default: throw new TypeError('Unknown path segment kind');
    }
  });
  if (out[0].kind !== 'M') throw new TypeError('Path must start with M');
  return Object.freeze(out);
}

/** Geometry fields per node kind, validated. Style, transform and common fields are handled elsewhere. */
export const GEOMETRY_KEYS: Record<Exclude<NodeKind, 'group'>, readonly string[]> = {
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry'], ellipse: ['cx', 'cy', 'rx', 'ry'], polygon: ['cx', 'cy', 'radius', 'sides', 'rotation'],
  line: ['x1', 'y1', 'x2', 'y2'], path: ['segments'],
};
export type Geometry = { readonly kind: Exclude<NodeKind, 'group'> } & Record<string, unknown>;
export function validateGeometry(input: unknown): Geometry {
  const g = obj(input, 'geometry');
  const kind = g.kind as keyof typeof GEOMETRY_KEYS;
  if (typeof kind !== 'string' || !Object.hasOwn(GEOMETRY_KEYS, kind)) throw new TypeError('Unknown geometry kind');
  exact(g, ['kind', ...GEOMETRY_KEYS[kind]], 'geometry');
  switch (kind) {
    case 'rect': {
      const width = num(g.width, 'width', 0), height = num(g.height, 'height', 0);
      const rx = g.rx === undefined ? 0 : num(g.rx, 'rx', 0), ry = g.ry === undefined ? rx : num(g.ry, 'ry', 0);
      return { kind, x: num(g.x, 'x'), y: num(g.y, 'y'), width, height, rx: Math.min(rx, width / 2), ry: Math.min(ry, height / 2) };
    }
    case 'ellipse': return { kind, cx: num(g.cx, 'cx'), cy: num(g.cy, 'cy'), rx: num(g.rx, 'rx', 0), ry: num(g.ry, 'ry', 0) };
    case 'polygon': {
      const sides = num(g.sides, 'sides', 3, MAX_POLYGON_SIDES);
      if (!Number.isInteger(sides)) throw new RangeError('sides must be an integer');
      return { kind, cx: num(g.cx, 'cx'), cy: num(g.cy, 'cy'), radius: num(g.radius, 'radius', 0), sides, rotation: g.rotation === undefined ? 0 : num(g.rotation, 'rotation', -360, 360) };
    }
    case 'line': return { kind, x1: num(g.x1, 'x1'), y1: num(g.y1, 'y1'), x2: num(g.x2, 'x2'), y2: num(g.y2, 'y2') };
    case 'path': return { kind, segments: validateSegments(g.segments) };
  }
}
export function defaultGeometry(kind: Exclude<NodeKind, 'group'>): Geometry {
  switch (kind) {
    case 'rect': return { kind, x: 0, y: 0, width: 100, height: 100, rx: 0, ry: 0 };
    case 'ellipse': return { kind, cx: 50, cy: 50, rx: 50, ry: 50 };
    case 'polygon': return { kind, cx: 50, cy: 50, radius: 50, sides: 5, rotation: 0 };
    case 'line': return { kind, x1: 0, y1: 0, x2: 100, y2: 0 };
    case 'path': return { kind, segments: [{ kind: 'M', x: 0, y: 0 }, { kind: 'L', x: 100, y: 0 }] };
  }
}
export function geometryOf(node: ShapeNode): Geometry {
  const { kind } = node;
  return Object.fromEntries([['kind', kind], ...GEOMETRY_KEYS[kind].map((k) => [k, (node as unknown as Record<string, unknown>)[k]])]) as Geometry;
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;
export function polygonPoints(s: { cx: number; cy: number; radius: number; sides: number; rotation: number }): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < s.sides; i++) {
    // First vertex points up (-90 degrees), then clockwise in screen space.
    const a = ((s.rotation - 90) * Math.PI) / 180 + (2 * Math.PI * i) / s.sides;
    out.push([round(s.cx + s.radius * Math.cos(a)), round(s.cy + s.radius * Math.sin(a))]);
  }
  return out;
}
const M = (x: number, y: number): PathSegment => ({ kind: 'M', x, y });
const L = (x: number, y: number): PathSegment => ({ kind: 'L', x, y });
const C = (x1: number, y1: number, x2: number, y2: number, x: number, y: number): PathSegment => ({ kind: 'C', x1, y1, x2, y2, x, y });
const Z: PathSegment = { kind: 'Z' };

/** Canonical absolute segments for any shape. Rounded rects and ellipses use the 4-segment cubic approximation. */
export function geometryToSegments(input: unknown): readonly PathSegment[] {
  const s = validateGeometry(input) as any;
  switch (s.kind) {
    case 'path': return s.segments;
    case 'line': return [M(s.x1, s.y1), L(s.x2, s.y2)];
    case 'polygon': return [...polygonPoints(s).map(([x, y], i) => (i === 0 ? M(x, y) : L(x, y))), Z];
    case 'ellipse': {
      const { cx, cy, rx, ry } = s, kx = rx * KAPPA, ky = ry * KAPPA;
      return [M(cx + rx, cy), C(cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry), C(cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy),
        C(cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry), C(cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy), Z];
    }
    case 'rect': {
      const { x, y, width: w, height: h, rx, ry } = s;
      if (rx === 0 || ry === 0) return [M(x, y), L(x + w, y), L(x + w, y + h), L(x, y + h), Z];
      const kx = rx * KAPPA, ky = ry * KAPPA;
      return [M(x + rx, y), L(x + w - rx, y), C(x + w - rx + kx, y, x + w, y + ry - ky, x + w, y + ry), L(x + w, y + h - ry),
        C(x + w, y + h - ry + ky, x + w - rx + kx, y + h, x + w - rx, y + h), L(x + rx, y + h),
        C(x + rx - kx, y + h, x, y + h - ry + ky, x, y + h - ry), L(x, y + ry), C(x, y + ry - ky, x + rx - kx, y, x + rx, y), Z];
    }
  }
  throw new TypeError('Unknown geometry kind');
}

export function segmentsToData(segments: readonly PathSegment[]): string {
  return segments.map((s) => {
    switch (s.kind) {
      case 'M': case 'L': return `${s.kind} ${round(s.x)} ${round(s.y)}`;
      case 'C': return `C ${[s.x1, s.y1, s.x2, s.y2, s.x, s.y].map(round).join(' ')}`;
      case 'Q': return `Q ${[s.x1, s.y1, s.x, s.y].map(round).join(' ')}`;
      case 'A': return `A ${round(s.rx)} ${round(s.ry)} ${round(s.rotation)} ${s.largeArc ? 1 : 0} ${s.sweep ? 1 : 0} ${round(s.x)} ${round(s.y)}`;
      case 'Z': return 'Z';
    }
  }).join(' ');
}
