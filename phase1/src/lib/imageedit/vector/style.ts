import type { Paint, ShapeStyle } from './types';
import { num } from './path';

export const BLACK: Paint = Object.freeze({ kind: 'solid', rgba: Object.freeze([0, 0, 0, 1]) as unknown as [number, number, number, number] });
export const NO_PAINT: Paint = Object.freeze({ kind: 'none' });
export const DEFAULT_SHAPE_STYLE: ShapeStyle = Object.freeze({
  fill: Object.freeze({ kind: 'solid', rgba: Object.freeze([217, 217, 217, 1]) }) as unknown as Paint, stroke: BLACK, strokeWidth: 1, fillRule: 'nonzero',
  lineCap: 'butt', lineJoin: 'miter', miterLimit: 4, dash: Object.freeze([]) as readonly number[], dashOffset: 0,
});
const STYLE_KEYS = ['fill', 'stroke', 'strokeWidth', 'fillRule', 'lineCap', 'lineJoin', 'miterLimit', 'dash', 'dashOffset'] as const;
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** Convenience for UI/tests: '#rrggbb[aa]' or '#rgb[a]' to a solid paint. */
export function solid(hex: string): Paint {
  if (!HEX.test(hex)) throw new TypeError('Expected a #hex color');
  let h = hex.slice(1);
  if (h.length <= 4) h = [...h].map((c) => c + c).join('');
  const b = [0, 2, 4, 6].map((i) => (i < h.length ? parseInt(h.slice(i, i + 2), 16) : 255));
  return { kind: 'solid', rgba: [b[0], b[1], b[2], Math.round((b[3] / 255) * 1000) / 1000] };
}
export function paint(v: unknown, name: string): Paint {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new TypeError(`${name} must be a paint object`);
  const p = v as Record<string, unknown>;
  if (p.kind === 'none') { if (Object.keys(p).length !== 1) throw new TypeError(`${name} has unknown keys`); return NO_PAINT; }
  if (p.kind !== 'solid' || Object.keys(p).some((k) => k !== 'kind' && k !== 'rgba')) throw new TypeError(`${name} must be none or solid`);
  const c = p.rgba;
  if (!Array.isArray(c) || c.length !== 4) throw new TypeError(`${name}.rgba must have 4 numbers`);
  return Object.freeze({ kind: 'solid', rgba: Object.freeze([num(c[0], 'r', 0, 255), num(c[1], 'g', 0, 255), num(c[2], 'b', 0, 255), num(c[3], 'a', 0, 1)]) as unknown as [number, number, number, number] });
}
function pick<T extends string>(v: unknown, allowed: readonly T[], name: string): T {
  if (!allowed.includes(v as T)) throw new TypeError(`Invalid ${name}`);
  return v as T;
}
function one<K extends typeof STYLE_KEYS[number]>(key: K, v: unknown): ShapeStyle[K] {
  switch (key) {
    case 'fill': case 'stroke': return paint(v, key) as ShapeStyle[K];
    case 'strokeWidth': return num(v, key, 0, 10_000) as ShapeStyle[K];
    case 'fillRule': return pick(v, ['nonzero', 'evenodd'], key) as ShapeStyle[K];
    case 'lineCap': return pick(v, ['butt', 'round', 'square'], key) as ShapeStyle[K];
    case 'lineJoin': return pick(v, ['miter', 'round', 'bevel'], key) as ShapeStyle[K];
    case 'miterLimit': return num(v, key, 1, 1000) as ShapeStyle[K];
    case 'dashOffset': return num(v, key) as ShapeStyle[K];
    case 'dash': {
      if (!Array.isArray(v) || v.length > 16) throw new TypeError('dash must be an array of at most 16 numbers');
      const d = v.map((x, i) => num(x, `dash[${i}]`, 0, 1_000_000));
      if (d.length > 0 && d.every((x) => x === 0)) throw new RangeError('dash needs at least one value above 0');
      return Object.freeze(d) as ShapeStyle[K];
    }
  }
}
/** Partial style: only defined keys allowed, unknown keys rejected, no empty patch. */
export function validateStylePatch(input: unknown): Partial<ShapeStyle> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('style patch must be an object');
  const o = input as Record<string, unknown>, out: Record<string, unknown> = {};
  for (const k of Object.keys(o)) {
    if (!(STYLE_KEYS as readonly string[]).includes(k)) throw new TypeError(`Unknown style key: ${k}`);
    out[k] = one(k as typeof STYLE_KEYS[number], o[k]);
  }
  if (Object.keys(out).length === 0) throw new TypeError('style patch is empty');
  return out as Partial<ShapeStyle>;
}
/** Full style: every key required (canonical styles are explicit). */
export function validateStyle(input: unknown): ShapeStyle {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  for (const k of STYLE_KEYS) if (!(k in o)) throw new TypeError(`style.${k} is required`);
  return Object.freeze(validateStylePatch(o)) as ShapeStyle;
}
export const mergeStyle = (base: ShapeStyle, patch: Partial<ShapeStyle>): ShapeStyle => Object.freeze({ ...base, ...patch });
