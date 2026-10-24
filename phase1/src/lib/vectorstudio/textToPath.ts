import { LINE_HEIGHT, TEXT_LIMITS, textLines, type Style, type VectorDocument, type VectorNode, type VectorPath, type VectorText } from '../vectorio';
import { newId } from './shapes';
import opentype from 'opentype.js';

type Font = opentype.Font;

export type TextToPathErrorCode = 'empty' | 'tooLong' | 'badSize' | 'badRotation' | 'tooManyGlyphs' | 'tooManyNodes' | 'missingGlyph' | 'unsupportedScript' | 'unknownText' | 'locked' | 'invalidFamily' | 'noApi' | 'denied' | 'noFamily' | 'noVariantBold' | 'noVariantItalic' | 'noVariantBoldItalic' | 'noGlyphs';
/** Fail-closed conversion errors (never half-convert silently). `code` + `params` drive the localized panel note (`vector.shell.textToPathError.<code>`). */
export class TextToPathError extends Error { readonly expected = true; constructor(m: string, readonly code: TextToPathErrorCode, readonly params?: Record<string, string | number>) { super(m); this.name = 'TextToPathError'; } }
/** Scripts whose rendering needs OpenType shaping (contextual forms, mark positioning, cluster merging). Converting them glyph-by-glyph would silently alter the text, so they are refused. */
const NEEDS_SHAPING = /[\u0300-\u036F\u0483-\u0489\u0591-\u05FF\u0600-\u074F\u0750-\u07BF\u07C0-\u085F\u08A0-\u08FF\u0900-\u0DFF\u0E00-\u0EFF\u0F00-\u0FFF\u1000-\u109F\u1100-\u11FF\u1780-\u17FF\u1800-\u18AF\u1AB0-\u1AFF\u200C\u200D\u20D0-\u20FF\uA960-\uA97F\uD7B0-\uD7FF\uFB50-\uFDFF\uFE00-\uFE0F\uFE70-\uFEFF]|\uDB40[\uDD00-\uDDEF]/;

export const TEXTPATH_LIMITS = Object.freeze({ maxGlyphs: TEXT_LIMITS.maxChars, maxNodes: 10_000, maxFamily: TEXT_LIMITS.maxFamily });

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Glyph outlines of one text object: one path per contour; the contours of a glyph share one `compound`
 *
 * LIMITATION, fail-closed: the layout is glyph-by-glyph WITHOUT the OpenType shaping pipeline - no
 * ligatures, no mark positioning, no contextual forms. Scripts that need shaping (Arabic, Hebrew,
 * Indic, Thai, Hangul jamo, combining marks, ZWJ sequences, variation selectors) are rejected with
 * `unsupportedScript` instead of producing silently altered outlines. Kerning pairs still apply.
 * id so counters (holes) export as one element, and everything shares one editor `group` so the converted
 * text stays one movable unit. Baseline origin, line pitch (fontSize*1.2), anchor and rotation match the
 * `<text>` export exactly, so the outlines land where the text was painted.
 */
interface Glyph { name: string; index: number; advanceWidth: number; getPath(x: number, y: number, fontSize: number): { commands: { type: string; x: number; y: number; x1?: number; y1?: number; x2?: number; y2?: number }[] } }
/** Layout without the shaping pipeline (GSUB ligation etc. is skipped; kerning pairs still apply). */
function layout(font: Font, line: string, size: number): { x: number; glyph: Glyph }[] {
  const scale = size / ((font as { unitsPerEm?: number }).unitsPerEm || 1000);
  const kern = (a: Glyph, b: Glyph) => { try { return ((font as { getKerningValue?: (l: Glyph, r: Glyph) => number }).getKerningValue?.(a, b) ?? 0) * scale; } catch { return 0; } };
  const out: { x: number; glyph: Glyph }[] = [];
  let x = 0, prev: Glyph | null = null;
  for (const ch of line) {
    const glyph = font.charToGlyph(ch) as Glyph;
    if (prev) x += kern(prev, glyph);
    out.push({ x, glyph });
    x += (glyph.advanceWidth || 0) * scale;
    prev = glyph;
  }
  return out;
}
/** Kerned advance width of one line, consistent with `layout`. */
function advance(font: Font, line: string, size: number): number {
  const g = layout(font, line, size);
  if (!g.length) return 0;
  const last = g[g.length - 1];
  const scale = size / ((font as { unitsPerEm?: number }).unitsPerEm || 1000);
  return last.x + (last.glyph.advanceWidth || 0) * scale;
}

