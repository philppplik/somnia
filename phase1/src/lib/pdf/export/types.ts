export type ExportPreset = 'print' | 'screen';
export type ExportLocale = 'en' | 'de' | 'es' | 'fr' | 'pt-BR';
export interface ExportMetadata {
  title?: string; author?: string; subject?: string; keywords?: string[];
  creator?: string; creationDate?: Date; modificationDate?: Date;
}
/** JPEG of the visible crop box, with page rotation already applied. */
export interface RasterPage { jpeg: Uint8Array; widthPt: number; heightPt: number }
export type RasterRenderer = (bytes: Uint8Array, options: {
  dpi: number; quality: number; maxPixels: number; signal?: AbortSignal;
}) => AsyncIterable<RasterPage>;
export interface TextOverlay {
  page: number; text: string; x: number; y: number; size: number;
  font?: 'Helvetica' | 'Times-Roman' | 'Courier';
}
export interface ExportOptions {
  preset?: ExportPreset;
  metadata?: ExportMetadata;
  text?: readonly TextOverlay[];
  /** Screen export is deliberately rasterized, never silently selected. */
  renderer?: RasterRenderer;
  dpi?: number; quality?: number;
  signal?: AbortSignal;
}
export interface ExportResult {
  bytes: Uint8Array; flattened: number; preservedLinks: number;
  rasterized: boolean; warnings: string[];
}
export class PdfExportError extends Error {
  constructor(public code: 'INVALID_PDF' | 'PROTECTED_PDF' | 'UNSUPPORTED_ANNOTATION' |
    'UNSUPPORTED_FONT' | 'INVALID_OPTIONS' | 'RENDERER_REQUIRED' | 'LIMIT', message: string) {
    super(message); this.name = 'PdfExportError';
  }
}
export function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError');
}
