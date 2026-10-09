import type { VectorDocument, VectorPath, VectorNode, Point } from '../../../lib/vectorio';
import { bbox, unionBBox, flatten, nearest } from '../../../lib/vectorcore/bezier';
import type { BBox } from '../../../lib/vectorcore/types';
import { convertNodes, deleteNodes, insertNode, moveHandle, moveNodes, removeHandles } from '../../vectoredit/model';
import type { NodeRef } from '../../vectoredit/model';
export type { NodeRef } from '../../vectoredit/model';
export type VectorTool = 'select' | 'node';
export interface VectorToolCommit { before: VectorDocument; after: VectorDocument; label: string }
export interface SelectionBox { x: number; y: number; width: number; height: number }
const finite = (...numbers: number[]) => { if (!numbers.every(Number.isFinite)) throw new RangeError('Coordinates must be finite.'); };

/** Compound contours are one painted object and must transform/select together. Hidden objects stay unselected. */
export function selectedPaths(doc: VectorDocument, ids: readonly string[]): VectorPath[] {
  const direct = new Set(ids), compounds = new Set(doc.paths.filter(p => direct.has(p.id) && !p.hidden && p.compound).map(p => p.compound));
  return doc.paths.filter(p => !p.hidden && (direct.has(p.id) || (p.compound && compounds.has(p.compound))));
}
export function pathBounds(path: VectorPath): BBox | null {
  if (!path.nodes.length) return null;
  let box: BBox | null = null;
  for (const n of path.nodes) box = unionBBox(box, { minX: n.x, maxX: n.x, minY: n.y, maxY: n.y });
  const count = path.nodes.length < 2 ? 0 : path.nodes.length - (path.closed ? 0 : 1);
  for (let i = 0; i < count; i++) {
    const a = path.nodes[i], b = path.nodes[(i + 1) % path.nodes.length];
    box = unionBBox(box, bbox({ p0: a, c1: a.out ?? a, c2: b.in ?? b, p1: b }));
  }
  return box;
}
export function selectionBounds(doc: VectorDocument, ids: readonly string[]): SelectionBox | null {
  let box: BBox | null = null;
  for (const p of selectedPaths(doc, ids)) { const b = pathBounds(p); if (b) box = unionBBox(box, b); }
  return box && { x: box.minX, y: box.minY, width: box.maxX - box.minX, height: box.maxY - box.minY };
}
export function selectPathsInRect(doc: VectorDocument, start: Point, end: Point, contain = false): string[] {
  finite(start.x, start.y, end.x, end.y);
  const l = Math.min(start.x, end.x), r = Math.max(start.x, end.x), t = Math.min(start.y, end.y), b = Math.max(start.y, end.y);
  const hits = doc.paths.filter(p => {
    if (p.hidden) return false; const box = pathBounds(p); if (!box) return false;
    return contain ? box.minX >= l && box.maxX <= r && box.minY >= t && box.maxY <= b
      : box.maxX >= l && box.minX <= r && box.maxY >= t && box.minY <= b;
  }).map(p => p.id);
  return selectedPaths(doc, hits).map(p => p.id);
}
export function togglePathSelection(doc: VectorDocument, ids: readonly string[], id: string, additive = false): string[] {
  const group = selectedPaths(doc, [id]).map(p => p.id);
  if (!additive) return group;
  const selected = new Set(ids), remove = group.some(key => selected.has(key));
  for (const key of group) { if (remove) selected.delete(key); else selected.add(key); }
  return [...selected];
}
function mapSelection(doc: VectorDocument, ids: readonly string[], transform: (p: Point) => Point): VectorDocument {
  const keys = new Set(selectedPaths(doc, ids).map(p => p.id));
  return { ...doc, paths: doc.paths.map(p => !keys.has(p.id) ? p : { ...p, nodes: p.nodes.map(n => ({ ...n, ...transform(n),
    ...(n.in ? { in: transform(n.in) } : {}), ...(n.out ? { out: transform(n.out) } : {}) })) }) };
}
export function translateSelection(doc: VectorDocument, ids: readonly string[], dx: number, dy: number): VectorDocument {
  finite(dx, dy); return mapSelection(doc, ids, p => ({ x: p.x + dx, y: p.y + dy }));
}
/** Scale around the requested origin. Stroke width stays unchanged, like a geometry-only transform. */
export function scaleSelection(doc: VectorDocument, ids: readonly string[], sx: number, sy: number, origin: Point): VectorDocument {
  finite(sx, sy, origin.x, origin.y);
  if (!sx || !sy) throw new RangeError('Scale cannot be zero.');
  return mapSelection(doc, ids, p => ({ x: origin.x + (p.x - origin.x) * sx, y: origin.y + (p.y - origin.y) * sy }));
}
export function rotateSelection(doc: VectorDocument, ids: readonly string[], degrees: number, origin?: Point): VectorDocument {
  finite(degrees); const b = selectionBounds(doc, ids); if (!b) return doc;
  const center = origin ?? { x: b.x + b.width / 2, y: b.y + b.height / 2 }; finite(center.x, center.y);
  const angle = degrees * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  return mapSelection(doc, ids, p => ({ x: center.x + (p.x - center.x) * cos - (p.y - center.y) * sin,
    y: center.y + (p.x - center.x) * sin + (p.y - center.y) * cos }));
}
export function resizeSelection(doc: VectorDocument, ids: readonly string[], width: number, height: number): VectorDocument {
  finite(width, height); if (width <= 0 || height <= 0) throw new RangeError('Width and height must be positive.');
  const box = selectionBounds(doc, ids); if (!box) return doc;
  if (!box.width || !box.height) throw new RangeError('A flat selection cannot be resized in both dimensions.');
  return scaleSelection(doc, ids, width / box.width, height / box.height, box);
}
export function deleteSelection(doc: VectorDocument, ids: readonly string[]): VectorDocument {
  const keys = new Set(selectedPaths(doc, ids).map(p => p.id)); return { ...doc, paths: doc.paths.filter(p => !keys.has(p.id)) };
}
// Reuse the tested node editor math. Spreads in these helpers preserve all additive SVG style/layer fields.
export function translateNodes(doc: VectorDocument, refs: NodeRef[], dx: number, dy: number): VectorDocument {
  finite(dx, dy); return moveNodes(doc, refs, { x: dx, y: dy }) as VectorDocument;
}
export function setNodeKind(doc: VectorDocument, refs: NodeRef[], kind: VectorNode['kind']): VectorDocument {
  return convertNodes(doc, refs, kind) as VectorDocument;
}
export function setNodeHandle(doc: VectorDocument, ref: NodeRef, side: 'in' | 'out', point: Point, breakSymmetry = false): VectorDocument {
  finite(point.x, point.y); return moveHandle(doc, ref, side, point, breakSymmetry) as VectorDocument;
}
export function deleteSelectedNodes(doc: VectorDocument, refs: NodeRef[]): VectorDocument { return deleteNodes(doc, refs) as VectorDocument; }
export function straightenNodes(doc: VectorDocument, refs: NodeRef[]): VectorDocument { return removeHandles(doc, refs) as VectorDocument; }
export function splitPathSegment(doc: VectorDocument, pathId: string, segment: number, t: number, id: string): VectorDocument {
  const path = doc.paths.find(p => p.id === pathId); finite(t);
  if (!path || !Number.isInteger(segment) || segment < 0 || segment >= path.nodes.length - (path.closed ? 0 : 1)) throw new RangeError('Invalid segment.');
  if (!(t > 0 && t < 1)) throw new RangeError('Split position must be inside the segment.');
  if (doc.paths.some(p => p.nodes.some(n => n.id === id))) throw new Error('Node identity already exists.');
  return insertNode(doc, pathId, segment, t, id) as VectorDocument;
}