export function textToOutlinePaths(font: Font, t: VectorText): VectorPath[] {
  if (typeof t.text !== 'string' || !t.text.trim()) throw new TextToPathError('Text is empty', 'empty');
  if (t.text.length > TEXT_LIMITS.maxChars) throw new TextToPathError(`Text longer than ${TEXT_LIMITS.maxChars} characters`, 'tooLong', { max: TEXT_LIMITS.maxChars });
  const size = t.fontSize;
  if (!Number.isFinite(size) || size < TEXT_LIMITS.minSize || size > TEXT_LIMITS.maxSize) throw new TextToPathError('Font size out of range', 'badSize');
  const rot = t.rotation ?? 0;
  if (!Number.isFinite(rot) || rot < -360 || rot > 360) throw new TextToPathError('Rotation out of range', 'badRotation');
  const rad = rot * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
  const P = (x: number, y: number) => rot ? { x: r3(t.x + (x - t.x) * cos - (y - t.y) * sin), y: r3(t.y + (x - t.x) * sin + (y - t.y) * cos) } : { x: r3(x), y: r3(y) };
  const group = newId('tg');
  const style: Partial<Style> = { fill: t.fill, fillRule: 'evenodd', stroke: 'none', ...(t.opacity !== undefined && t.opacity < 1 ? { opacity: t.opacity } : {}) };
  const out: VectorPath[] = [];
  let nodes = 0, glyphs = 0;
  if (NEEDS_SHAPING.test(t.text)) throw new TextToPathError('This script needs OpenType shaping (ligatures, marks or contextual forms) that conversion does not support', 'unsupportedScript');
  const missing = new Set<string>();
  const lines = textLines(t);
  for (const line of lines) for (const ch of line) { const g = font.charToGlyph(ch); if (g.index === 0 && ch.trim()) missing.add(ch); }
  if (missing.size) throw new TextToPathError(`${missing.size} character(s) are missing from the font: ${[...missing].slice(0, 5).join(' ')}`, 'missingGlyph', { chars: [...missing].slice(0, 5).join(' ') });
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    if (!line) continue;
    const y = t.y + li * size * LINE_HEIGHT;
    const placed = layout(font, line, size);
    const w = placed.length ? advance(font, line, size) : 0;
    const x0 = t.anchor === 'middle' ? t.x - w / 2 : t.anchor === 'end' ? t.x - w : t.x;
    for (const { x: dx, glyph } of placed) {
      const gx = x0 + dx, gy = y;
      if (++glyphs > TEXTPATH_LIMITS.maxGlyphs) throw new TextToPathError('Too many glyphs', 'tooManyGlyphs');
      const gp = glyph.getPath(gx, gy, size);
      if (!gp.commands.length) continue; // whitespace: advance only
      const compound = newId('tc');
      let cur: VectorPath | null = null;
      for (const c of gp.commands) {
        if (c.type === 'M') {
          cur = { id: newId(), closed: true, compound, group, style, nodes: [{ id: newId('n'), ...P(c.x, c.y), kind: 'corner' }] };
          out.push(cur);
        } else if (!cur) { continue; }
        else if (c.type === 'L') cur.nodes.push({ id: newId('n'), ...P(c.x, c.y), kind: 'corner' });
        else if (c.type === 'C') {
          const prev = cur.nodes[cur.nodes.length - 1]; prev.out = P(c.x1!, c.y1!);
          cur.nodes.push({ id: newId('n'), ...P(c.x, c.y), kind: 'smooth', in: P(c.x2!, c.y2!) });
        } else if (c.type === 'Q') { // quadratic -> cubic (exact)
          const prev = cur.nodes[cur.nodes.length - 1];
          prev.out = P(prev.x + 2 / 3 * (c.x1! - prev.x), prev.y + 2 / 3 * (c.y1! - prev.y));
          cur.nodes.push({ id: newId('n'), ...P(c.x, c.y), kind: 'smooth', in: P(c.x + 2 / 3 * (c.x1! - c.x), c.y + 2 / 3 * (c.y1! - c.y)) });
        } else if (c.type === 'Z') cur.closed = true;
        if (++nodes > TEXTPATH_LIMITS.maxNodes) throw new TextToPathError('Too many nodes', 'tooManyNodes');
      }
    }
  }
  if (!out.length) throw new TextToPathError('No drawable glyphs', 'noGlyphs');
  if (t.hidden) for (const p of out) p.hidden = true;
  return out;
}

