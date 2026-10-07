export interface Vec { x: number; y: number }

export type NodeKind = 'corner' | 'smooth';
/** Handles `in`/`out` are ABSOLUTE positions (same space as x,y). Missing handle = straight on that side. */
export interface VNode { id: string; x: number; y: number; kind: NodeKind; in?: Vec; out?: Vec }
export type FillRule = 'nonzero' | 'evenodd';
/** One contour per path. Segment i runs nodes[i] -> nodes[i+1]; if closed, the last runs back to nodes[0]. */
export interface VectorPath {
  id: string; closed: boolean; nodes: VNode[];
  fill?: string | null; stroke?: string | null; strokeWidth?: number; fillRule?: FillRule;
}
export interface VectorDocument { width: number; height: number; paths: VectorPath[] }

/** A cubic segment. c1/c2 equal their end point when the handle is missing (straight line). */
export interface Cubic { p0: Vec; c1: Vec; c2: Vec; p1: Vec }
export interface BBox { minX: number; minY: number; maxX: number; maxY: number }
export type HandleKind = 'in' | 'out';
export type JsonValue = string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export const emptyDocument = (width = 1024, height = 1024): VectorDocument => ({ width, height, paths: [] });
