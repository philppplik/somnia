import { PDFDocument, PDFArray, PDFDict, PDFName, PDFRawStream, PDFStream, StandardFonts, decodePDFRawStream, type PDFFont, type PDFPage } from 'pdf-lib';
import { tokenize, type Token } from './lexer';
import { validatePdfTextOperation } from './op';
import { PdfTextError, type PdfTextOperation, type PdfTextRun } from './types';
export * from './types';
export * from './op';

const fail = (code: ConstructorParameters<typeof PdfTextError>[0], message: string): never => { throw new PdfTextError(code, message); };
const fontNames = new Set<string>(Object.values(StandardFonts));
const safeGraphics = new Set('q Q cm w J j M m l c v y h re S s f F f* B B* b b* n W W* G g RG rg K k'.split(' '));
const textPosition = new Set(['Tm', 'Td', 'TD', 'T*']);
interface InternalRun extends PdfTextRun { token: Token; metricFont: PDFFont; asciiOnly: boolean }
const binary = (bytes: Uint8Array): string => { let out = ''; for (let i = 0; i < bytes.length; i += 8192) out += String.fromCharCode(...bytes.subarray(i, i + 8192)); return out; };

async function load(bytes: Uint8Array): Promise<PDFDocument> {
  try { return await PDFDocument.load(bytes.slice(), { updateMetadata: false }); }
  catch { return fail('INVALID_PDF', 'Cannot load this PDF. Encrypted or malformed PDFs are not supported.'); }
}
function streams(page: PDFPage): PDFStream[] {
  const contents = page.node.Contents();
  if (!contents) return [];
  if (contents instanceof PDFArray) return Array.from({ length: contents.size() }, (_, i) => contents.lookup(i, PDFStream));
  if (contents instanceof PDFStream) return [contents];
  return fail('UNSUPPORTED_CONTENT', 'Unsupported page content container.');
}
function decode(stream: PDFStream): string {
  if (!(stream instanceof PDFRawStream)) return fail('UNSUPPORTED_CONTENT', 'Only saved PDF content streams are supported.');
  try { return binary(decodePDFRawStream(stream).decode()); }
  catch { return fail('UNSUPPORTED_CONTENT', 'Unsupported or malformed stream compression.'); }
}
async function resolveFont(doc: PDFDocument, page: PDFPage, resource: string): Promise<{ metricFont: PDFFont; asciiOnly: boolean; name: string }> {
  const fonts = page.node.Resources()?.lookupMaybe(PDFName.of('Font'), PDFDict);
  const fontObject = fonts?.lookup(PDFName.of(resource.slice(1)));
  if (!(fontObject instanceof PDFDict)) return fail('UNSUPPORTED_FONT', 'Font resource is missing or invalid.');
  const dict = fontObject;
  const base = dict?.lookupMaybe(PDFName.of('BaseFont'), PDFName)?.decodeText();
  const subtype = dict?.lookupMaybe(PDFName.of('Subtype'), PDFName)?.decodeText();
  if (!dict || subtype !== 'Type1' || !base || !fontNames.has(base) || base === StandardFonts.Symbol || base === StandardFonts.ZapfDingbats) return fail('UNSUPPORTED_FONT', 'Only unembedded Latin Standard-14 Type1 fonts are supported. Symbol, Dingbats, subset and custom fonts need a separate engine.');
  if (dict.has(PDFName.of('ToUnicode')) || dict.has(PDFName.of('Widths')) || dict.has(PDFName.of('FontDescriptor'))) return fail('UNSUPPORTED_FONT', 'Custom mappings, widths and embedded fonts are unsupported.');
  const encodingObject = dict.lookup(PDFName.of('Encoding'));
  if (encodingObject && !(encodingObject instanceof PDFName)) fail('UNSUPPORTED_FONT', 'Custom font encodings and Differences are unsupported.');
  const encoding = (encodingObject as PDFName | undefined)?.decodeText();
  if (encoding && encoding !== 'WinAnsiEncoding' && encoding !== 'StandardEncoding') return fail('UNSUPPORTED_FONT', 'Only WinAnsi or ASCII StandardEncoding is supported.');
  return { metricFont: await doc.embedFont(base as StandardFonts), asciiOnly: encoding !== 'WinAnsiEncoding', name: base };
}
async function scan(doc: PDFDocument, page: PDFPage, pageIndex: number, streamIndex: number, source: string): Promise<InternalRun[]> {
  const runs: InternalRun[] = [];
  let operands: Token[] = [], inText = false, positioned = false, shows = 0;
  let resource = '', fontSize = 0;
  const states: { resource: string; fontSize: number }[] = [];
  const fonts = new Map<string, Awaited<ReturnType<typeof resolveFont>>>();
  for (const token of tokenize(source)) {
    if (token.kind !== 'operator') { operands.push(token); continue; }
    const op = token.value;
    if (op === 'BT') {
      if (inText || operands.length) fail('UNSUPPORTED_CONTENT', 'Invalid text object.');
      inText = true; positioned = false; shows = 0;
    } else if (op === 'ET') {
      if (!inText || operands.length) fail('UNSUPPORTED_CONTENT', 'Invalid text object end.');
      inText = false;
    } else if (op === 'Tf' && inText) {
      if (operands.length !== 2 || operands[0].kind !== 'name' || operands[1].kind !== 'number' || !(Number(operands[1].value) > 0) || !Number.isFinite(Number(operands[1].value))) fail('UNSUPPORTED_CONTENT', 'Invalid font selection.');
      resource = operands[0].value; fontSize = Number(operands[1].value);
    } else if (textPosition.has(op) && inText) {
      const count = op === 'Tm' ? 6 : op === 'T*' ? 0 : 2;
      if (operands.length !== count || operands.some((v) => v.kind !== 'number' || !Number.isFinite(Number(v.value)))) fail('UNSUPPORTED_CONTENT', 'Invalid text position.');
      positioned = true;
    } else if (op === 'Tj' && inText) {
      if (!positioned || !resource || !fontSize || ++shows > 1 || operands.length !== 1 || operands[0].kind !== 'string') fail('UNSUPPORTED_CONTENT', 'Require one isolated, explicitly positioned Tj string per BT/ET text object.');
      let font = fonts.get(resource);
      if (!font) { font = await resolveFont(doc, page, resource); fonts.set(resource, font); }
      const bytes = operands[0].bytes!;
      if (bytes.some((b) => b < 32 || b === 127 || (font!.asciiOnly && b > 126))) fail('UNSUPPORTED_FONT', 'Source text is not supported by this font encoding.');
      const text = new TextDecoder('windows-1252').decode(bytes);
      try {
        if (binary(font.metricFont.encodeText(text).asBytes()) !== binary(bytes)) fail('UNSUPPORTED_FONT', 'Source glyph mapping does not round-trip.');
      } catch (error) { if (error instanceof PdfTextError) throw error; fail('UNSUPPORTED_FONT', 'Source glyph mapping cannot be decoded reliably.'); }
      runs.push({ pageIndex, streamIndex, runIndex: runs.length, expectedText: text, font: font.name, fontSize, width: font.metricFont.widthOfTextAtSize(text, fontSize), token: operands[0], metricFont: font.metricFont, asciiOnly: font.asciiOnly });
    } else if (['Tc', 'Tw', 'Ts', 'Tr', 'Tz', 'TL'].includes(op)) {
      const neutral = op === 'Tz' ? 100 : 0;
      if (operands.length !== 1 || operands[0].kind !== 'number' || !Number.isFinite(Number(operands[0].value)) || (op !== 'TL' && Number(operands[0].value) !== neutral)) fail('UNSUPPORTED_CONTENT', 'Non-default text spacing, scaling, rendering, rise or leading is unsupported.');
    } else if (safeGraphics.has(op)) {
      if (inText && !['G', 'g', 'RG', 'rg', 'K', 'k'].includes(op)) fail('UNSUPPORTED_CONTENT', 'Graphics operators other than color inside text objects are unsupported.');
      if (op === 'q') { if (operands.length) fail('UNSUPPORTED_CONTENT', 'Invalid graphics save.'); states.push({ resource, fontSize }); }
      if (op === 'Q') { const state = states.pop(); if (!state || operands.length) fail('UNSUPPORTED_CONTENT', 'Unbalanced graphics state.'); resource = state!.resource; fontSize = state!.fontSize; }
    } else fail('UNSUPPORTED_CONTENT', `Unsupported operator ${op}. Forms, inline images, marked content, text arrays and graphics-state resources are not editable here.`);
    operands = [];
  }
  if (inText || operands.length || states.length) fail('UNSUPPORTED_CONTENT', 'Unbalanced text object or dangling operands.');
  return runs;
}

