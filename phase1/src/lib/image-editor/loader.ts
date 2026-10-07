import { assertImageSize, createImageDocument } from './document';
import type { ImageEditDocument } from './types';
export interface LoadedImage { readonly document: ImageEditDocument; readonly bitmap: CanvasImageSource; dispose(): void }
export function imageMime(name: string, mime = ''): string {
  const byExtension: Record<string,string> = {png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',svg:'image/svg+xml'};
  const resolved = byExtension[name.split('.').pop()?.toLowerCase() || ''];
  if (!resolved || (mime && mime !== resolved && mime !== 'application/octet-stream')) throw new Error('Supported image formats: PNG, JPEG, WebP and SVG.');
  return resolved;
}
/** Rasterize SVG in the isolated image decoder, never insert supplied markup into the app DOM. */
export function validateSvg(text: string): void {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg') throw new Error('Invalid SVG.');
  for (const el of doc.querySelectorAll('*')) {
    if (['script','foreignObject','iframe','image','use','feImage','animate','set','animateTransform','animateMotion','style'].includes(el.localName)) throw new Error(`SVG element is not allowed: ${el.localName}`);
    for (const attr of el.attributes) {
      if (/^on/i.test(attr.name) || attr.name === 'style' || (/href$/i.test(attr.name) && !attr.value.startsWith('#')) || /(?:url\(\s*['"]?(?!#)|@import)/i.test(attr.value)) throw new Error('SVG external resources and event handlers are not allowed.');
    }
    if (el.localName === 'style' && /url\(|@import/i.test(el.textContent || '')) throw new Error('SVG external CSS resources are not allowed.');
  }
  if (doc.doctype) throw new Error('SVG document types are not allowed.');
}
export async function loadImage(blob: Blob, name: string, signal?: AbortSignal): Promise<LoadedImage> {
  signal?.throwIfAborted();
  if (blob.size > 128 * 1024 * 1024) throw new RangeError('Image exceeds the 128 MB file limit.');
  const mime = imageMime(name, blob.type);
  if (mime === 'image/svg+xml') validateSvg(await blob.text());
  const typedBlob = blob.type === mime ? blob : new Blob([blob], {type:mime});
  let bitmap: CanvasImageSource; let width: number; let height: number; let cleanup: () => void;
  if (typeof createImageBitmap === 'function' && mime !== 'image/svg+xml') {
    const decoded = await createImageBitmap(typedBlob, {imageOrientation:'from-image'});
    bitmap = decoded; width = decoded.width; height = decoded.height; cleanup = () => decoded.close();
  } else {
    const url = URL.createObjectURL(typedBlob), image = new Image();
    try { image.src = url; await image.decode(); } catch (error) { URL.revokeObjectURL(url); throw error; }
    bitmap = image; width = image.naturalWidth; height = image.naturalHeight;
    cleanup = () => { image.src = ''; URL.revokeObjectURL(url); };
  }
  try { signal?.throwIfAborted(); assertImageSize(width,height); } catch (error) { cleanup(); throw error; }
  let disposed = false;
  return {bitmap, document:createImageDocument({id:crypto.randomUUID(),name,mime,width,height}), dispose() { if (!disposed) { disposed = true; cleanup(); } }};
}
/** Native integration supplies an asset-protocol URL or Rust binary response as Blob. Never Base64 IPC. */
export async function loadImageUrl(url: string, name: string, signal?: AbortSignal): Promise<LoadedImage> {
  const response = await fetch(url, {signal}); if (!response.ok) throw new Error(`Image read failed (${response.status}).`);
  return loadImage(await response.blob(),name,signal);
}
