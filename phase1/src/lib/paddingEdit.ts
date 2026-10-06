/** Pure logic for the four-sided padding handles: drag maths, handle layout, unit safety and result verification. */
export type Side = 'top' | 'right' | 'bottom' | 'left';
export const SIDES: Side[] = ['top', 'right', 'bottom', 'left'];
export type Pad = Record<Side, number>;
export interface Mods { alt: boolean; shift: boolean }
export type DragMode = 'single' | 'pair' | 'all';
export const opposite = (s: Side): Side => s === 'top' ? 'bottom' : s === 'bottom' ? 'top' : s === 'left' ? 'right' : 'left';
export const fmt = (n: number): string => String(Number(n.toFixed(2)));

export function affectedSides(side: Side, mods: Mods): Side[] {
  if (mods.alt && mods.shift) return [...SIDES];
  if (mods.alt) return SIDES.filter(s => s === side || s === opposite(side));
  return [side];
}

/**
 * Padding values for a drag. `rawDelta` is the pointer movement in CSS px along the growing direction of `side`.
 * Everything is derived from the start values, so changing modifiers mid drag never drifts.
 * Alt applies the same delta to the opposite side, Alt+Shift to all four (asymmetry is kept), Shift alone snaps to 10 px.
 */
export function dragPadding(start: Pad, side: Side, rawDelta: number, mods: Mods): { values: Pad; delta: number; sides: Side[]; mode: DragMode } {
  const sides = affectedSides(side, mods);
  const step = mods.shift && !mods.alt ? 10 : 1;
  let delta = Math.round(rawDelta / step) * step;
  const floor = -Math.min(...sides.map(s => start[s]));
  if (delta < floor) delta = floor;
  const values = { ...start };
  for (const s of sides) values[s] = Math.max(0, start[s] + delta);
  if (delta === 0) return { values: { ...start }, delta: 0, sides, mode: sides.length === 4 ? 'all' : sides.length === 2 ? 'pair' : 'single' };
  return { values, delta, sides, mode: sides.length === 4 ? 'all' : sides.length === 2 ? 'pair' : 'single' };
}

/** Longhand declarations for the sides that really changed. Unchanged sides are never written. */
export function paddingProps(start: Pad, values: Pad): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of SIDES) if (Math.abs(values[s] - start[s]) > 0.001) out[`padding-${s}`] = `${fmt(values[s])}px`;
  return out;
}

export interface Box { x: number; y: number; w: number; h: number }
export interface HandleSpec { side: Side; cx: number; cy: number; w: number; h: number; hit: Box; leader?: { x1: number; y1: number; x2: number; y2: number } }
export type HandleMode = 'inner' | 'outside' | 'popover';
export const HANDLE_LONG = 14, HANDLE_SHORT = 4, HIT = 24, OUTSIDE_GAP = 8, SMALL_EDGE = 56, TINY_EDGE = 28;

const hitBox = (cx: number, cy: number): Box => ({ x: cx - HIT / 2, y: cy - HIT / 2, w: HIT, h: HIT });
const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const anyOverlap = (hs: HandleSpec[]) => hs.some((a, i) => hs.slice(i + 1).some(b => overlaps(a.hit, b.hit)));

