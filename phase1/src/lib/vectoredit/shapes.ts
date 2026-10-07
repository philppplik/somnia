import type { LineCap, LineJoin, PathCommand, Shape, ShapeKind, Stroke, Style } from './types';

const KAPPA = 0.5522847498307936;
export const MAX_COORD = 1_000_000;
export const MAX_POLYGON_SIDES = 128;
export const MAX_PATH_COMMANDS = 100_000;

function num(v: unknown, name: string, min = -MAX_COORD, max = MAX_COORD): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new TypeError(`${name} must be a finite number`);
  if (v < min || v > max) throw new RangeError(`${name} must be between ${min} and ${max}`);
  return v;
}
function opt(v: unknown, name: string, fallback: number, min?: number, max?: number): number {
  return v === undefined ? fallback : num(v, name, min, max);
}

export function defaultShape(kind: ShapeKind): Shape {
  switch (kind) {
    case 'rect': return { kind, x: 0, y: 0, width: 100, height: 100, rx: 0 };
    case 'ellipse': return { kind, cx: 50, cy: 50, rx: 50, ry: 50 };
    case 'polygon': return { kind, cx: 50, cy: 50, radius: 50, sides: 5, rotation: 0 };
    case 'line': return { kind, x1: 0, y1: 0, x2: 100, y2: 0 };
    case 'path': return { kind, commands: [['M', 0, 0], ['L', 100, 0]] };
  }
}

/** Validates and fills defaults. Throws on anything that is not a well-formed shape. Output is a fresh plain object. */
export function normalizeShape(input: unknown): Shape {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Shape must be an object');
  const s = input as Record<string, unknown>;
  switch (s.kind) {
    case 'rect': {
      const width = num(s.width, 'width', 0), height = num(s.height, 'height', 0);
      const rx = opt(s.rx, 'rx', 0, 0);
      return { kind: 'rect', x: num(s.x, 'x'), y: num(s.y, 'y'), width, height, rx: Math.min(rx, width / 2, height / 2) };
    }
    case 'ellipse': return { kind: 'ellipse', cx: num(s.cx, 'cx'), cy: num(s.cy, 'cy'), rx: num(s.rx, 'rx', 0), ry: num(s.ry, 'ry', 0) };
    case 'polygon': {
      const sides = num(s.sides, 'sides', 3, MAX_POLYGON_SIDES);
      if (!Number.isInteger(sides)) throw new RangeError('sides must be an integer');
      return { kind: 'polygon', cx: num(s.cx, 'cx'), cy: num(s.cy, 'cy'), radius: num(s.radius, 'radius', 0), sides, rotation: opt(s.rotation, 'rotation', 0, -360, 360) };
    }
    case 'line': return { kind: 'line', x1: num(s.x1, 'x1'), y1: num(s.y1, 'y1'), x2: num(s.x2, 'x2'), y2: num(s.y2, 'y2') };
    case 'path': {
      if (!Array.isArray(s.commands) || s.commands.length === 0 || s.commands.length > MAX_PATH_COMMANDS) throw new RangeError('path needs 1..' + MAX_PATH_COMMANDS + ' commands');
      const commands = s.commands.map((c): PathCommand => {
        if (!Array.isArray(c)) throw new TypeError('Path command must be an array');
        const arity: Record<string, number> = { M: 2, L: 2, C: 6, Z: 0 };
        const op = c[0];
        if (typeof op !== 'string' || !(op in arity)) throw new TypeError('Unknown path command');
        if (c.length !== arity[op] + 1) throw new TypeError(`Path command ${op} needs ${arity[op]} numbers`);
        return [op, ...c.slice(1).map((n, i) => num(n, `${op}[${i}]`))] as unknown as PathCommand;
      });
      if (commands[0][0] !== 'M') throw new TypeError('Path must start with M');
      return { kind: 'path', commands };
    }
    default: throw new TypeError('Unknown shape kind');
  }
}

export function polygonPoints(s: Extract<Shape, { kind: 'polygon' }>): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < s.sides; i++) {
    // First vertex points up (-90 degrees), then clockwise in screen space.
    const a = ((s.rotation - 90) * Math.PI) / 180 + (2 * Math.PI * i) / s.sides;
    out.push([round(s.cx + s.radius * Math.cos(a)), round(s.cy + s.radius * Math.sin(a))]);
  }
  return out;
}
const round = (n: number) => Math.round(n * 1e6) / 1e6;

