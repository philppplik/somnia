/** Imported geometry uses page viewport points: top-left origin, crop/rotation applied. */
export type Matrix = [number, number, number, number, number, number];
export type Point = [number, number];
export interface Bounds { x: number; y: number; width: number; height: number }
export type PathCommand =
  | { kind: 'move' | 'line'; point: Point }
  | { kind: 'cubic'; control1: Point; control2: Point; point: Point }
  | { kind: 'quadratic'; control: Point; point: Point }
  | { kind: 'close' };
export interface ImportedText {
  id: string; kind: 'text'; text: string; fontName: string; fontFamily: string;
  fontSize: number; direction: string; hasEOL: boolean;
  /** Baseline matrix in viewport space; bounds use font ascent/descent when available. */
  transform: Matrix; quad: [Point, Point, Point, Point]; bounds: Bounds;
}
export interface ImportedVector {
  id: string; kind: 'vector'; commands: PathCommand[]; bounds: Bounds;
  paint: 'fill' | 'stroke' | 'fill-stroke'; fillRule: 'nonzero' | 'evenodd';
  fill: string | null; stroke: string | null; lineWidth: number;
  /** Source-space stroke properties and transform preserve nonuniform scaling. */
  sourceTransform: Matrix; sourceLineWidth: number; dash: number[]; dashOffset: number;
  lineCap: number; lineJoin: number; miterLimit: number; fillOpacity: number; strokeOpacity: number;
}
export interface ImportedImage {
  id: string; kind: 'image'; pixelWidth: number; pixelHeight: number; interpolate: boolean;
  /** PNG data, detached from pdf.js resources, usable after the document is destroyed. */
  dataUrl: string; transform: Matrix; quad: [Point, Point, Point, Point]; bounds: Bounds;
}
export interface ImportDiagnostic { code: string; message: string; operatorIndex?: number }
export interface ImportedPdfPage {
  /** One-based, matching PdfSession.page and PdfViewer. */
  number: number; width: number; height: number; rotation: number;
  sourceBounds: number[]; viewportTransform: Matrix;
  text: ImportedText[]; vectors: ImportedVector[]; images: ImportedImage[];
  thumbnail: { dataUrl: string; width: number; height: number } | null;
  diagnostics: ImportDiagnostic[];
}
export interface ImportedPdf {
  schemaVersion: 1; pages: ImportedPdfPage[];
  /** Import is read-only inspection, never a replacement for the original PDF bytes. */
  readOnly: true;
}
export interface PdfImportOptions {
  password?: string; signal?: AbortSignal; workerSrc?: string;
  maxBytes?: number; maxPages?: number; maxObjectsPerPage?: number;
  /** Per image, and cumulatively for retained image pixels. */
  maxImagePixels?: number; maxTotalImagePixels?: number;
  thumbnails?: boolean; thumbnailMaxSize?: number;
  canvasFactory?: (width: number, height: number) => HTMLCanvasElement;
  onProgress?: (completedPages: number, totalPages: number) => void;
}
export class PdfImportError extends Error {
  constructor(readonly code: 'invalid' | 'password' | 'aborted' | 'limit' | 'unavailable', message: string) {
    super(message); this.name = 'PdfImportError';
  }
}
