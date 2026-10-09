import type { ImportedPdf, PdfImportOptions } from './types.ts';
import { importPdf } from './import.ts';
export interface PdfImportRevision { documentId: string; revision: number; sourceHash: string }
export interface RevisionedPdfImport { source: PdfImportRevision; model: ImportedPdf }
/** Capture the session token, never an editable-state grant. Caller owns its session and cancellation. */
export async function importPdfForRevision(bytes: Uint8Array, source: PdfImportRevision, options: PdfImportOptions = {}): Promise<RevisionedPdfImport> {
  const captured = { ...source };
  return { source: captured, model: await importPdf(bytes, options) };
}
/** Closed/reopened tabs and old edit results must never install stale read-only import data. */
export function isCurrentPdfImport(result: RevisionedPdfImport, current: PdfImportRevision | null | undefined): boolean {
  return !!current && result.source.documentId===current.documentId && result.source.revision===current.revision && result.source.sourceHash===current.sourceHash;
}
