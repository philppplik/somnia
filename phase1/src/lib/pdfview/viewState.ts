/** Pure view state for the PDF viewer: page, zoom, pan, rotation. No DOM, no pdf.js. */
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;
export const PAGE_MARGIN = 16;
export type FitMode = 'width' | 'page' | 'custom';
export interface Size { width: number; height: number }
export interface Point { x: number; y: number }
export interface PdfViewState {
  /** 1-based page number. */
  page: number;
  pageCount: number;
  /** CSS pixels per PDF point (1 = 72 dpi at 100 %). */
  zoom: number;
  fit: FitMode;
  /** Page top-left inside the viewport, CSS px. */
  pan: Point;
  /** Clockwise degrees: 0, 90, 180, 270. */
  rotation: 0 | 90 | 180 | 270;
}
export const initialViewState = (pageCount = 0): PdfViewState => ({
  page: pageCount > 0 ? 1 : 0, pageCount, zoom: 1, fit: 'width', pan: { x: 0, y: 0 }, rotation: 0,
});
export const clampZoom = (z: number): number =>
  Number.isFinite(z) ? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z)) : 1;
/** Page size after rotation, in PDF points. */
export const rotatedSize = (s: Size, rotation: number): Size =>
  rotation % 180 === 0 ? s : { width: s.height, height: s.width };
export function fitZoom(mode: FitMode, page: Size, viewport: Size, current: number): number {
  if (mode === 'custom' || page.width <= 0 || page.height <= 0) return clampZoom(current);
  const availW = Math.max(1, viewport.width - PAGE_MARGIN * 2);
  const availH = Math.max(1, viewport.height - PAGE_MARGIN * 2);
  const z = mode === 'width' ? availW / page.width : Math.min(availW / page.width, availH / page.height);
  return clampZoom(z);
}
const clampAxis = (offset: number, content: number, view: number): number => {
  if (content + PAGE_MARGIN * 2 <= view) return (view - content) / 2;
  return Math.min(PAGE_MARGIN, Math.max(view - content - PAGE_MARGIN, offset));
};
/** Keeps the page reachable: centred when smaller than the viewport, otherwise bounded with a margin. */
export function clampPan(pan: Point, zoom: number, page: Size, viewport: Size): Point {
  return { x: clampAxis(pan.x, page.width * zoom, viewport.width), y: clampAxis(pan.y, page.height * zoom, viewport.height) };
}
/** Re-fits (when in a fit mode) and clamps. Call after a page, rotation or viewport change. */
export function relayout(s: PdfViewState, rawPage: Size, viewport: Size): PdfViewState {
  const page = rotatedSize(rawPage, s.rotation);
  const zoom = fitZoom(s.fit, page, viewport, s.zoom);
  let pan = s.pan;
  if (s.fit !== 'custom') pan = { x: 0, y: PAGE_MARGIN }; // top of page visible after fit
  return { ...s, zoom, pan: clampPan(pan, zoom, page, viewport) };
}
/** Zoom keeping the page point under `anchor` (viewport px) fixed. Switches to custom fit. */
export function zoomAt(s: PdfViewState, nextZoom: number, anchor: Point, rawPage: Size, viewport: Size): PdfViewState {
  const page = rotatedSize(rawPage, s.rotation);
  const zoom = clampZoom(nextZoom);
  const ratio = zoom / s.zoom;
  const pan = { x: anchor.x - (anchor.x - s.pan.x) * ratio, y: anchor.y - (anchor.y - s.pan.y) * ratio };
  return { ...s, zoom, fit: 'custom', pan: clampPan(pan, zoom, page, viewport) };
}
/** Wheel delta (pixels, deltaMode 0) to a zoom factor; smooth and symmetric. */
export const wheelFactor = (deltaY: number): number => Math.exp(-Math.max(-200, Math.min(200, deltaY)) * 0.0015);
export const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8];
export function stepZoom(zoom: number, dir: 1 | -1): number {
  if (dir > 0) return ZOOM_STEPS.find(z => z > zoom + 1e-3) ?? MAX_ZOOM;
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) if (ZOOM_STEPS[i]! < zoom - 1e-3) return ZOOM_STEPS[i]!;
  return MIN_ZOOM;
}
export function panBy(s: PdfViewState, dx: number, dy: number, rawPage: Size, viewport: Size): PdfViewState {
  return { ...s, pan: clampPan({ x: s.pan.x + dx, y: s.pan.y + dy }, s.zoom, rotatedSize(rawPage, s.rotation), viewport) };
}
export function goToPage(s: PdfViewState, page: number): PdfViewState {
  if (s.pageCount === 0 || !Number.isFinite(page)) return s;
  const p = Math.min(s.pageCount, Math.max(1, Math.round(page)));
  return p === s.page ? s : { ...s, page: p };
}
export const nextPage = (s: PdfViewState) => goToPage(s, s.page + 1);
export const prevPage = (s: PdfViewState) => goToPage(s, s.page - 1);
/** Parses text typed into the page box. Returns null when it is not a page number. */
export function parsePageInput(text: string, pageCount: number): number | null {
  const t = text.trim();
  if (!/^\d{1,7}$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= pageCount ? n : null;
}
export const rotate = (s: PdfViewState, dir: 1 | -1): PdfViewState =>
  ({ ...s, rotation: ((s.rotation + (dir > 0 ? 90 : 270)) % 360) as PdfViewState['rotation'] });
