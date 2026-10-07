/**
 * Vector document contract (wave 4 assignment, parent agent message):
 *   VectorDocument { width, height, paths: [{ id, closed, nodes: [{ id, x, y, kind, in?, out? }] }] }
 * Handles are ABSOLUTE document coordinates (not offsets). Optional fields on VectorPath (style, layer,
 * compound, name, hidden) are additive extensions needed for fill/stroke and group->layer import; consumers
 * that only know the base contract can ignore them.
 */

export type NodeKind = 'corner' | 'smooth' | 'symmetric';
export interface Point { x: number; y: number }

export interface VectorNode {
  id: string;
  x: number;
  y: number;
  kind: NodeKind;
  /** Absolute control point of the segment arriving at this node. */
  in?: Point;
  /** Absolute control point of the segment leaving this node. */
  out?: Point;
}

export interface Style {
  fill: string; // 'none' | '#rrggbb' | '#rrggbbaa' | named colour | currentColor
  stroke: string;
  strokeWidth: number;
  fillOpacity: number;
  strokeOpacity: number;
  opacity: number;
  fillRule: 'nonzero' | 'evenodd';
  lineCap: 'butt' | 'round' | 'square';
  lineJoin: 'miter' | 'round' | 'bevel';
  miterLimit: number;
  dashArray: number[];
  dashOffset: number;
}

export interface VectorPath {
  id: string;
  closed: boolean;
  nodes: VectorNode[];
  /** Extension. Absent = SVG defaults (black fill, no stroke). */
  style?: Partial<Style>;
  /** Extension. Name of the top-level SVG group this path came from. */
  layer?: string;
  /** Extension. Subpaths sharing a value were one SVG <path> (holes / evenodd) and export as one element. */
  compound?: string;
  name?: string;
  hidden?: true;
}

export interface VectorDocument {
  width: number;
  height: number;
  paths: VectorPath[];
}

export const DEFAULT_STYLE: Style = Object.freeze({
  fill: '#000000', stroke: 'none', strokeWidth: 1, fillOpacity: 1, strokeOpacity: 1, opacity: 1,
  fillRule: 'nonzero', lineCap: 'butt', lineJoin: 'miter', miterLimit: 4, dashArray: [], dashOffset: 0,
}) as Style;

export type Matrix = [number, number, number, number, number, number];
export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export interface Diagnostic { severity: 'error' | 'warning'; message: string }

export const LIMITS = Object.freeze({ maxBytes: 8 * 1024 * 1024, maxNodes: 10_000, maxDepth: 64, maxSegments: 100_000 });