/** Lossless conversion to path commands. Rounded rects and ellipses use the 4-segment cubic approximation. */
export function shapeToPath(shape: Shape): Extract<Shape, { kind: 'path' }> {
  const s = normalizeShape(shape);
  const cmds: PathCommand[] = [];
  switch (s.kind) {
    case 'path': return s;
    case 'line': cmds.push(['M', s.x1, s.y1], ['L', s.x2, s.y2]); break;
    case 'polygon': polygonPoints(s).forEach(([x, y], i) => cmds.push([i === 0 ? 'M' : 'L', x, y] as PathCommand)); cmds.push(['Z']); break;
    case 'ellipse': {
      const { cx, cy, rx, ry } = s, kx = rx * KAPPA, ky = ry * KAPPA;
      cmds.push(['M', cx + rx, cy],
        ['C', cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry],
        ['C', cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy],
        ['C', cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry],
        ['C', cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy], ['Z']);
      break;
    }
    case 'rect': {
      const { x, y, width: w, height: h, rx: r } = s;
      if (r === 0) { cmds.push(['M', x, y], ['L', x + w, y], ['L', x + w, y + h], ['L', x, y + h], ['Z']); break; }
      const k = r * KAPPA;
      cmds.push(['M', x + r, y], ['L', x + w - r, y], ['C', x + w - r + k, y, x + w, y + r - k, x + w, y + r],
        ['L', x + w, y + h - r], ['C', x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h],
        ['L', x + r, y + h], ['C', x + r - k, y + h, x, y + h - r + k, x, y + h - r],
        ['L', x, y + r], ['C', x, y + r - k, x + r - k, y, x + r, y], ['Z']);
    }
  }
  return { kind: 'path', commands: cmds };
}

export function pathData(commands: readonly PathCommand[]): string {
  return commands.map((c) => c.map((p) => (typeof p === 'number' ? String(round(p)) : p)).join(' ')).join(' ');
}
/** SVG markup for a single shape element, without style attributes. */
export function shapeToSvgElement(shape: Shape, attrs = ''): string {
  const s = normalizeShape(shape), a = attrs ? ' ' + attrs : '';
  switch (s.kind) {
    case 'rect': return `<rect x="${s.x}" y="${s.y}" width="${s.width}" height="${s.height}"${s.rx ? ` rx="${s.rx}"` : ''}${a}/>`;
    case 'ellipse': return `<ellipse cx="${s.cx}" cy="${s.cy}" rx="${s.rx}" ry="${s.ry}"${a}/>`;
    case 'polygon': return `<polygon points="${polygonPoints(s).map((p) => p.join(',')).join(' ')}"${a}/>`;
    case 'line': return `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}"${a}/>`;
    case 'path': return `<path d="${pathData(s.commands)}"${a}/>`;
  }
}

export const DEFAULT_STROKE: Stroke = { color: '#000000', width: 1, cap: 'butt', join: 'miter', dash: [] };
export const DEFAULT_STYLE: Style = { fill: { color: '#d9d9d9' }, stroke: DEFAULT_STROKE, opacity: 1 };
const CAPS: readonly LineCap[] = ['butt', 'round', 'square'];
const JOINS: readonly LineJoin[] = ['miter', 'round', 'bevel'];
const COLOR = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
function color(v: unknown, name: string, fallback: string | null): string | null {
  if (v === undefined) return fallback;
  if (v === null) return null;
  if (typeof v !== 'string' || !COLOR.test(v)) throw new TypeError(`${name} must be null or a #hex color`);
  return v.toLowerCase();
}
/** Validate a (possibly partial) style on top of a base. Unknown keys are dropped. */
export function normalizeStyle(input: unknown, base: Style = DEFAULT_STYLE): Style {
  const s = (input ?? {}) as Record<string, any>;
  if (typeof s !== 'object' || Array.isArray(s)) throw new TypeError('Style must be an object');
  const f = s.fill ?? {}, st = s.stroke ?? {};
  const cap = st.cap ?? base.stroke.cap, join = st.join ?? base.stroke.join;
  if (!CAPS.includes(cap)) throw new TypeError('Invalid stroke cap');
  if (!JOINS.includes(join)) throw new TypeError('Invalid stroke join');
  const dash = st.dash ?? base.stroke.dash;
  if (!Array.isArray(dash) || dash.length > 16) throw new TypeError('dash must be an array of at most 16 numbers');
  const dashes = dash.map((d: unknown, i: number) => num(d, `dash[${i}]`, 0, MAX_COORD));
  if (dashes.length > 0 && dashes.every((d: number) => d === 0)) throw new RangeError('dash needs at least one value above 0');
  return {
    fill: { color: color(f.color, 'fill.color', base.fill.color) },
    stroke: { color: color(st.color, 'stroke.color', base.stroke.color), width: opt(st.width, 'stroke.width', base.stroke.width, 0, 10_000), cap, join, dash: dashes },
    opacity: opt(s.opacity, 'opacity', base.opacity, 0, 1),
  };
}
/** Style attributes for SVG output. */
export function styleToSvgAttrs(style: Style): string {
  const { fill, stroke, opacity } = style;
  const parts = [`fill="${fill.color ?? 'none'}"`, `stroke="${stroke.color && stroke.width > 0 ? stroke.color : 'none'}"`];
  if (stroke.color && stroke.width > 0) {
    parts.push(`stroke-width="${stroke.width}"`);
    if (stroke.cap !== 'butt') parts.push(`stroke-linecap="${stroke.cap}"`);
    if (stroke.join !== 'miter') parts.push(`stroke-linejoin="${stroke.join}"`);
    if (stroke.dash.length) parts.push(`stroke-dasharray="${stroke.dash.join(' ')}"`);
  }
  if (opacity !== 1) parts.push(`opacity="${opacity}"`);
  return parts.join(' ');
}