/** Hit test uses SVG paint styles, topmost-first. Tolerance is in document units (screen pixels / zoom). */
export function hitTestObject(doc: VectorDocument, point: Point, tolerance = 5): string | null {
  finite(point.x, point.y, tolerance); if (tolerance < 0) throw new RangeError('Tolerance must be nonnegative.');
  for (let i = doc.paths.length - 1; i >= 0; i--) {
    const path = doc.paths[i]; if (path.hidden || path.style?.opacity === 0) continue;
    const contours = path.compound ? doc.paths.filter(p => p.compound === path.compound && !p.hidden) : [path];
    if ((path.style?.fill ?? '#000000') !== 'none' && path.style?.fillOpacity !== 0) {
      let crossings = 0, winding = 0;
      for (const contour of contours) {
        const poly = flattened(contour);
        if (poly.length < 3) continue;
        for (let j = 0; j < poly.length; j++) {
          const a = poly[j], b = poly[(j + 1) % poly.length];
          if ((a.y <= point.y) !== (b.y <= point.y)) {
            const x = a.x + (point.y - a.y) / (b.y - a.y) * (b.x - a.x);
            if (x > point.x) { crossings++; winding += b.y > a.y ? 1 : -1; }
          }
        }
      }
      if (path.style?.fillRule === 'evenodd' ? crossings % 2 === 1 : winding !== 0) return path.id;
    }
    const stroke = path.style?.stroke ?? 'none';
    if (stroke === 'none' || path.style?.strokeOpacity === 0) continue;
    const radius = tolerance + (path.style?.strokeWidth ?? 1) / 2;
    const count = path.nodes.length < 2 ? 0 : path.nodes.length - (path.closed ? 0 : 1);
    for (let j = 0; j < count; j++) {
      const a = path.nodes[j], b = path.nodes[(j + 1) % path.nodes.length];
      if (nearest({ p0: a, c1: a.out ?? a, c2: b.in ?? b, p1: b }, point).distance <= radius) return path.id;
    }
  }
  return null;
}
function flattened(path: VectorPath): Point[] {
  const points: Point[] = [], count = path.nodes.length < 2 ? 0 : path.nodes.length - (path.closed ? 0 : 1);
  for (let i = 0; i < count; i++) { const a = path.nodes[i], b = path.nodes[(i + 1) % path.nodes.length];
    const segment = flatten({ p0: a, c1: a.out ?? a, c2: b.in ?? b, p1: b }, 0.1); points.push(...(i ? segment.slice(1) : segment)); }
  return points;
}
