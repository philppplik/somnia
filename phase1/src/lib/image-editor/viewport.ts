import type { Point, Size, Viewport } from './types';
export const MIN_ZOOM = 0.01;
export const MAX_ZOOM = 64;
export function clampZoom(zoom: number): number { if (!Number.isFinite(zoom) || zoom <= 0) throw new RangeError('Zoom must be positive and finite.'); return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)); }
export function imageToScreen(point: Point, view: Viewport): Point { return {x: point.x * view.zoom + view.x, y: point.y * view.zoom + view.y}; }
export function screenToImage(point: Point, view: Viewport): Point { return {x: (point.x - view.x) / view.zoom, y: (point.y - view.y) / view.zoom}; }
export function zoomAt(view: Viewport, nextZoom: number, anchor: Point): Viewport {
  const image = screenToImage(anchor, view), zoom = clampZoom(nextZoom);
  return {zoom, x: anchor.x - image.x * zoom, y: anchor.y - image.y * zoom};
}
export function panBy(view: Viewport, delta: Point): Viewport { return {...view, x: view.x + delta.x, y: view.y + delta.y}; }
export function fitViewport(image: Size, container: Size, padding = 24): Viewport {
  if ([image.width,image.height,container.width,container.height].some(n => !Number.isFinite(n) || n <= 0)) throw new RangeError('Viewport dimensions must be positive.');
  const zoom = clampZoom(Math.min(Math.max(1,container.width - padding * 2) / image.width, Math.max(1,container.height - padding * 2) / image.height, 1));
  return {zoom, x: (container.width - image.width * zoom) / 2, y: (container.height - image.height * zoom) / 2};
}
