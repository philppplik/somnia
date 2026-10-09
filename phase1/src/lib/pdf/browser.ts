import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { importPdf } from './import.ts';
import type { PdfImportOptions } from './types.ts';
/** Vite/Tauri browser entry; keeps the bundled worker in sync with pdf.js. */
export function importPdfInBrowser(bytes: Uint8Array, options: Omit<PdfImportOptions, 'workerSrc'> = {}) {
  return importPdf(bytes, { ...options, workerSrc: workerUrl });
}
