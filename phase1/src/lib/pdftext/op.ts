import { PdfTextError, type PdfTextOperation, type PdfTextParams } from './types';

export function normalizePdfTextParams(value: unknown): PdfTextParams {
  if (!value || typeof value !== 'object') throw new PdfTextError('INVALID_OPERATION', 'Replacement parameters must be an object.');
  const p = value as Record<string, unknown>;
  for (const key of ['pageIndex', 'streamIndex', 'runIndex']) {
    if (!Number.isSafeInteger(p[key]) || (p[key] as number) < 0) throw new PdfTextError('INVALID_OPERATION', `${key} must be a non-negative safe integer.`);
  }
  for (const key of ['expectedText', 'replacement']) {
    if (typeof p[key] !== 'string' || /[\r\n\x00]/.test(p[key] as string)) throw new PdfTextError('INVALID_OPERATION', `${key} must be single-line text without NUL.`);
  }
  return { pageIndex: p.pageIndex as number, streamIndex: p.streamIndex as number, runIndex: p.runIndex as number, expectedText: p.expectedText as string, replacement: p.replacement as string };
}
export function newPdfTextOperation(id: string, params: PdfTextParams): PdfTextOperation {
  if (typeof id !== 'string' || !id.trim()) throw new PdfTextError('INVALID_OPERATION', 'An operation ID is required.');
  return { id, type: 'pdftext.replace', version: 1, enabled: true, params: normalizePdfTextParams(params) };
}
export function patchPdfTextOperation(op: PdfTextOperation, patch: Partial<PdfTextParams>): PdfTextOperation {
  validatePdfTextOperation(op);
  return { ...op, params: normalizePdfTextParams({ ...op.params, ...patch }) };
}
export function validatePdfTextOperation(value: unknown): asserts value is PdfTextOperation {
  const op = value as PdfTextOperation | null;
  if (!op || op.type !== 'pdftext.replace' || op.version !== 1 || typeof op.enabled !== 'boolean' || typeof op.id !== 'string' || !op.id.trim()) throw new PdfTextError('INVALID_OPERATION', 'Unsupported PDF text operation.');
  normalizePdfTextParams(op.params);
}
