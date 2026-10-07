/** Bytes are kept outside the serializable operation, as in image-editor. */
export interface PdfTextTarget {
  pageIndex: number;
  streamIndex: number;
  /** Zero-based Tj ordinal in this stream, not a visual reading-order index. */
  runIndex: number;
  /** Compare-and-swap guard. Never silently edit a different source run. */
  expectedText: string;
}
export interface PdfTextParams extends PdfTextTarget { replacement: string }
export interface PdfTextOperation {
  readonly id: string;
  readonly type: 'pdftext.replace';
  readonly version: 1;
  readonly enabled: boolean;
  readonly params: Readonly<PdfTextParams>;
}
export interface PdfTextRun extends PdfTextTarget {
  font: string;
  fontSize: number;
  width: number;
}
export type PdfTextErrorCode = 'INVALID_OPERATION' | 'INVALID_PDF' | 'UNSUPPORTED_CONTENT' | 'UNSUPPORTED_FONT' | 'UNENCODABLE_TEXT' | 'TARGET_NOT_FOUND' | 'STALE_TARGET' | 'TEXT_OVERFLOW';
export class PdfTextError extends Error {
  constructor(public readonly code: PdfTextErrorCode, message: string) { super(message); this.name = 'PdfTextError'; }
}
