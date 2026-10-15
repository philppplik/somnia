import { escapeAttr, type XmlElement } from './xml';
import type { VectorImage } from './types';
/**
 * Placed raster images (PNG, JPEG, WebP) as data URIs. They are reference/background layers: painted behind everything,
 * exported as `<image data-vs-image="1" href="data:...">`. Only images of exactly this shape are read back.
 */
export const IMAGE_LIMITS = Object.freeze({ maxImages: 10, maxUriChars: 1_500_000, maxTotalChars: 5_000_000, minSize: 1, maxSize: 100_000 });
const URI = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const clampNum = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
/** True for a base64 data URI of a PNG, JPEG or WebP whose first bytes match that type and that is within the size limit. */
export function isImageUri(v: unknown): v is string {
  if (typeof v !== 'string' || v.length > IMAGE_LIMITS.maxUriChars) return false;
  const m = URI.exec(v);
  if (!m || m[2].length % 4 !== 0) return false;
  let head: string;
  try { head = atob(m[2].slice(0, 16)); } catch { return false; }
  const b = (i: number) => head.charCodeAt(i);
  if (m[1] === 'png') return head.startsWith('\x89PNG\r\n\x1a\n');
  if (m[1] === 'jpeg') return b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff;
  return head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP';
}
export function normalizeImage(i: Partial<VectorImage> | undefined): VectorImage | null {
  if (!i || typeof i.id !== 'string' || !i.id || !isImageUri(i.href)) return null;
  const op = r3(clampNum(i.opacity, 0, 1, 1));
  return {
    id: i.id, href: i.href,
    x: r3(clampNum(i.x, -1e6, 1e6, 0)), y: r3(clampNum(i.y, -1e6, 1e6, 0)),
    width: r3(clampNum(i.width, IMAGE_LIMITS.minSize, IMAGE_LIMITS.maxSize, 100)), height: r3(clampNum(i.height, IMAGE_LIMITS.minSize, IMAGE_LIMITS.maxSize, 100)),
    ...(op < 1 ? { opacity: op } : {}),
  };
}
export function normalizeImages(list: readonly Partial<VectorImage>[] | undefined): VectorImage[] | undefined {
  if (!Array.isArray(list)) return undefined;
  const seen = new Set<string>(), out: VectorImage[] = [];
  let total = 0;
  for (const raw of list) {
    const i = normalizeImage(raw);
    if (!i || seen.has(i.id) || total + i.href.length > IMAGE_LIMITS.maxTotalChars) continue;
    seen.add(i.id); total += i.href.length; out.push(i);
    if (out.length >= IMAGE_LIMITS.maxImages) break;
  }
  return out.length ? out : undefined;
}
export function imageSvg(i: VectorImage): string {
  const a = [`data-vs-image="1"`, `x="${r3(i.x)}"`, `y="${r3(i.y)}"`, `width="${r3(i.width)}"`, `height="${r3(i.height)}"`, 'preserveAspectRatio="none"'];
  if (i.opacity !== undefined && i.opacity < 1) a.push(`opacity="${r3(i.opacity)}"`);
  a.push(`href="${escapeAttr(i.href)}"`);
  return `<image ${a.join(' ')}/>`;
}
const IMAGE_ATTRS = new Set(['data-vs-image', 'x', 'y', 'width', 'height', 'preserveAspectRatio', 'opacity', 'href', 'id']);
const NUM = /^[-+]?(?:\d+\.?\d*|\.\d+)$/;
/** Strict reader for an editor-written `<image>`; reports an error and returns null for anything else. */
export function parseImageElement(el: XmlElement, id: string, bad: (m: string) => void): VectorImage | null {
  if (el.attrs['data-vs-image'] !== '1') { bad('<image> is not supported (only images placed by this editor are read back)'); return null; }
  for (const a of Object.keys(el.attrs)) if (!IMAGE_ATTRS.has(a)) { bad(`attribute "${a}" on <image> is not supported`); return null; }
  if (el.children.length || el.text.trim()) { bad('<image> must be empty'); return null; }
  if (el.attrs.preserveAspectRatio !== undefined && el.attrs.preserveAspectRatio !== 'none') { bad('<image> preserveAspectRatio must be "none"'); return null; }
  const n = (k: string) => (el.attrs[k] !== undefined && NUM.test(el.attrs[k].trim()) ? Number(el.attrs[k]) : NaN);
  const [x, y, w, h] = [n('x'), n('y'), n('width'), n('height')];
  if (![x, y, w, h].every(Number.isFinite) || w < IMAGE_LIMITS.minSize || h < IMAGE_LIMITS.minSize || w > IMAGE_LIMITS.maxSize || h > IMAGE_LIMITS.maxSize || Math.abs(x) > 1e6 || Math.abs(y) > 1e6) { bad('<image> needs numeric x, y, width and height within limits'); return null; }
  let opacity: number | undefined;
  if (el.attrs.opacity !== undefined) { if (!/^\d+(\.\d+)?$/.test(el.attrs.opacity) || Number(el.attrs.opacity) > 1) { bad('<image> opacity must be a number from 0 to 1'); return null; } opacity = Number(el.attrs.opacity); }
  if (!isImageUri(el.attrs.href)) { bad(`<image> href must be a base64 PNG, JPEG or WebP data URI of at most ${IMAGE_LIMITS.maxUriChars} characters`); return null; }
  return normalizeImage({ id, x, y, width: w, height: h, href: el.attrs.href, opacity });
}
