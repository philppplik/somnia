/** Op-based PDF annotation model. All coordinates are PDF user space: points, origin bottom-left. */
export const PDF_ANNOT_OP_VERSION = 1;
export const PDF_ANNOT_DOC_SCHEMA = 'somnia.pdfannotate/1';

export type PdfAnnotKind = 'highlight' | 'underline' | 'strikeout' | 'note' | 'ink';
export type RgbColor = readonly [number, number, number]; // each 0..1

export interface Rect { x: number; y: number; width: number; height: number }
export interface Point { x: number; y: number }

interface Base {
  /** 0-based page index. */
  page: number;
  color: RgbColor;
  /** 0..1 */
  opacity: number;
  /** Text shown in viewers' comment pane (/Contents). */
  contents: string;
  author: string;
}

export interface MarkupAnnotation extends Base {
  kind: 'highlight' | 'underline' | 'strikeout';
  /** One rect per text line; written as /QuadPoints. */
  rects: Rect[];
}
export interface NoteAnnotation extends Base {
  kind: 'note';
  /** Top-left anchor of the 20x20pt icon. */
  position: Point;
}
export interface InkAnnotation extends Base {
  kind: 'ink';
  /** Each stroke is a polyline with >= 2 points. */
  strokes: Point[][];
  /** Line width in points. */
  width: number;
}
export type PdfAnnotation = MarkupAnnotation | NoteAnnotation | InkAnnotation;
export type PdfAnnotationInput = { kind: PdfAnnotKind } & Partial<Base> & Record<string, unknown>;

export const PDF_ANNOT_ADD = 'pdf.annot.add';
export const PDF_ANNOT_UPDATE = 'pdf.annot.update';
export const PDF_ANNOT_REMOVE = 'pdf.annot.remove';

export type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

/** Same envelope shape as image-editor operations. */
export interface PdfAnnotOp {
  id: string;
  type: typeof PDF_ANNOT_ADD | typeof PDF_ANNOT_UPDATE | typeof PDF_ANNOT_REMOVE;
  version: number;
  enabled: boolean;
  params: { [k: string]: JsonValue };
}

export interface PdfAnnotDocument { schema: typeof PDF_ANNOT_DOC_SCHEMA; ops: PdfAnnotOp[] }
export interface ResolvedAnnotation { id: string; annotation: PdfAnnotation }
