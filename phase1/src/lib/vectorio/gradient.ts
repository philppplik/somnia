import { fmt } from './matrix';
import { escapeAttr } from './xml';
import type { Gradient, GradientStop, Style, VectorDocument, VectorPath } from './types';
import { GRADIENT_LIMITS } from './types';

export const GRADIENT_ID = /^[A-Za-z][A-Za-z0-9_-]{0,39}$/;
/** `url(#id)` -> id, only for ids we would ever write. */
export const gradientIdOf = (fill: string | undefined): string | undefined => {
  const m = fill === undefined ? null : /^url\(#([A-Za-z][A-Za-z0-9_-]{0,39})\)$/.exec(fill.trim());
  return m ? m[1] : undefined;
};
export const gradientFill = (id: string): string => `url(#${id})`;
const r4 = (n: number): number => { const v = Math.round(n * 10000) / 10000; return Object.is(v, -0) ? 0 : v; };
const COLOR = /^(#[0-9a-f]{6}|#[0-9a-f]{8}|[a-z]{3,20})$/;

/** Stops: 1..16, offsets clamped to 0..1 and non-decreasing, colours plain, opacity 0..1. */
export function cleanStops(stops: readonly GradientStop[]): GradientStop[] {
  let last = 0;
  return stops.slice(0, GRADIENT_LIMITS.maxStops).map((s) => {
    const offset = r4(Math.min(1, Math.max(last, Number.isFinite(s.offset) ? s.offset : 0))); last = offset;
    return { offset, color: COLOR.test(s.color) ? s.color : '#000000', opacity: r4(Math.min(1, Math.max(0, Number.isFinite(s.opacity) ? s.opacity : 1))) };
  });
}

export function cleanGradient(g: Gradient): Gradient {
  const stops = cleanStops(g.stops);
  return g.kind === 'linear'
    ? { id: g.id, kind: 'linear', x1: r4(g.x1), y1: r4(g.y1), x2: r4(g.x2), y2: r4(g.y2), stops }
    : { id: g.id, kind: 'radial', cx: r4(g.cx), cy: r4(g.cy), r: r4(Math.max(0, g.r)), stops };
}

/** Gradients that are referenced by a fill and exist, in document order; dangling fills lose the reference (SVG default fill). */
export function pruneGradients(doc: VectorDocument): { gradients: Gradient[] | undefined; paths: VectorPath[] } {
  const have = new Map((doc.gradients ?? []).map((g) => [g.id, g]));
  const used = new Set<string>();
  const paths = doc.paths.map((p) => {
    const id = gradientIdOf(p.style?.fill);
    if (id === undefined || have.has(id)) { if (id !== undefined) used.add(id); return p; }
    const { fill: _f, ...rest } = p.style as Partial<Style>;
    const q: VectorPath = { ...p };
    if (Object.keys(rest).length) q.style = rest; else delete q.style;
    return q;
  });
  const gradients = [...have.values()].filter((g) => used.has(g.id)).slice(0, GRADIENT_LIMITS.maxGradients).map(cleanGradient);
  return { gradients: gradients.length ? gradients : undefined, paths };
}

export function gradientSvg(g: Gradient): string[] {
  const f = (n: number) => fmt(n, 4);
  const head = g.kind === 'linear'
    ? `<linearGradient id="${escapeAttr(g.id)}" gradientUnits="objectBoundingBox" x1="${f(g.x1)}" y1="${f(g.y1)}" x2="${f(g.x2)}" y2="${f(g.y2)}">`
    : `<radialGradient id="${escapeAttr(g.id)}" gradientUnits="objectBoundingBox" cx="${f(g.cx)}" cy="${f(g.cy)}" r="${f(g.r)}">`;
  return [head, ...g.stops.map((s) => `  <stop offset="${f(s.offset)}" stop-color="${escapeAttr(s.color)}"${s.opacity !== 1 ? ` stop-opacity="${f(s.opacity)}"` : ''}/>`), g.kind === 'linear' ? '</linearGradient>' : '</radialGradient>'];
}
