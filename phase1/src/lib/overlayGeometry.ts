/** Box of a preview element in the preview document's own coordinates (CSS px).
 * Canvas selection overlays are placed with these numbers inside the same scaled wrapper
 * that holds the preview frame, so this is the single place that defines overlay geometry.
 * The render overlay oracle (test/fixtures/render/overlay-oracle.spec.ts) checks it against the live DOM. */
export interface OverlayBox { x: number; y: number; w: number; h: number }
export function elementOverlayBox(el: Pick<Element, 'getBoundingClientRect'>): OverlayBox {
  const r = el.getBoundingClientRect();
  return {x: r.x, y: r.y, w: r.width, h: r.height};
}
