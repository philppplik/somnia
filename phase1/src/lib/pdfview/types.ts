/** Backend-neutral PDF contracts. The viewer depends only on these; pdf.js is one adapter. */
export interface PageRenderTask { promise: Promise<void>; cancel(): void }
export interface PdfTextItem { str: string; /** Transform in viewport px: [a,b,c,d,e,f]. */ transform: number[]; width: number; height: number }
export interface PdfPageHandle {
  /** 1-based. */
  readonly number: number;
  /** Unrotated size in PDF points. */
  readonly size: { width: number; height: number };
  /** Draws into `canvas` (already sized by the caller to the device pixel size). */
  render(canvas: HTMLCanvasElement, scale: number, rotation: number): PageRenderTask;
  /** Optional text layer. Rejects or is absent when unsupported. */
  getText?(): Promise<string>;
  /** Mounts selectable text spans into `container`. Returns a cancel function. */
  renderTextLayer?(container: HTMLElement, scale: number, rotation: number): Promise<() => void>;
  cleanup(): void;
}
export interface PdfDocumentHandle {
  readonly pageCount: number;
  getPage(n: number): Promise<PdfPageHandle>;
  destroy(): Promise<void>;
}
export type PdfLoadErrorCode = 'not-pdf' | 'too-large' | 'password' | 'invalid' | 'aborted' | 'unavailable';
export class PdfLoadError extends Error {
  constructor(readonly code: PdfLoadErrorCode, message: string) { super(message); this.name = 'PdfLoadError'; }
}
export interface PdfBackend {
  open(data: Uint8Array, opts?: { password?: string; signal?: AbortSignal }): Promise<PdfDocumentHandle>;
}
