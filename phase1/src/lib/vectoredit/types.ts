/** Serializable vector model. Mirrors the imageedit pattern: a document is an ordered list of JSON operations. */
export type JsonValue = string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export type PathCommand =
  | readonly ['M', number, number]
  | readonly ['L', number, number]
  | readonly ['C', number, number, number, number, number, number]
  | readonly ['Z'];

export type Shape =
  | { readonly kind: 'rect'; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly rx: number }
  | { readonly kind: 'ellipse'; readonly cx: number; readonly cy: number; readonly rx: number; readonly ry: number }
  | { readonly kind: 'polygon'; readonly cx: number; readonly cy: number; readonly radius: number; readonly sides: number; readonly rotation: number }
  | { readonly kind: 'line'; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number }
  | { readonly kind: 'path'; readonly commands: readonly PathCommand[] };
export type ShapeKind = Shape['kind'];

export type LineCap = 'butt' | 'round' | 'square';
export type LineJoin = 'miter' | 'round' | 'bevel';
export interface Fill { readonly color: string | null }
export interface Stroke {
  readonly color: string | null;
  readonly width: number;
  readonly cap: LineCap;
  readonly join: LineJoin;
  /** Alternating dash and gap lengths; empty means solid. */
  readonly dash: readonly number[];
}
export interface Style { readonly fill: Fill; readonly stroke: Stroke; readonly opacity: number }

export interface VectorLayer {
  readonly id: string;
  readonly name: string;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly shape: Shape;
  readonly style: Style;
}

/** Same envelope as image-editor ImageOperation, so one history/serialization path can carry both. */
export interface VectorOperation {
  readonly id: string;
  readonly type: string;
  readonly version: number;
  readonly enabled: boolean;
  readonly params: Readonly<Record<string, JsonValue>>;
}
export interface VectorDocument {
  readonly schemaVersion: 1;
  readonly size: { readonly width: number; readonly height: number };
  readonly operations: readonly VectorOperation[];
  readonly revision: number;
}
/** Layers in z-order, index 0 = bottom, last = top (SVG paint order). */
export type VectorState = readonly VectorLayer[];
