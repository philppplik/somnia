import type { ImageOperation, JsonValue } from '../../image-editor/types';
export type { JsonValue };

export type Matrix = readonly [number, number, number, number, number, number];
export type NodeId = string;
export type Paint = { readonly kind: 'none' } | { readonly kind: 'solid'; readonly rgba: readonly [number, number, number, number] };
export type PathSegment =
  | { readonly kind: 'M' | 'L'; readonly x: number; readonly y: number }
  | { readonly kind: 'C'; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number; readonly x: number; readonly y: number }
  | { readonly kind: 'Q'; readonly x1: number; readonly y1: number; readonly x: number; readonly y: number }
  | { readonly kind: 'A'; readonly rx: number; readonly ry: number; readonly rotation: number; readonly largeArc: boolean; readonly sweep: boolean; readonly x: number; readonly y: number }
  | { readonly kind: 'Z' };
export interface NodeCommon {
  readonly id: NodeId;
  readonly name: string;
  readonly transform: Matrix;
  readonly opacity: number;
  readonly visible: boolean;
  readonly locked: boolean;
}
export interface ShapeStyle {
  readonly fill: Paint;
  readonly stroke: Paint;
  readonly strokeWidth: number;
  readonly fillRule: 'nonzero' | 'evenodd';
  readonly lineCap: 'butt' | 'round' | 'square';
  readonly lineJoin: 'miter' | 'round' | 'bevel';
  readonly miterLimit: number;
  readonly dash: readonly number[];
  readonly dashOffset: number;
}
/**
 * `polygon` and `line` are an EXTENSION to the ADR node set (group, rect, ellipse, path), kept because the wave-4 task
 * asked for parametric Rect/Ellipse/Polygon/Line that convert to paths. See docs/VECTOR-SHAPES-LAYERS.md.
 */
export type VectorNode = NodeCommon & (
  | { readonly kind: 'group'; readonly children: readonly NodeId[] }
  | { readonly kind: 'rect'; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly rx: number; readonly ry: number; readonly style: ShapeStyle }
  | { readonly kind: 'ellipse'; readonly cx: number; readonly cy: number; readonly rx: number; readonly ry: number; readonly style: ShapeStyle }
  | { readonly kind: 'polygon'; readonly cx: number; readonly cy: number; readonly radius: number; readonly sides: number; readonly rotation: number; readonly style: ShapeStyle }
  | { readonly kind: 'line'; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number; readonly style: ShapeStyle }
  | { readonly kind: 'path'; readonly segments: readonly PathSegment[]; readonly style: ShapeStyle }
);
export type NodeKind = VectorNode['kind'];
export type ShapeNode = Exclude<VectorNode, { kind: 'group' }>;
export type GroupNode = Extract<VectorNode, { kind: 'group' }>;
export interface VectorScene {
  readonly viewBox: readonly [number, number, number, number];
  readonly outputSize: { readonly width: number; readonly height: number };
  readonly roots: readonly NodeId[];
  readonly nodes: Readonly<Record<NodeId, VectorNode>>;
}
/** Same wire envelope as ImageOperation. */
export type VectorOperation = ImageOperation;
export interface VectorEditDocument {
  readonly kind: 'vector';
  readonly schemaVersion: 1;
  readonly source: { readonly id: string; readonly name: string; readonly mime: 'image/svg+xml' };
  readonly base: VectorScene;
  readonly operations: readonly VectorOperation[];
  readonly revision: number;
}