/** All inputs in screen px (CSS px already multiplied by the effective scale). Hit areas are at least 24x24 and never overlap. */
export function layoutHandles(box: Box, pad: Pad, border: Pad): { mode: HandleMode; handles: HandleSpec[] } {
  const innerTop = box.y + border.top + pad.top, innerBottom = box.y + box.h - border.bottom - pad.bottom;
  const innerLeft = box.x + border.left + pad.left, innerRight = box.x + box.w - border.right - pad.right;
  const mx = box.x + box.w / 2, my = box.y + box.h / 2;
  const spec = (side: Side, cx: number, cy: number, leader?: HandleSpec['leader']): HandleSpec => {
    const vertical = side === 'left' || side === 'right';
    return { side, cx, cy, w: vertical ? HANDLE_SHORT : HANDLE_LONG, h: vertical ? HANDLE_LONG : HANDLE_SHORT, hit: hitBox(cx, cy), leader };
  };
  const edge = Math.min(box.w, box.h);
  if (edge < TINY_EDGE) return { mode: 'popover', handles: [] };
  if (edge >= SMALL_EDGE) {
    const inner = [spec('top', mx, innerTop), spec('right', innerRight, my), spec('bottom', mx, innerBottom), spec('left', innerLeft, my)];
    if (!anyOverlap(inner)) return { mode: 'inner', handles: inner };
  }
  const outside = [
    spec('top', mx, box.y - OUTSIDE_GAP, { x1: mx, y1: box.y - OUTSIDE_GAP, x2: mx, y2: innerTop }),
    spec('right', box.x + box.w + OUTSIDE_GAP, my, { x1: box.x + box.w + OUTSIDE_GAP, y1: my, x2: innerRight, y2: my }),
    spec('bottom', mx, box.y + box.h + OUTSIDE_GAP, { x1: mx, y1: box.y + box.h + OUTSIDE_GAP, x2: mx, y2: innerBottom }),
    spec('left', box.x - OUTSIDE_GAP, my, { x1: box.x - OUTSIDE_GAP, y1: my, x2: innerLeft, y2: my }),
  ];
  return anyOverlap(outside) ? { mode: 'popover', handles: [] } : { mode: 'outside', handles: outside };
}

/** Tinted padding areas (border excluded). Left/right strips sit between the top and bottom strips so nothing double-tints. */
export function paddingStrips(box: Box, pad: Pad, border: Pad): Record<Side, Box> {
  const x = box.x + border.left, w = Math.max(0, box.w - border.left - border.right);
  const innerY = box.y + border.top + pad.top, innerH = Math.max(0, box.h - border.top - border.bottom - pad.top - pad.bottom);
  return {
    top: { x, y: box.y + border.top, w, h: pad.top },
    bottom: { x, y: box.y + box.h - border.bottom - pad.bottom, w, h: pad.bottom },
    left: { x, y: innerY, w: pad.left, h: innerH },
    right: { x: box.x + box.w - border.right - pad.right, y: innerY, w: pad.right, h: innerH },
  };
}

/* ---------- unit safety: only plain px (or missing) declarations may be dragged ---------- */
const splitTop = (v: string): string[] | null => {
  if (/[()]/.test(v)) return null;
  return v.trim().split(/\s+/).filter(Boolean);
};
export const isPxSafe = (v: string): boolean => /^[+-]?(\d+\.?\d*|\.\d+)(px)?$/i.test(v.trim());
/** Sides whose declared value is not a plain px number (%, em, rem, calc, var, keywords). Conservative: any matching declaration counts. */
export function unsafeSides(decls: Array<[string, string]>): Set<Side> {
  const bad = new Set<Side>();
  for (const [prop, value] of decls) {
    const p = prop.trim().toLowerCase(), v = value.replace(/!important/i, '').trim();
    if (p === 'padding') {
      const t = splitTop(v);
      if (!t || !t.length || t.length > 4) { SIDES.forEach(s => bad.add(s)); continue; }
      const [a, b = a, c = a, d = b] = t;
      const by: Record<Side, string> = { top: a, right: b, bottom: c, left: d };
      for (const s of SIDES) if (!isPxSafe(by[s])) bad.add(s);
    } else {
      const m = p.match(/^padding-(top|right|bottom|left)$/);
      if (m && !isPxSafe(v)) bad.add(m[1] as Side);
    }
  }
  return bad;
}

/** Sides whose computed padding differs from what a commit asked for (tolerance in px). */
export function paddingMismatch(computed: Pad, expected: Partial<Pad>, tol = 0.5): Side[] {
  return SIDES.filter(s => expected[s] !== undefined && Math.abs(computed[s] - (expected[s] as number)) > tol);
}
