/** DOCX viewing and export. Read-only semantic view: mammoth (BSD-2) gives HTML, not Word layout. Export uses docx (MIT). */
import {listZip, sniffOffice, MAX_OFFICE_BYTES} from './zipProbe';
export interface DocxView {html: string; warnings: string[]}
const CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'";
const STYLE = 'body{font:15px/1.6 system-ui,sans-serif;max-width:46rem;margin:1.5rem auto;padding:0 1rem;color:#1a1a1a}table{border-collapse:collapse}td,th{border:1px solid #bbb;padding:4px 8px}img{max-width:100%}';
/** Strips everything executable. Mammoth only emits a small tag set, this is a second guard, not the only one: the iframe is sandboxed and CSP blocks scripts. */
export function sanitizeDocxHtml(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|base|form)\b[\s\S]*?(<\/\s*\1\s*>|$)/gi, '')
    .replace(/<\s*(script|iframe|object|embed|link|meta|base|form)\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|src|xlink:href)\s*=\s*("\s*(?!#|data:image\/)[^"]*"|'\s*(?!#|data:image\/)[^']*')/gi, '');
}
export function docxSrcdoc(bodyHtml: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><style>${STYLE}</style></head><body>${bodyHtml}</body></html>`;
}
export async function docxToView(bytes: Uint8Array): Promise<DocxView> {
  if (bytes.length > MAX_OFFICE_BYTES) throw Error('DOCX is larger than 25 MB.');
  if (sniffOffice(bytes) !== 'docx') throw Error('Not a valid DOCX file.');
  if (listZip(bytes).some(e => e.encrypted)) throw Error('Encrypted DOCX files are not supported.');
  const mammoth = (await import('mammoth/mammoth.browser.js')).default;
  const res = await mammoth.convertToHtml({arrayBuffer: Uint8Array.from(bytes).buffer}, {externalFileAccess: false, includeEmbeddedStyleMap: false});
  const warnings = [...new Set(res.messages.map(m => m.message))].slice(0, 20);
  const html = sanitizeDocxHtml(res.value);
  warnings.unshift('Read-only view. Page layout, headers, footers, comments, tracked changes and macros are not shown.');
  return {html, warnings};
}