/** Fail-closed inspection of direct page streams. Not extraction, OCR or visual reading order. */
export async function inspectPdfText(bytes: Uint8Array, pageIndex: number): Promise<PdfTextRun[]> {
  const doc = await load(bytes);
  if (!Number.isSafeInteger(pageIndex) || pageIndex < 0 || pageIndex >= doc.getPageCount()) return fail('TARGET_NOT_FOUND', 'Page does not exist.');
  const page = doc.getPage(pageIndex), result: PdfTextRun[] = [];
  for (const [streamIndex, stream] of streams(page).entries()) {
    const runs = await scan(doc, page, pageIndex, streamIndex, decode(stream));
    result.push(...runs.map(({ token: _token, metricFont: _font, asciiOnly: _ascii, ...run }) => run));
  }
  return result;
}

/** Replay a JSON operation log on a fresh source. All changes are atomic in memory; input is never mutated. */
export async function applyPdfTextOperations(bytes: Uint8Array, operations: readonly PdfTextOperation[], context: { signal?: AbortSignal } = {}): Promise<Uint8Array> {
  for (const op of operations) validatePdfTextOperation(op);
  context.signal?.throwIfAborted();
  if (!operations.some((op) => op.enabled)) return bytes.slice();
  const doc = await load(bytes);
  const dirty = new Map<number, string[]>();
  for (const op of operations) {
    context.signal?.throwIfAborted();
    if (!op.enabled) continue;
    const p = op.params;
    if (p.pageIndex >= doc.getPageCount()) fail('TARGET_NOT_FOUND', 'Page does not exist.');
    const page = doc.getPage(p.pageIndex);
    let sources = dirty.get(p.pageIndex);
    if (!sources) {
      sources = streams(page).map(decode);
      // Validate every stream so unsupported inherited text/graphics state cannot be ignored.
      for (const [index, contents] of sources.entries()) await scan(doc, page, p.pageIndex, index, contents);
      dirty.set(p.pageIndex, sources);
    }
    if (p.streamIndex >= sources.length) fail('TARGET_NOT_FOUND', 'Content stream does not exist.');
    const source = sources[p.streamIndex];
    const run = (await scan(doc, page, p.pageIndex, p.streamIndex, source))[p.runIndex];
    if (!run) fail('TARGET_NOT_FOUND', 'Text run does not exist.');
    if (run.expectedText !== p.expectedText) fail('STALE_TARGET', 'Source text changed. Inspect again before editing.');
    if (/[\x00-\x1f\x7f]/.test(p.replacement) || (run.asciiOnly && /[^\x20-\x7e]/.test(p.replacement))) fail('UNENCODABLE_TEXT', 'Replacement is not supported by this font encoding. No silent font substitution is performed.');
    let encoded: string;
    try { encoded = run.metricFont.encodeText(p.replacement).toString(); }
    catch { return fail('UNENCODABLE_TEXT', 'Replacement contains unsupported glyphs. No Unicode fallback is available.'); }
    if (run.metricFont.widthOfTextAtSize(p.replacement, run.fontSize) > run.width + 0.001) fail('TEXT_OVERFLOW', 'Replacement is wider than the original run. No automatic reflow or font shrinking is performed.');
    sources[p.streamIndex] = source.slice(0, run.token.start) + encoded + source.slice(run.token.end);
  }
  for (const [pageIndex, sources] of dirty) {
    const refs = sources.map((source) => doc.context.register(doc.context.flateStream(Uint8Array.from(source, (c) => c.charCodeAt(0)))));
    doc.getPage(pageIndex).node.set(PDFName.of('Contents'), doc.context.obj(refs));
  }
  context.signal?.throwIfAborted();
  const output = await doc.save();
  context.signal?.throwIfAborted();
  return output;
}
