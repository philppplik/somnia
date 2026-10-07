import { validateSelection, type SelectionMask } from './selection';
/** Merge collinear boundary edges. No internal seams; holes retain their own boundary. */
export function selectionOutline(mask: SelectionMask): string {
  validateSelection(mask); const { width: w, height: h, data } = mask, parts: string[] = [];
  const selected = (x: number, y: number) => x >= 0 && x < w && y >= 0 && y < h && data[y * w + x] === 1;
  for (let y = 0; y <= h; y++) {
    let start = -1;
    for (let x = 0; x <= w; x++) {
      const edge = x < w && selected(x, y - 1) !== selected(x, y);
      if (edge && start < 0) start = x;
      if (!edge && start >= 0) { parts.push(`M${start} ${y}H${x}`); start = -1; }
    }
  }
  for (let x = 0; x <= w; x++) {
    let start = -1;
    for (let y = 0; y <= h; y++) {
      const edge = y < h && selected(x - 1, y) !== selected(x, y);
      if (edge && start < 0) start = y;
      if (!edge && start >= 0) { parts.push(`M${x} ${start}V${y}`); start = -1; }
    }
  }
  return parts.join('');
}
