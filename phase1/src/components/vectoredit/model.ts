/** UI boundary only. Adapt vectorcore at the host; handles are ABSOLUTE document coordinates. */
export interface VectorPoint { x: number; y: number }
export interface VectorNode extends VectorPoint {
  id: string;
  kind: 'corner' | 'smooth' | 'symmetric';
  in?: VectorPoint;
  out?: VectorPoint;
}
export interface VectorPath { id: string; nodes: VectorNode[]; closed: boolean }
export interface VectorDocument { width: number; height: number; paths: VectorPath[] }
export interface NodeRef { pathId: string; nodeId: string }
export type HandleSide = 'in' | 'out';
export interface VectorCommit {
  before: VectorDocument;
  after: VectorDocument;
  reason: 'pen' | 'move' | 'handle' | 'insert' | 'delete' | 'convert' | 'nudge' | 'close';
}
export const refKey = (ref: NodeRef) => JSON.stringify([ref.pathId, ref.nodeId]);
export const sameRef = (a: NodeRef, b: NodeRef) => a.pathId === b.pathId && a.nodeId === b.nodeId;
const plus = (a: VectorPoint, b: VectorPoint): VectorPoint => ({ x: a.x + b.x, y: a.y + b.y });
const lerp = (a: VectorPoint, b: VectorPoint, t: number): VectorPoint => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export function updateNode(doc: VectorDocument, ref: NodeRef, update: (node: VectorNode) => VectorNode): VectorDocument {
  return { ...doc, paths: doc.paths.map(p => p.id === ref.pathId ? { ...p, nodes: p.nodes.map(n => n.id === ref.nodeId ? update(n) : n) } : p) };
}
export function moveNodes(doc: VectorDocument, selection: NodeRef[], delta: VectorPoint): VectorDocument {
  const keys = new Set(selection.map(refKey));
  return { ...doc, paths: doc.paths.map(p => ({ ...p, nodes: p.nodes.map(n => keys.has(refKey({ pathId: p.id, nodeId: n.id }))
    ? { ...n, ...plus(n, delta), in: n.in && plus(n.in, delta), out: n.out && plus(n.out, delta) } : n) })) };
}
export function moveHandle(doc: VectorDocument, ref: NodeRef, side: HandleSide, point: VectorPoint, breakSymmetry = false): VectorDocument {
  return updateNode(doc, ref, n => {
    const other = side === 'in' ? 'out' : 'in';
    if (breakSymmetry || n.kind === 'corner') return { ...n, [side]: point, ...(breakSymmetry ? { kind: 'corner' as const } : {}) };
    const dx = point.x - n.x, dy = point.y - n.y, length = Math.hypot(dx, dy);
    const old = n[other];
    const oppositeLength = n.kind === 'symmetric' ? length : old ? Math.hypot(old.x - n.x, old.y - n.y) : length;
    return { ...n, [side]: point, ...(length ? { [other]: { x: n.x - dx / length * oppositeLength, y: n.y - dy / length * oppositeLength } } : {}) };
  });
}
export function penHandles(doc: VectorDocument, ref: NodeRef, point: VectorPoint): VectorDocument {
  return updateNode(doc, ref, n => ({ ...n, kind: 'smooth', out: point, in: { x: 2 * n.x - point.x, y: 2 * n.y - point.y } }));
}
export function convertNodes(doc: VectorDocument, selection: NodeRef[], kind: VectorNode['kind']): VectorDocument {
  const keys = new Set(selection.map(refKey));
  return { ...doc, paths: doc.paths.map(p => ({ ...p, nodes: p.nodes.map((n, i) => {
    if (!keys.has(refKey({ pathId: p.id, nodeId: n.id }))) return n;
    if (kind === 'corner') return { ...n, kind };
    if (n.out || n.in) {
      const reference = n.out ?? n.in!, side = n.out ? 'out' : 'in';
      return moveHandle({ width: 1, height: 1, paths: [{ id: p.id, closed: false, nodes: [{ ...n, kind }] }] }, { pathId: p.id, nodeId: n.id }, side, reference).paths[0].nodes[0];
    }
    const prev = p.nodes[i - 1] ?? (p.closed ? p.nodes.at(-1) : n);
    const next = p.nodes[i + 1] ?? (p.closed ? p.nodes[0] : n);
    let dx = next.x - prev!.x, dy = next.y - prev!.y;
    if (!dx && !dy) dx = 36;
    const delta = { x: dx / 6, y: dy / 6 };
    return { ...n, kind, in: { x: n.x - delta.x, y: n.y - delta.y }, out: plus(n, delta) };
  }) })) };
}
export function deleteNodes(doc: VectorDocument, selection: NodeRef[]): VectorDocument {
  const keys = new Set(selection.map(refKey));
  return { ...doc, paths: doc.paths.map(p => {
    const nodes = p.nodes.filter(n => !keys.has(refKey({ pathId: p.id, nodeId: n.id })));
    return { ...p, nodes, closed: p.closed && nodes.length > 2 };
  }).filter(p => p.nodes.length) };
}
export function selectInRect(doc: VectorDocument, start: VectorPoint, end: VectorPoint): NodeRef[] {
  return doc.paths.flatMap(p => p.nodes.filter(n => n.x >= Math.min(start.x, end.x) && n.x <= Math.max(start.x, end.x)
    && n.y >= Math.min(start.y, end.y) && n.y <= Math.max(start.y, end.y)).map(n => ({ pathId: p.id, nodeId: n.id })));
}
export function pathData(path: VectorPath): string {
  if (!path.nodes.length) return '';
  const first = path.nodes[0];
  let d = `M ${first.x} ${first.y}`;
  for (let i = 0; i < path.nodes.length - (path.closed ? 0 : 1); i++) d += ` ${segmentData(path, i)}`;
  return d + (path.closed ? ' Z' : '');
}
export function segmentData(path: VectorPath, i: number): string {
  const a = path.nodes[i], b = path.nodes[(i + 1) % path.nodes.length];
  const c = a.out ?? a, d = b.in ?? b;
  return `C ${c.x} ${c.y} ${d.x} ${d.y} ${b.x} ${b.y}`;
}
export function segmentPoint(path: VectorPath, i: number, t: number): VectorPoint {
  const a = path.nodes[i], b = path.nodes[(i + 1) % path.nodes.length];
  return lerp(lerp(lerp(a, a.out ?? a, t), lerp(a.out ?? a, b.in ?? b, t), t),
    lerp(lerp(a.out ?? a, b.in ?? b, t), lerp(b.in ?? b, b, t), t), t);
}
/** Hit location approximation only; insertion itself is exact de Casteljau subdivision. */
export function nearestSegmentT(path: VectorPath, i: number, point: VectorPoint): number {
  let best = 0.5, distance = Infinity;
  for (let j = 1; j < 100; j++) {
    const t = j / 100, p = segmentPoint(path, i, t), d = Math.hypot(point.x - p.x, point.y - p.y);
    if (d < distance) { distance = d; best = t; }
  }
  return best;
}
export function insertNode(doc: VectorDocument, pathId: string, i: number, t: number, id: string): VectorDocument {
  return { ...doc, paths: doc.paths.map(path => {
    if (path.id !== pathId || i < 0 || i >= path.nodes.length - (path.closed ? 0 : 1)) return path;
    t = Math.max(0.001, Math.min(0.999, t));
    const a = path.nodes[i], bi = (i + 1) % path.nodes.length, b = path.nodes[bi];
    const ab = lerp(a, a.out ?? a, t), bc = lerp(a.out ?? a, b.in ?? b, t), cd = lerp(b.in ?? b, b, t);
    const abc = lerp(ab, bc, t), bcd = lerp(bc, cd, t), point = lerp(abc, bcd, t);
    const curved = !!a.out || !!b.in;
    const nodes = path.nodes.map((n, j) => j === i ? { ...n, out: curved ? ab : n.out } : j === bi ? { ...n, in: curved ? cd : n.in } : n);
    // Collinear handles on inserted cubic nodes may have different lengths: preserve the curve.
    nodes.splice(i + 1, 0, { ...point, id, kind: 'smooth', ...(curved ? { in: abc, out: bcd } : {}) });
    return { ...path, nodes };
  }) };
}
export function appendNode(doc: VectorDocument, pathId: string, node: VectorNode): VectorDocument {
  const exists = doc.paths.some(p => p.id === pathId);
  return { ...doc, paths: exists ? doc.paths.map(p => p.id === pathId && !p.closed ? { ...p, nodes: [...p.nodes, node] } : p)
    : [...doc.paths, { id: pathId, nodes: [node], closed: false }] };
}

export function removeHandles(doc: VectorDocument, selection: NodeRef[]): VectorDocument {
  return selection.reduce((next, ref) => updateNode(next, ref, n => {
    const { in: _in, out: _out, ...anchor } = n; return { ...anchor, kind: 'corner' };
  }), doc);
}
