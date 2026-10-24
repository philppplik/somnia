import type { Style } from './types';
import type { XmlElement } from './xml';
/**
 * Object effects: Gaussian blur and drop shadow, written as one `<filter data-vs-fx="1">` per distinct combination.
 * Only filters of exactly this shape are read back (strict); any other `<filter>` is refused by the importer.
 */
export const FX_LIMITS = Object.freeze({ blurMax: 100, offsetMax: 500, shadowBlurMax: 100 });
export const FX_KEYS = ['blur', 'shadowDx', 'shadowDy', 'shadowBlur', 'shadowColor', 'shadowOpacity'] as const;
export interface FxSpec { id: string; blur: number; shadow?: { dx: number; dy: number; blur: number; color: string; opacity: number } }
type FxStyle = Partial<Pick<Style, (typeof FX_KEYS)[number]>>;
export const FX_DEFAULT_COLOR = '#000000';
const HEX6 = /^#[0-9a-f]{6}$/i;
const r2 = (n: number) => Math.round(n * 100) / 100;
const fin = (v: unknown, lo: number, hi: number, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
/** Validates a style patch's effect keys; throws RangeError on out-of-range or wrong-typed values. */
export function checkFxPatch(p: Record<string, unknown>): void {
  const num = (k: string, lo: number, hi: number) => { const v = p[k]; if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi)) throw new RangeError(`${k} must be ${lo} to ${hi}`); };
  num('blur', 0, FX_LIMITS.blurMax); num('shadowDx', -FX_LIMITS.offsetMax, FX_LIMITS.offsetMax); num('shadowDy', -FX_LIMITS.offsetMax, FX_LIMITS.offsetMax);
  num('shadowBlur', 0, FX_LIMITS.shadowBlurMax); num('shadowOpacity', 0, 1);
  if (p.shadowColor !== undefined && (typeof p.shadowColor !== 'string' || !HEX6.test(p.shadowColor))) throw new RangeError('shadowColor must be #rrggbb');
}
const idPart = (n: number) => String(r2(n)).replace('-', 'm').replace('.', 'p');
/** The effect an object has, or null. Out-of-range stored values are clamped, never trusted. */
export function fxSpec(s: FxStyle | undefined): FxSpec | null {
  if (!s) return null;
  const blur = r2(fin(s.blur, 0, FX_LIMITS.blurMax, 0));
  const op = r2(fin(s.shadowOpacity, 0, 1, 0));
  const shadow = op > 0 ? { dx: r2(fin(s.shadowDx, -FX_LIMITS.offsetMax, FX_LIMITS.offsetMax, 4)), dy: r2(fin(s.shadowDy, -FX_LIMITS.offsetMax, FX_LIMITS.offsetMax, 4)), blur: r2(fin(s.shadowBlur, 0, FX_LIMITS.shadowBlurMax, 4)), color: typeof s.shadowColor === 'string' && HEX6.test(s.shadowColor) ? s.shadowColor.toLowerCase() : FX_DEFAULT_COLOR, opacity: op } : undefined;
  if (blur <= 0 && !shadow) return null;
  const id = 'vs-fx' + (blur > 0 ? `-b${idPart(blur)}` : '') + (shadow ? `-s${idPart(shadow.dx)}_${idPart(shadow.dy)}_${idPart(shadow.blur)}_${shadow.color.slice(1)}_${idPart(shadow.opacity)}` : '');
  return { id, blur, shadow };
}
export const hasFx = (s: FxStyle | undefined): boolean => fxSpec(s) !== null;
/** Style keys for a spec (what the importer sets on an object that references the filter). */
export function fxStyle(f: FxSpec): FxStyle {
  return { ...(f.blur > 0 ? { blur: f.blur } : {}), ...(f.shadow ? { shadowDx: f.shadow.dx, shadowDy: f.shadow.dy, shadowBlur: f.shadow.blur, shadowColor: f.shadow.color, shadowOpacity: f.shadow.opacity } : {}) };
}
/** `<filter>` source. The region is the page plus one page size on each side, so thin lines and large offsets are not cut off. */
export function fxFilterSvg(f: FxSpec, w: number, h: number): string[] {
  const n = (v: number) => String(Math.round(v * 1000) / 1000);
  const out = [`<filter id="${f.id}" data-vs-fx="1" filterUnits="userSpaceOnUse" x="${n(-w)}" y="${n(-h)}" width="${n(3 * w)}" height="${n(3 * h)}" color-interpolation-filters="sRGB">`];
  if (f.blur > 0) out.push(`  <feGaussianBlur stdDeviation="${f.blur}"/>`);
  if (f.shadow) out.push(`  <feDropShadow dx="${f.shadow.dx}" dy="${f.shadow.dy}" stdDeviation="${f.shadow.blur}" flood-color="${f.shadow.color}" flood-opacity="${f.shadow.opacity}"/>`);
  out.push('</filter>');
  return out;
}
const NUM = /^[-+]?(?:\d+\.?\d*|\.\d+)$/;
const FILTER_ATTRS = new Set(['id', 'data-vs-fx', 'filterUnits', 'x', 'y', 'width', 'height', 'color-interpolation-filters']);
/** Strict reader for an editor-written filter. Returns the effect or an error message. */
export function parseFxFilter(el: XmlElement): { fx: FxSpec } | { error: string } {
  const bad = (m: string) => ({ error: `filter "${el.attrs.id ?? ''}": ${m}` });
  if (el.attrs['data-vs-fx'] !== '1') return bad('only effects written by this editor are supported');
  if (el.text.trim() !== '') return bad('unexpected text');
  for (const a of Object.keys(el.attrs)) if (!FILTER_ATTRS.has(a)) return bad(`attribute "${a}" is not supported`);
  if (el.attrs.filterUnits !== 'userSpaceOnUse') return bad('filterUnits must be userSpaceOnUse');
  if (el.attrs['color-interpolation-filters'] !== undefined && el.attrs['color-interpolation-filters'] !== 'sRGB') return bad('color-interpolation-filters must be sRGB');
  const num = (v: string | undefined, lo: number, hi: number): number | null => { if (v === undefined || !NUM.test(v.trim())) return null; const x = Number(v); return x >= lo && x <= hi ? x : null; };
  let blur = 0, shadow: FxSpec['shadow'];
  let i = 0;
  const kids = el.children;
  if (kids.length < 1 || kids.length > 2) return bad('expected a blur and/or a drop shadow');
  if (kids[i].name === 'feGaussianBlur') {
    const k = kids[i++];
    if (Object.keys(k.attrs).some((a) => a !== 'stdDeviation') || k.children.length) return bad('unsupported blur markup');
    const b = num(k.attrs.stdDeviation, 0.01, FX_LIMITS.blurMax);
    if (b === null) return bad(`blur must be 0.01 to ${FX_LIMITS.blurMax}`);
    blur = b;
  }
  if (i < kids.length) {
    const k = kids[i];
    if (k.name !== 'feDropShadow' || k.children.length || Object.keys(k.attrs).some((a) => !['dx', 'dy', 'stdDeviation', 'flood-color', 'flood-opacity'].includes(a))) return bad('unsupported markup (only feGaussianBlur then feDropShadow)');
    const dx = num(k.attrs.dx, -FX_LIMITS.offsetMax, FX_LIMITS.offsetMax), dy = num(k.attrs.dy, -FX_LIMITS.offsetMax, FX_LIMITS.offsetMax), sb = num(k.attrs.stdDeviation, 0, FX_LIMITS.shadowBlurMax), op = num(k.attrs['flood-opacity'], 0.01, 1);
    const col = k.attrs['flood-color'];
    if (dx === null || dy === null || sb === null || op === null || col === undefined || !HEX6.test(col)) return bad('shadow values are missing or out of range');
    shadow = { dx, dy, blur: sb, color: col.toLowerCase(), opacity: op };
  }
  const spec = fxSpec({ blur, ...(shadow ? { shadowDx: shadow.dx, shadowDy: shadow.dy, shadowBlur: shadow.blur, shadowColor: shadow.color, shadowOpacity: shadow.opacity } : {}) });
  if (!spec) return bad('empty effect');
  return { fx: spec };
}
