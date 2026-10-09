import { PDFDocument, PDFDict, PDFArray, PDFName, StandardFonts } from 'pdf-lib';
import { flattenAnnotations } from './flatten';
import { checkAbort, PdfExportError, type ExportMetadata, type ExportOptions, type ExportResult } from './types';
function metadata(doc: PDFDocument, m: ExportMetadata = {}) {
  for (const k of ['title','author','subject','creator'] as const) {
    if (m[k] !== undefined && (typeof m[k] !== 'string' || m[k]!.length > 20000))
      throw new PdfExportError('INVALID_OPTIONS', 'Invalid metadata text');
  }
  if (m.title !== undefined) doc.setTitle(m.title);
  if (m.author !== undefined) doc.setAuthor(m.author);
  if (m.subject !== undefined) doc.setSubject(m.subject);
  if (m.creator !== undefined) doc.setCreator(m.creator);
  if (m.keywords !== undefined) {
    if (!Array.isArray(m.keywords) || m.keywords.length > 100 || m.keywords.some(k => typeof k !== 'string' || k.length > 1000))
      throw new PdfExportError('INVALID_OPTIONS', 'Invalid keywords');
    doc.setKeywords(m.keywords);
  }
  for (const [date, set] of [[m.creationDate, (d: Date) => doc.setCreationDate(d)],
    [m.modificationDate, (d: Date) => doc.setModificationDate(d)]] as const) {
    if (date !== undefined) {
      if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new PdfExportError('INVALID_OPTIONS', 'Invalid metadata date');
      set(date);
    }
  }
}
function protectedDocument(doc: PDFDocument) {
  const seen = new Set<unknown>();
  function signed(v: unknown): boolean {
    if (seen.has(v)) return false; seen.add(v);
    if (v instanceof PDFDict) return v.has(PDFName.of('ByteRange')) || v.get(PDFName.of('FT')) === PDFName.of('Sig') ||
      v.get(PDFName.of('Type')) === PDFName.of('Sig') || v.values().some(signed);
    if (v instanceof PDFArray) return v.asArray().some(signed);
    return false;
  }
  return doc.isEncrypted || doc.context.enumerateIndirectObjects().some(([,v]) => signed(v)) ||
    !!doc.catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict)?.has(PDFName.of('XFA'));
}
/** Atomic copy export. Never mutates source bytes or edits a signature. */
export async function exportPdf(source: Uint8Array, options: ExportOptions = {}): Promise<ExportResult> {
  checkAbort(options.signal);
  if (!(source instanceof Uint8Array) || source.byteLength > 25_000_000) throw new PdfExportError('LIMIT', 'Source must be a PDF below 25 MB');
  const preset = options.preset ?? 'print';
  const dpi = options.dpi ?? 120, quality = options.quality ?? 0.78;
  if (!['print','screen'].includes(preset) || !Number.isFinite(dpi) || dpi < 72 || dpi > 300 ||
    !Number.isFinite(quality) || quality < 0.1 || quality > 1)
    throw new PdfExportError('INVALID_OPTIONS', 'Invalid export preset, DPI or JPEG quality');
  let doc: PDFDocument;
  try { doc = await PDFDocument.load(source.slice(), { ignoreEncryption: true, updateMetadata: false }); }
  catch { throw new PdfExportError('INVALID_PDF', 'Cannot read PDF'); }
  if (protectedDocument(doc)) throw new PdfExportError('PROTECTED_PDF', 'Encrypted, signed and XFA PDFs are view-only');
  const count = doc.getPageCount();
  if (count < 1 || count > 2000) throw new PdfExportError('LIMIT', 'Export needs 1-2000 pages');
  for (const t of options.text ?? []) {
    checkAbort(options.signal);
    if (!Number.isInteger(t.page) || !doc.getPages()[t.page] || typeof t.text !== 'string' || t.text.length > 20000 ||
      ![t.x,t.y,t.size].every(Number.isFinite) || t.size < 1 || t.size > 300)
      throw new PdfExportError('INVALID_OPTIONS', 'Invalid text overlay');
    const fontName = t.font ?? 'Helvetica';
    if (!['Helvetica','Times-Roman','Courier'].includes(fontName)) throw new PdfExportError('UNSUPPORTED_FONT', 'Only Standard-14 Latin text is supported');
    const font = await doc.embedFont(({ Helvetica:StandardFonts.Helvetica, 'Times-Roman':StandardFonts.TimesRoman, Courier:StandardFonts.Courier })[fontName]);
    try { font.encodeText(t.text); }
    catch { throw new PdfExportError('UNSUPPORTED_FONT', 'Text needs an embedded Unicode font; no silent font fallback'); }
    doc.getPage(t.page).drawText(t.text, { x:t.x, y:t.y, size:t.size, font });
  }
  const originalMetadata: ExportMetadata = {
    title:doc.getTitle(), author:doc.getAuthor(), subject:doc.getSubject(), creator:doc.getCreator(),
    creationDate:doc.getCreationDate(), modificationDate:doc.getModificationDate(),
    ...(doc.getKeywords() ? { keywords:[doc.getKeywords()!] } : {}),
  };
  const stats = flattenAnnotations(doc);
  checkAbort(options.signal);
  const warnings = ['Flattening removes review comments and form interactivity. It is not redaction or sanitization.'];
  if (preset === 'screen') {
    if (!options.renderer) throw new PdfExportError('RENDERER_REQUIRED', 'Screen export requires PDF canvas rendering');
    const flattened = await doc.save({ useObjectStreams: true });
    const raster = await PDFDocument.create();
    let n = 0, encodedBytes = 0;
    for await (const page of options.renderer(flattened, { dpi, quality, maxPixels: 16_000_000, signal: options.signal })) {
      checkAbort(options.signal);
      if (++n > count || ![page.widthPt,page.heightPt].every(v => Number.isFinite(v) && v > 0))
        throw new PdfExportError('INVALID_OPTIONS', 'Renderer returned invalid page geometry');
      encodedBytes += page.jpeg.byteLength;
      if (encodedBytes > 100_000_000) throw new PdfExportError('LIMIT', 'Screen images exceed 100 MB');
      const image = await raster.embedJpg(page.jpeg);
      if (image.width * image.height > 16_000_000) throw new PdfExportError('LIMIT', 'Rendered page exceeds 16 megapixels');
      raster.addPage([page.widthPt,page.heightPt]).drawImage(image, { x:0,y:0,width:page.widthPt,height:page.heightPt });
    }
    if (n !== count) throw new PdfExportError('INVALID_OPTIONS', 'Renderer did not return every page');
    metadata(raster, originalMetadata);
    doc = raster;
    warnings.push('Screen export turns every page into JPEG: text search, accessibility, links and vector detail are lost. Smaller size is not guaranteed.');
  }
  if (options.metadata && Object.keys(options.metadata).length && doc.catalog.has(PDFName.of('Metadata'))) {
    doc.catalog.delete(PDFName.of('Metadata'));
    warnings.push('Existing XMP metadata was removed to prevent conflicting document properties.');
  }
  metadata(doc, options.metadata);
  checkAbort(options.signal);
  const bytes = await doc.save({ useObjectStreams: true });
  checkAbort(options.signal);
  if (bytes.byteLength > 100_000_000) throw new PdfExportError('LIMIT', 'Export exceeds 100 MB');
  return { bytes, ...stats, preservedLinks:preset === 'screen' ? 0 : stats.preservedLinks, rasterized: preset === 'screen', warnings };
}
