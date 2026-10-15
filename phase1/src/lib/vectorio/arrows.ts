import type { Style, VectorPath } from './types';
export { ARROW_KINDS } from './types';
export type { ArrowKind } from './types';
import type { ArrowKind } from './types';
/** Arrowheads are SVG <marker>s the editor writes itself (`data-vs-arrow`); only those are read back, other markers are refused. */
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
/** Marker colour = the stroke colour when it is a hex colour, else black (named colours and gradients are not followed). */
export function arrowColor(stroke: string | undefined): string {
  const m = stroke !== undefined ? HEX.exec(stroke.trim()) : null;
  if (!m) return '000000';
  const h = m[1].toLowerCase();
  return h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
}
export const arrowMarkerId = (kind: Exclude<ArrowKind, 'none'>, color: string): string => `vs-arrow-${kind}-${color}`;
export interface ArrowSpec { id: string; kind: Exclude<ArrowKind, 'none'>; color: string; refX: number; shape: 'path' | 'circle'; d: string; filled: boolean }
export function arrowSpec(kind: Exclude<ArrowKind, 'none'>, color: string): ArrowSpec {
  const id = arrowMarkerId(kind, color);
  if (kind === 'triangle') return { id, kind, color, refX: 10, shape: 'path', d: 'M0 0L10 5L0 10Z', filled: true };
  if (kind === 'open') return { id, kind, color, refX: 9, shape: 'path', d: 'M1 1L9 5L1 9', filled: false };
  return { id, kind, color, refX: 5, shape: 'circle', d: '', filled: true };
}
export const isArrowKind = (v: unknown): v is ArrowKind => typeof v === 'string' && (ARROW_KINDS as readonly string[]).includes(v);
/** Arrowheads apply to open, single-contour paths only (a marker sits on the first and last vertex of one element). */
export const arrowsApply = (p: Pick<VectorPath, 'closed' | 'compound' | 'nodes'>): boolean => !p.closed && p.compound === undefined && p.nodes.length >= 2;
/** The two markers (start, end) a path uses, as specs; null when none or not applicable. */
export function pathArrows(p: Pick<VectorPath, 'closed' | 'compound' | 'nodes'> & { style?: Partial<Style> }): { start?: ArrowSpec; end?: ArrowSpec } {
  if (!arrowsApply(p)) return {};
  const c = arrowColor(p.style?.stroke), s = p.style?.arrowStart, e = p.style?.arrowEnd;
  return { start: isArrowKind(s) && s !== 'none' ? arrowSpec(s, c) : undefined, end: isArrowKind(e) && e !== 'none' ? arrowSpec(e, c) : undefined };
}
/** `<marker>` source for the exporter. */
export function arrowMarkerSvg(a: ArrowSpec): string[] {
  const col = `#${a.color}`;
  const body = a.shape === 'circle' ? `<circle cx="5" cy="5" r="4" fill="${col}"/>`
    : a.filled ? `<path d="${a.d}" fill="${col}"/>` : `<path d="${a.d}" fill="none" stroke="${col}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  return [`<marker id="${a.id}" data-vs-arrow="${a.kind}" viewBox="0 0 10 10" refX="${a.refX}" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">`, `  ${body}`, '</marker>'];
}
