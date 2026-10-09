import type {AlignKind, DesignNodePatch, DesignNodeView, DistributeAxis} from './panelContract';
/** Pure helpers behind the inspector. No React, no store. */

/** A value shared by every node, or `MIXED` when they differ (tolerance for float noise). */
export const MIXED = Symbol('mixed');
export function shared<T>(nodes: readonly DesignNodeView[], pick: (n: DesignNodeView) => T | undefined): T | typeof MIXED | undefined {
  if (!nodes.length) return undefined;
  const first = pick(nodes[0]);
  for (const n of nodes) {
    const v = pick(n);
    if (typeof v === 'number' && typeof first === 'number' ? Math.abs(v - first) > 1e-6 : v !== first) return MIXED;
  }
  return first;
}
export interface NumberRule {min?: number; max?: number; integer?: boolean}
export type Parsed = {ok: true; value: number} | {ok: false; reason: 'empty' | 'nan' | 'range'};
/** Strict numeric parse for inspector fields. Accepts a decimal comma; rejects units, NaN, Infinity. */
export function parseNumberField(input: string, rule: NumberRule = {}): Parsed {
  const s = input.trim().replace(',', '.');
  if (!s) return {ok: false, reason: 'empty'};
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return {ok: false, reason: 'nan'};
  let v = Number(s);
  if (!Number.isFinite(v)) return {ok: false, reason: 'nan'};
  if (rule.integer) v = Math.round(v);
  if ((rule.min !== undefined && v < rule.min) || (rule.max !== undefined && v > rule.max)) return {ok: false, reason: 'range'};
  return {ok: true, value: Math.round(v * 1000) / 1000};
}
/** `#abc`, `ABC`, `#AABBCC` to `#aabbcc`; null when invalid. */
export function normalizeHex(input: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
  return `#${h.toLowerCase()}`;
}
export const FIELD_RULES = {
  width: {min: 0.01}, height: {min: 0.01}, rotation: {min: -360, max: 360}, opacity: {min: 0, max: 100},
  radius: {min: 0}, strokeWidth: {min: 0}, fontSize: {min: 1, max: 1000}, x: {}, y: {},
} as const satisfies Record<string, NumberRule>;

const box = (n: DesignNodeView) => ({l: n.x, r: n.x + n.width, t: n.y, b: n.y + n.height, cx: n.x + n.width / 2, cy: n.y + n.height / 2});
/** Patches (per node id) that align the selection to its joint bounding box. Needs at least 2 nodes. */
export function alignPatches(nodes: readonly DesignNodeView[], kind: AlignKind): Map<string, DesignNodePatch> {
  const out = new Map<string, DesignNodePatch>();
  const free = nodes.filter(n => !n.locked);
  if (nodes.length < 2 || !free.length) return out;
  const bs = nodes.map(box);
  const L = Math.min(...bs.map(b => b.l)), R = Math.max(...bs.map(b => b.r)), T = Math.min(...bs.map(b => b.t)), B = Math.max(...bs.map(b => b.b));
  for (const n of free) {
    const p: DesignNodePatch = {};
    if (kind === 'left') p.x = L; else if (kind === 'right') p.x = R - n.width; else if (kind === 'centerH') p.x = (L + R) / 2 - n.width / 2;
    else if (kind === 'top') p.y = T; else if (kind === 'bottom') p.y = B - n.height; else p.y = (T + B) / 2 - n.height / 2;
    out.set(n.id, p);
  }
  return out;
}
/** Equal gaps between nodes along one axis; first and last stay put. Needs at least 3 nodes. */
export function distributePatches(nodes: readonly DesignNodeView[], axis: DistributeAxis): Map<string, DesignNodePatch> {
  const out = new Map<string, DesignNodePatch>();
  if (nodes.length < 3) return out;
  const h = axis === 'horizontal';
  const sorted = [...nodes].sort((a, b) => (h ? a.x - b.x : a.y - b.y));
  const size = (n: DesignNodeView) => (h ? n.width : n.height), pos = (n: DesignNodeView) => (h ? n.x : n.y);
  const first = sorted[0], last = sorted[sorted.length - 1];
  const span = pos(last) + size(last) - pos(first);
  const gap = (span - sorted.reduce((s, n) => s + size(n), 0)) / (sorted.length - 1);
  let cursor = pos(first) + size(first) + gap;
  for (const n of sorted.slice(1, -1)) {
    if (!n.locked) out.set(n.id, h ? {x: cursor} : {y: cursor});
    cursor += size(n) + gap;
  }
  return out;
}
