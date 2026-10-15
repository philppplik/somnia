/** Document colour palette ("swatches"): lowercase #rrggbb, unique, bounded. Exported as `data-vs-swatches` on the root <svg>. */
export const SWATCH_LIMIT = 64;
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
/** `#rgb` or `#rrggbb` to `#rrggbb` lowercase; null for anything else (names, alpha, gradients). */
export function swatchColor(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = HEX.exec(v.trim());
  if (!m) return null;
  const h = m[1].toLowerCase();
  return '#' + (h.length === 3 ? h.split('').map((c) => c + c).join('') : h);
}
export function normalizeSwatches(list: readonly unknown[] | undefined): string[] | undefined {
  if (!Array.isArray(list)) return undefined;
  const out: string[] = [];
  for (const v of list) { const c = swatchColor(v); if (c && !out.includes(c)) out.push(c); if (out.length >= SWATCH_LIMIT) break; }
  return out.length ? out : undefined;
}
export const formatSwatches = (s: readonly string[]): string => s.join(',');
/** Strict parse; null when malformed (caller reports and ignores the palette). */
export function parseSwatches(s: string): string[] | null {
  if (s.length > 64 * 8) return null;
  const parts = s.trim() === '' ? [] : s.split(',');
  const out: string[] = [];
  for (const p of parts) { const c = /^#[0-9a-f]{6}$/.test(p.trim()) ? p.trim() : null; if (!c) return null; if (!out.includes(c)) out.push(c); }
  return out.slice(0, SWATCH_LIMIT);
}
