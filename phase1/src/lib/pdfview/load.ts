import { PdfLoadError, type PdfBackend, type PdfDocumentHandle } from './types.ts';
export const MAX_PDF_BYTES = 200_000_000;
/** %PDF- may follow up to 1024 bytes of junk per the spec; most readers accept that. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  const end = Math.min(bytes.length - 4, 1024);
  for (let i = 0; i <= end; i++) {
    if (bytes[i] === 0x25 && bytes[i + 1] === 0x50 && bytes[i + 2] === 0x44 && bytes[i + 3] === 0x46 && bytes[i + 4] === 0x2d) return true;
  }
  return false;
}
/** Validates bytes, then opens through the backend. Maps failures to PdfLoadError codes. */
export async function loadPdf(
  backend: PdfBackend, data: Uint8Array, opts: { password?: string; signal?: AbortSignal; maxBytes?: number } = {},
): Promise<PdfDocumentHandle> {
  if (opts.signal?.aborted) throw new PdfLoadError('aborted', 'Load aborted');
  if (data.byteLength > (opts.maxBytes ?? MAX_PDF_BYTES)) throw new PdfLoadError('too-large', 'PDF is too large to open');
  if (!looksLikePdf(data)) throw new PdfLoadError('not-pdf', 'File is not a PDF');
  try {
    const doc = await backend.open(data, opts);
    if (opts.signal?.aborted) { await doc.destroy(); throw new PdfLoadError('aborted', 'Load aborted'); }
    if (doc.pageCount < 1) { await doc.destroy(); throw new PdfLoadError('invalid', 'PDF has no pages'); }
    return doc;
  } catch (e) {
    if (e instanceof PdfLoadError) throw e;
    const name = (e as { name?: string })?.name;
    if (name === 'PasswordException') throw new PdfLoadError('password', 'PDF is password protected');
    if (name === 'AbortException') throw new PdfLoadError('aborted', 'Load aborted');
    throw new PdfLoadError('invalid', e instanceof Error ? e.message : 'PDF could not be read');
  }
}
