/** Canvas overlay theme tokens: accent from the theme (or an explicit pref), contrast-checked against the stage background. */
export type RGB = [number, number, number];
export function parseColor(input: string): RGB | null {
  const s = input.trim();
  let m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) { const h = m[1].length === 3 ? m[1].replace(/./g, c => c + c) : m[1]; return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  m = s.match(/^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/i);
  if (m) return [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3])];
  return null;
}
export const toHex = (c: RGB) => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export function luminance([r, g, b]: RGB): number {
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export const contrast = (a: RGB, b: RGB): number => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslToRgb([h, s, l]: [number, number, number]): RGB {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
export const isDarkStage = (bg: RGB) => luminance(bg) < 0.18;
/** Dark stage: lift to lightness >= 70 %. Then, either way, move lightness until the UI-component contrast of 3:1 holds. */
export function overlayAccent(accent: RGB, stageBg: RGB): RGB {
  const dark = isDarkStage(stageBg);
  let [h, s, l] = rgbToHsl(accent);
  if (dark) l = Math.max(l, 0.7);
  let c = hslToRgb([h, s, l]);
  for (let i = 0; i < 40 && contrast(c, stageBg) < 3; i++) { l = Math.max(0, Math.min(1, l + (dark ? 0.02 : -0.02))); c = hslToRgb([h, s, l]); }
  return c.map(Math.round) as RGB;
}
export function overlayTokens(accent: RGB, stageBg: RGB): Record<string, string> {
  const dark = isDarkStage(stageBg), a = overlayAccent(accent, stageBg);
  const white: RGB = [255, 255, 255], ink: RGB = [14, 11, 31];
  return {
    '--canvas-accent': toHex(a),
    '--canvas-accent-ink': contrast(a, white) >= contrast(a, ink) ? '#ffffff' : '#0e0b1f',
    '--canvas-halo': dark ? 'rgba(20,22,27,.9)' : 'rgba(255,255,255,.9)',
    '--canvas-badge-bg': dark ? '#eceef3' : '#14161b',
    '--canvas-badge-fg': dark ? '#14161b' : '#ffffff',
    '--canvas-danger': dark ? '#ff6369' : '#e5484d',
    '--canvas-ok': dark ? '#3dd68c' : '#218358',
  };
}