/** Replace one text object by its outlines in one document step (one undo). Paint order kept: back-texts go behind all paths, others above. */
export function textToPathCommit(doc: VectorDocument, textId: string, font: Font): { doc: VectorDocument; ids: string[] } {
  const t = (doc.texts ?? []).find(x => x.id === textId);
  if (!t) throw new TextToPathError('Unknown text: ' + textId, 'unknownText', { id: textId });
  if (t.locked) throw new TextToPathError('Text is locked', 'locked');
  const made = textToOutlinePaths(font, t);
  const ids = made.map(p => p.id);
  const paths = t.back ? [...made, ...doc.paths] : [...doc.paths, ...made];
  const texts = (doc.texts ?? []).filter(x => x.id !== textId);
  return { doc: { ...doc, paths, texts: texts.length ? texts : undefined }, ids };
}

interface LocalFontData { family?: string; fullName?: string; postscriptName?: string; style?: string; blob(): Promise<Blob> }
/**
 * Resolve the exact installed font file for a text object through the browser's Local Font Access API
 * (Chromium-based webviews; needs a user gesture for the permission prompt). Generic CSS families like
 * "sans-serif" match nothing, and a missing bold/italic variant is an error - outlines from the wrong
 * font or weight would silently change the look, so both fail closed.
 */
export async function loadLocalFont(t: Pick<VectorText, 'fontFamily' | 'fontWeight' | 'fontStyle'>): Promise<Font> {
  if (typeof t.fontFamily !== 'string' || !t.fontFamily || t.fontFamily.length > TEXTPATH_LIMITS.maxFamily) throw new TextToPathError('Invalid font family', 'invalidFamily');
  const q = (globalThis as { queryLocalFonts?: () => Promise<LocalFontData[]> }).queryLocalFonts;
  if (typeof q !== 'function') throw new TextToPathError('System fonts are not accessible from this browser', 'noApi');
  let all: LocalFontData[];
  try { all = await q(); } catch { throw new TextToPathError('Font access was denied', 'denied'); }
  const fam = t.fontFamily.toLowerCase();
  const cand = all.filter(f => (f.family ?? '').toLowerCase() === fam);
  if (!cand.length) throw new TextToPathError(`Font "${t.fontFamily}" was not found on this system (generic families cannot be converted)`, 'noFamily', { family: t.fontFamily });
  const wB = t.fontWeight === 'bold', wI = t.fontStyle === 'italic';
  const pick = cand.find(f => { const s = (f.style ?? '').toLowerCase(); return s.includes('bold') === wB && (s.includes('italic') || s.includes('oblique')) === wI; });
  if (!pick) throw new TextToPathError(`Font "${t.fontFamily}" has no ${wB ? 'bold' : ''}${wI ? ' italic' : ''} variant installed`, wB && wI ? 'noVariantBoldItalic' : wB ? 'noVariantBold' : 'noVariantItalic', { family: t.fontFamily });
  return opentype.parse(await (await pick.blob()).arrayBuffer());
}
