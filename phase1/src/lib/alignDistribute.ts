/**
 * Pure geometry for Align / Distribute and spacing guides.
 * No DOM, no store. Boxes are rectangles in the design iframe's coordinate space (CSS px).
 * Every function returns data; applying it to the document lives in alignApply.ts.
 */
export interface Box {id: string; x: number; y: number; w: number; h: number}
export interface Delta {id: string; dx: number; dy: number}
export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vmiddle' | 'bottom';
export type Axis = 'h' | 'v';

const EPS = 0.5;
const round = (n: number) => Math.round(n * 100) / 100;

export function unionBox(boxes: Box[]): {x: number; y: number; w: number; h: number} {
  const x1 = Math.min(...boxes.map(b => b.x)), y1 = Math.min(...boxes.map(b => b.y));
  const x2 = Math.max(...boxes.map(b => b.x + b.w)), y2 = Math.max(...boxes.map(b => b.y + b.h));
  return {x: x1, y: y1, w: x2 - x1, h: y2 - y1};
}

/** Align every box to the bounding box of the whole selection. Zero moves are dropped. */
export function alignDeltas(boxes: Box[], mode: AlignMode): Delta[] {
  if (boxes.length < 2) return [];
  const u = unionBox(boxes);
  const out: Delta[] = [];
  for (const b of boxes) {
    let dx = 0, dy = 0;
    if (mode === 'left') dx = u.x - b.x;
    else if (mode === 'right') dx = u.x + u.w - (b.x + b.w);
    else if (mode === 'hcenter') dx = u.x + u.w / 2 - (b.x + b.w / 2);
    else if (mode === 'top') dy = u.y - b.y;
    else if (mode === 'bottom') dy = u.y + u.h - (b.y + b.h);
    else dy = u.y + u.h / 2 - (b.y + b.h / 2);
    dx = round(dx); dy = round(dy);
    if (Math.abs(dx) >= EPS || Math.abs(dy) >= EPS) out.push({id: b.id, dx, dy});
  }
  return out;
}

/** Equal gaps between boxes along one axis. The two outermost boxes stay put. Needs three or more boxes. */
export function distributeDeltas(boxes: Box[], axis: Axis): Delta[] {
  if (boxes.length < 3) return [];
  const pos = (b: Box) => (axis === 'h' ? b.x : b.y);
  const size = (b: Box) => (axis === 'h' ? b.w : b.h);
  const sorted = [...boxes].sort((a, b) => pos(a) - pos(b));
  const first = sorted[0], last = sorted[sorted.length - 1];
  const span = pos(last) + size(last) - pos(first);
  const gap = (span - sorted.reduce((sum, b) => sum + size(b), 0)) / (sorted.length - 1);
  const out: Delta[] = [];
  let cursor = pos(first) + size(first) + gap;
  for (let i = 1; i < sorted.length - 1; i++) {
    const b = sorted[i];
    const d = round(cursor - pos(b));
    if (Math.abs(d) >= EPS) out.push(axis === 'h' ? {id: b.id, dx: d, dy: 0} : {id: b.id, dx: 0, dy: d});
    cursor += size(b) + gap;
  }
  return out;
}

export interface GapGuide {axis: Axis; /** start along the axis */ from: number; /** end along the axis */ to: number; /** position on the cross axis */ at: number; gap: number; /** true when every gap on this axis is equal */ equal: boolean}
export interface EdgeGuide {axis: 'x' | 'y'; pos: number}

/** Gaps between neighbouring selected boxes (only where they overlap on the cross axis). */
export function gapGuides(boxes: Box[]): GapGuide[] {
  const out: GapGuide[] = [];
  for (const axis of ['h', 'v'] as const) {
    const pos = (b: Box) => (axis === 'h' ? b.x : b.y);
    const size = (b: Box) => (axis === 'h' ? b.w : b.h);
    const cross = (b: Box) => (axis === 'h' ? b.y : b.x);
    const crossSize = (b: Box) => (axis === 'h' ? b.h : b.w);
    const sorted = [...boxes].sort((a, b) => pos(a) - pos(b));
    const found: GapGuide[] = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i], b = sorted[i + 1];
      const gap = pos(b) - (pos(a) + size(a));
      const lo = Math.max(cross(a), cross(b)), hi = Math.min(cross(a) + crossSize(a), cross(b) + crossSize(b));
      if (gap < EPS || hi - lo < 1) continue;
      found.push({axis, from: pos(a) + size(a), to: pos(b), at: (lo + hi) / 2, gap: round(gap), equal: false});
    }
    const equal = found.length > 1 && found.every(g => Math.abs(g.gap - found[0].gap) < EPS);
    out.push(...found.map(g => ({...g, equal})));
  }
  return out;
}

/** Lines where two or more boxes share an edge or a centre, shown so users can see what is aligned. */
export function edgeGuides(boxes: Box[]): EdgeGuide[] {
  if (boxes.length < 2) return [];
  const out: EdgeGuide[] = [];
  const add = (axis: 'x' | 'y', values: number[]) => {
    const used = new Set<number>();
    values.forEach((v, i) => {
      const key = Math.round(v);
      if (used.has(key)) return;
      if (values.some((o, j) => j !== i && Math.abs(o - v) < EPS)) { used.add(key); out.push({axis, pos: v}); }
    });
  };
  add('x', boxes.flatMap(b => [b.x, b.x + b.w / 2, b.x + b.w]));
  add('y', boxes.flatMap(b => [b.y, b.y + b.h / 2, b.y + b.h]));
  return out;
}

export interface PositionStyle {position: string; left: string; top: string}
const px = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

/**
 * CSS declarations that move an element by (dx, dy) from its current rendered place.
 * Absolute and fixed boxes get new left/top; relative and sticky boxes get shifted offsets;
 * static boxes become position:relative with offsets, so they keep their space in the flow.
 */
export function shiftStyle(cs: PositionStyle, dx: number, dy: number): Record<string, string> {
  const props: Record<string, string> = {};
  const pos = cs.position || 'static';
  const positioned = pos !== 'static';
  const abs = pos === 'absolute' || pos === 'fixed';
  if (!positioned) props.position = 'relative';
  if (Math.abs(dx) >= EPS) { props.left = `${Math.round(((positioned ? px(cs.left) : 0) + dx))}px`; if (abs) props.right = 'auto'; }
  if (Math.abs(dy) >= EPS) { props.top = `${Math.round(((positioned ? px(cs.top) : 0) + dy))}px`; if (abs) props.bottom = 'auto'; }
  return props;
}
