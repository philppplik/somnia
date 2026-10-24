/** Minimal typings for the parts of opentype.js (MIT) that text-to-path uses. The package ships no own types. */
declare module 'opentype.js' {
  interface PathCommand { type: 'M' | 'L' | 'C' | 'Q' | 'Z'; x: number; y: number; x1?: number; y1?: number; x2?: number; y2?: number }
  interface GlyphPath { commands: PathCommand[] }
  interface Glyph { name: string; index: number; getPath(x: number, y: number, fontSize: number): GlyphPath }
  interface Font {
    getAdvanceWidth(text: string, fontSize: number, options?: { kerning?: boolean }): number;
    forEachGlyph(text: string, x: number, y: number, fontSize: number, options: { kerning?: boolean }, cb: (glyph: Glyph, x: number, y: number, fontSize: number) => void): number;
    charToGlyph(char: string): Glyph;
  }
  const opentype: { parse(buffer: ArrayBuffer): Font; Font: unknown; Glyph: unknown; Path: unknown };
  namespace opentype { type Font = import('opentype.js').Font }
  export default opentype;
}
