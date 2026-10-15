export const ARROW_KINDS = ['none', 'triangle', 'open', 'circle'] as const;
export type ArrowKind = (typeof ARROW_KINDS)[number];
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

export const BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion'] as const;
export type BlendMode = (typeof BLEND_MODES)[number];

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
  arrowStart?: ArrowKind; // arrowheads on open single paths ('none' = absent)
  arrowEnd?: ArrowKind;
  blendMode?: BlendMode; // CSS mix-blend-mode on the object; absent = 'normal'
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
  /** Extension. Paths sharing a value are one editor group (selected and moved together). Exported as `<g data-vs-group>`; groups do not nest. */
  group?: string;
  name?: string;
  hidden?: true;
  /** Extension. Locked paths cannot be selected or edited in the editor. Exported as `data-vs-locked="1"`. */
  locked?: true;
  /** Extension. This path is the mask shape of its `group`: not painted, it clips the other members. Needs `group`; exported as `<clipPath>` + `clip-path` on the group. */
  clip?: true;
}

export interface GradientStop { offset: number; color: string; opacity: number }
/**
 * Extension. Gradients live on the document and are referenced by `style.fill = "url(#id)"`.
 * Coordinates are always in objectBoundingBox units (0..1 of the painted object's box), so a gradient follows its
 * object when it moves or scales. Pad spread only; no gradientTransform; fill only (no stroke gradients).
 */
export type Gradient = { id: string; stops: GradientStop[] } & (
  | { kind: 'linear'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'radial'; cx: number; cy: number; r: number }
);

/** A live text object (extension). Drawn above all paths; keeps the font name, not outlines. Exported as `<text data-vs-text="1">`. */
export interface VectorText {
  id: string; x: number; y: number; text: string; // text may hold '\n' line breaks
  fontFamily: string; fontSize: number; fontWeight: 'normal' | 'bold'; fontStyle: 'normal' | 'italic';
  anchor: 'start' | 'middle' | 'end'; fill: string; // fill is #rrggbb
  rotation?: number; // degrees about (x, y), -360..360, omitted when 0
  opacity?: number; // 0..1, omitted when 1
  back?: boolean; // painted behind all shapes instead of above them, omitted when false
}

/** Ruler guides in document units: `x` are vertical lines, `y` horizontal. */
export interface Guides { x: number[]; y: number[] }
export interface VectorDocument {
  width: number;
  height: number;
  paths: VectorPath[];
  /** Extension. Absent = no gradients (every file written before gradients existed). */
  gradients?: Gradient[];
  /** Extension. Optional display names of editor groups (key = `VectorPath.group`). Exported as `data-vs-group-name`. */
  groupNames?: Record<string, string>;
  /** Extension. Ruler guides (editor aid, not drawn in the export). Exported as `data-vs-guides` on the root `<svg>`. */
  guides?: Guides;
  /** Extension. Colour palette (editor aid). Exported as `data-vs-swatches="#rrggbb,..."` on the root `<svg>`. */
  swatches?: string[];
  /** Extension. Text objects, painted above all paths (no z-order among shapes). */
  texts?: VectorText[];
}

export const GRADIENT_LIMITS = Object.freeze({ maxGradients: 64, maxStops: 16 });

export const DEFAULT_STYLE: Style = Object.freeze({
  fill: '#000000', stroke: 'none', strokeWidth: 1, fillOpacity: 1, strokeOpacity: 1, opacity: 1,
  fillRule: 'nonzero', lineCap: 'butt', lineJoin: 'miter', miterLimit: 4, dashArray: [], dashOffset: 0, blendMode: 'normal', arrowStart: 'none', arrowEnd: 'none',
}) as Style;

export type Matrix = [number, number, number, number, number, number];
export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

export interface Diagnostic { severity: 'error' | 'warning'; message: string }

export const LIMITS = Object.freeze({ maxBytes: 8 * 1024 * 1024, maxNodes: 10_000, maxDepth: 64, maxSegments: 100_000 });
