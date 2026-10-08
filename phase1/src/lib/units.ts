/** Measurement units follow the locale unless the user picks one (Settings > Workflow). Pure, no DOM. */
export type UnitPref = 'auto' | 'metric' | 'imperial';
export type UnitSystem = 'metric' | 'imperial';
export type Paper = 'A4' | 'Letter';
const IMPERIAL = new Set(['US', 'LR', 'MM']);
const LETTER = new Set(['US', 'CA', 'MX', 'CL', 'CO', 'CR', 'DO', 'GT', 'PA', 'PH', 'VE', 'PR']);
export const sanitizeUnitPref = (v: unknown): UnitPref => (v === 'metric' || v === 'imperial' ? v : 'auto');

/** Region subtag of a BCP47 tag ("en-US" -> US). A bare language ("en", "de") has no region: undefined, so metric/A4 apply. */
export function regionOf(locale: string | undefined): string | undefined {
  if (!locale) return undefined;
  try { return new Intl.Locale(locale.replace('_', '-')).region; } catch { return undefined; }
}
export function unitSystem(pref: UnitPref, locale?: string): UnitSystem {
  if (pref !== 'auto') return pref;
  const r = regionOf(locale);
  return r && IMPERIAL.has(r) ? 'imperial' : 'metric';
}
export function paperFor(pref: UnitPref, locale?: string): Paper {
  if (pref === 'metric') return 'A4';
  if (pref === 'imperial') return 'Letter';
  const r = regionOf(locale);
  return r && LETTER.has(r) ? 'Letter' : 'A4';
}
export const PAPER_PT: Record<Paper, readonly [number, number]> = { A4: [595.28, 841.89], Letter: [612, 792] };
const PT_PER_MM = 72 / 25.4, PT_PER_IN = 72;
export const mmToPt = (mm: number) => mm * PT_PER_MM;
export const inToPt = (i: number) => i * PT_PER_IN;
const trim = (n: number, d: number) => String(Number(n.toFixed(d)));
/** Length in PDF points -> "210 mm" or "8.5 in". */
export function formatLength(pt: number, system: UnitSystem): string {
  return system === 'imperial' ? `${trim(pt / PT_PER_IN, 2)} in` : `${trim(pt / PT_PER_MM, 1)} mm`;
}
/** "12.5", "12,5 mm", "0.5in", "36pt" -> points. Bare numbers use the system's unit. Returns null when not a length. */
export function parseLength(text: string, system: UnitSystem): number | null {
  const m = /^\s*(-?\d+(?:[.,]\d+)?)\s*(mm|cm|in|"|pt|px)?\s*$/i.exec(text);
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.')), u = (m[2] ?? (system === 'imperial' ? 'in' : 'mm')).toLowerCase();
  const pt = u === 'mm' ? n * PT_PER_MM : u === 'cm' ? n * PT_PER_MM * 10 : u === 'in' || u === '"' ? n * PT_PER_IN : u === 'px' ? n * 0.75 : n;
  return Number.isFinite(pt) ? pt : null;
}
