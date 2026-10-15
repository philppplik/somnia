import { escapeAttr, type XmlElement } from './xml';
import { swatchColor } from './swatches';
import type { VectorText } from './types';
/** Live text objects ("Text tool"). They keep the font NAME, not outlines: the viewer needs that font installed. */
export const TEXT_LIMITS = Object.freeze({ maxTexts: 200, maxChars: 2000, maxLines: 50, minSize: 1, maxSize: 1000, maxFamily: 100 });
export const FONT_WEIGHTS = ['normal', 'bold'] as const;
export const FONT_STYLES = ['normal', 'italic'] as const;
export const TEXT_ANCHORS = ['start', 'middle', 'end'] as const;
export const LINE_HEIGHT = 1.2;
const FAMILY = /^[\p{L}\p{N} _.,'-]{1,100}$/u;
export const isFamily = (v: unknown): v is string => typeof v === 'string' && FAMILY.test(v) && v.trim() === v && v.length > 0;
const clampNum = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const rot = (v: unknown) => r3(clampNum(v, -360, 360, 0));
const op = (v: unknown) => r3(clampNum(v, 0, 1, 1));
const r3 = (n: number) => Math.round(n * 1000) / 1000;
/** Strict cleanup of one text object; null when it cannot be repaired (no id / no text). Control characters other than newline are dropped. */
export function normalizeText(t: Partial<VectorText> | undefined): VectorText | null {
  if (!t || typeof t.id !== 'string' || !t.id || typeof t.text !== 'string') return null;
  const text = t.text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').slice(0, TEXT_LIMITS.maxChars).split('\n').slice(0, TEXT_LIMITS.maxLines).join('\n');
  if (!text.trim()) return null;
  return {
    id: t.id, text,
    x: r3(clampNum(t.x, -1e6, 1e6, 0)), y: r3(clampNum(t.y, -1e6, 1e6, 0)),
    fontFamily: isFamily(t.fontFamily) ? t.fontFamily : 'sans-serif',
    fontSize: r3(clampNum(t.fontSize, TEXT_LIMITS.minSize, TEXT_LIMITS.maxSize, 24)),
    fontWeight: t.fontWeight === 'bold' ? 'bold' : 'normal',
    fontStyle: t.fontStyle === 'italic' ? 'italic' : 'normal',
    anchor: t.anchor === 'middle' || t.anchor === 'end' ? t.anchor : 'start',
    fill: swatchColor(t.fill) ?? '#000000',
    ...(rot(t.rotation) ? { rotation: rot(t.rotation) } : {}),
    ...(op(t.opacity) < 1 ? { opacity: op(t.opacity) } : {}),
  };
}
export function normalizeTexts(list: readonly Partial<VectorText>[] | undefined): VectorText[] | undefined {
  if (!Array.isArray(list)) return undefined;
  const seen = new Set<string>(), out: VectorText[] = [];
  for (const raw of list) { const t = normalizeText(raw); if (t && !seen.has(t.id)) { seen.add(t.id); out.push(t); } if (out.length >= TEXT_LIMITS.maxTexts) break; }
  return out.length ? out : undefined;
}
export const textLines = (t: Pick<VectorText, 'text'>): string[] => t.text.split('\n');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** `<text>` source: one `<tspan>` per line so every renderer breaks lines the same way. */
export function textSvg(t: VectorText): string {
  const attrs = [`data-vs-text="1"`, `x="${r3(t.x)}"`, `y="${r3(t.y)}"`, `font-family="${escapeAttr(t.fontFamily)}"`, `font-size="${r3(t.fontSize)}"`];
  if (t.fontWeight === 'bold') attrs.push('font-weight="bold"');
  if (t.fontStyle === 'italic') attrs.push('font-style="italic"');
  if (t.anchor !== 'start') attrs.push(`text-anchor="${t.anchor}"`);
  attrs.push(`fill="${t.fill}"`);
  if (t.opacity !== undefined && t.opacity < 1) attrs.push(`opacity="${r3(t.opacity)}"`);
  const tr = textTransform(t);
  if (tr) attrs.push(`transform="${tr}"`);
  const lines = textLines(t).map((l, i) => `<tspan x="${r3(t.x)}" dy="${i === 0 ? '0' : r3(t.fontSize * LINE_HEIGHT)}">${esc(l)}</tspan>`);
  return `<text ${attrs.join(' ')} xml:space="preserve">${lines.join('')}</text>`;
}
/** SVG transform of a rotated text (about its anchor point), undefined when not rotated. */
export const textTransform = (t: Pick<VectorText, 'x' | 'y' | 'rotation'>): string | undefined => (t.rotation ? `rotate(${r3(t.rotation)} ${r3(t.x)} ${r3(t.y)})` : undefined);
const ROTATE = /^rotate\(\s*(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)\s*\)$/;
const TEXT_ATTRS = new Set(['opacity', 'transform', 'data-vs-text', 'x', 'y', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'fill', 'xml:space', 'id']);
/** Reads back only text this editor wrote. Anything else (transforms, CSS, other attributes, nested markup) is an error so nothing is dropped silently. */
export function parseTextElement(el: XmlElement, id: string, bad: (m: string) => void): VectorText | null {
  if (el.attrs['data-vs-text'] !== '1') { bad('<text> is not supported (only text created by this editor is read back)'); return null; }
  for (const a of Object.keys(el.attrs)) if (!TEXT_ATTRS.has(a)) { bad(`attribute "${a}" on <text> is not supported`); return null; }
  const num = (k: string) => (el.attrs[k] === undefined ? NaN : Number(el.attrs[k]));
  const size = num('font-size');
  if (!Number.isFinite(size) || size < TEXT_LIMITS.minSize || size > TEXT_LIMITS.maxSize) { bad('<text> needs a font-size between 1 and 1000'); return null; }
  if (!isFamily(el.attrs['font-family'])) { bad('<text> has an unsupported font-family'); return null; }
  if (!Number.isFinite(num('x')) || !Number.isFinite(num('y'))) { bad('<text> needs numeric x and y'); return null; }
  const fill = swatchColor(el.attrs.fill);
  if (!fill) { bad('<text> fill must be a #rgb or #rrggbb colour'); return null; }
  let rotation: number | undefined, opacity: number | undefined;
  if (el.attrs.transform !== undefined) {
    const m = ROTATE.exec(el.attrs.transform);
    if (!m || Number(m[2]) !== r3(num('x')) || Number(m[3]) !== r3(num('y')) || Math.abs(Number(m[1])) > 360) { bad('<text> transform must be rotate(angle x y) about its own x and y'); return null; }
    rotation = Number(m[1]);
  }
  if (el.attrs.opacity !== undefined) {
    opacity = Number(el.attrs.opacity);
    if (!/^\d+(\.\d+)?$/.test(el.attrs.opacity) || opacity > 1) { bad('<text> opacity must be a number from 0 to 1'); return null; }
  }
  const weight = el.attrs['font-weight'] ?? 'normal', style = el.attrs['font-style'] ?? 'normal', anchor = el.attrs['text-anchor'] ?? 'start';
  if (!(FONT_WEIGHTS as readonly string[]).includes(weight) || !(FONT_STYLES as readonly string[]).includes(style) || !(TEXT_ANCHORS as readonly string[]).includes(anchor)) { bad('<text> has an unsupported weight, style or anchor'); return null; }
  let lines: string[];
  if (el.children.length) {
    if (el.text.trim() || el.children.some((c) => c.name.replace(/^.*:/, '') !== 'tspan' || c.children.length)) { bad('<text> may only contain plain <tspan> lines'); return null; }
    lines = el.children.map((c) => c.text);
  } else lines = el.text.split('\n');
  const t = normalizeText({ id, x: num('x'), y: num('y'), text: lines.join('\n'), fontFamily: el.attrs['font-family'], fontSize: size, fontWeight: weight as VectorText['fontWeight'], fontStyle: style as VectorText['fontStyle'], anchor: anchor as VectorText['anchor'], fill, rotation, opacity });
  if (!t) bad('<text> is empty');
  return t;
}
/** Estimated or measured box of a text object (document units). Uses a 2D canvas when one exists, otherwise 0.56 em per character. */
let ctx: CanvasRenderingContext2D | null | undefined;
function measurer(): CanvasRenderingContext2D | null {
  if (ctx !== undefined) return ctx;
  try { ctx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null; } catch { ctx = null; }
  return ctx;
}
export function textBox(t: VectorText): { minX: number; minY: number; maxX: number; maxY: number } {
  const lines = textLines(t), c = measurer();
  let w = 0;
  for (const l of lines) {
    if (c) { c.font = `${t.fontStyle === 'italic' ? 'italic ' : ''}${t.fontWeight === 'bold' ? 'bold ' : ''}${t.fontSize}px ${t.fontFamily}`; w = Math.max(w, c.measureText(l).width); }
    else w = Math.max(w, l.length * t.fontSize * 0.56);
  }
  const x0 = t.anchor === 'middle' ? t.x - w / 2 : t.anchor === 'end' ? t.x - w : t.x;
  const top = t.y - t.fontSize * 0.8;
  return { minX: x0, maxX: x0 + w, minY: top, maxY: top + t.fontSize * LINE_HEIGHT * (lines.length - 1) + t.fontSize * 1.0 };
}

/** Bounds of a text after rotation (axis-aligned box around the rotated corners). */
export function textBoxRotated(t: VectorText): { minX: number; minY: number; maxX: number; maxY: number } {
  const b = textBox(t);
  if (!t.rotation) return b;
  const a = (t.rotation * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const pts = [[b.minX, b.minY], [b.maxX, b.minY], [b.maxX, b.maxY], [b.minX, b.maxY]].map(([px, py]) => ({ x: t.x + (px - t.x) * c - (py - t.y) * s, y: t.y + (px - t.x) * s + (py - t.y) * c }));
  return { minX: Math.min(...pts.map((p) => p.x)), maxX: Math.max(...pts.map((p) => p.x)), minY: Math.min(...pts.map((p) => p.y)), maxY: Math.max(...pts.map((p) => p.y)) };
}
/** A point mapped into the text's own (unrotated) frame, for hit testing. */
export function unrotateAround(t: Pick<VectorText, 'x' | 'y' | 'rotation'>, p: { x: number; y: number }): { x: number; y: number } {
  if (!t.rotation) return p;
  const a = (-t.rotation * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return { x: t.x + (p.x - t.x) * c - (p.y - t.y) * s, y: t.y + (p.x - t.x) * s + (p.y - t.y) * c };
}
