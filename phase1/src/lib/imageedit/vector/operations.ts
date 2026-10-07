import type { ImageOperation, JsonValue } from '../../image-editor/types';
import type { Matrix, NodeId, VectorNode, VectorScene } from './types';
import { VectorOperationRegistry, type VectorHandler } from './registry';
import { LIMITS, checkTree, isLocked, nodeId, nodeName, opacity, parentIndex, siblings, subtreeIds, validateNode, validateScene } from './scene';
import { geometryOf, geometryToSegments, matrix, num, validateGeometry } from './path';
import { mergeStyle, validateStylePatch } from './style';

export const VECTOR_OP_VERSION = 1;
type Params = ImageOperation['params'];
type Rec = Record<string, unknown>;

function rec(v: unknown, name: string, keys: readonly string[]): Rec {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new TypeError(`${name} must be an object`);
  for (const k of Object.keys(v)) if (!keys.includes(k)) throw new TypeError(`${name} has unknown key: ${k}`);
  return v as Rec;
}
function idList(v: unknown, name: string, min = 1): NodeId[] {
  if (!Array.isArray(v) || v.length < min || v.length > LIMITS.nodes) throw new TypeError(`${name} must be an array of ${min}..${LIMITS.nodes} ids`);
  const ids = v.map((x) => nodeId(x, `${name} item`));
  if (new Set(ids).size !== ids.length) throw new Error(`${name} has duplicate ids`);
  return ids;
}
function nullableId(v: unknown, name: string): NodeId | null { return v === null ? null : nodeId(v, name); }
function index(v: unknown): number { const n = num(v, 'index', 0, LIMITS.nodes); if (!Number.isInteger(n)) throw new RangeError('index must be an integer'); return n; }
const json = (v: unknown) => v as unknown as Params;
const need = (scene: VectorScene, id: NodeId): VectorNode => { if (!Object.hasOwn(scene.nodes, id)) throw new Error(`Unknown node: ${id}`); return scene.nodes[id]; };
function editable(scene: VectorScene, ids: readonly NodeId[], parents = parentIndex(scene)): void {
  for (const id of ids) { const n = need(scene, id); if (isLocked(scene, id, parents)) throw new Error(`Node is locked: ${n.name}`); }
}
const frozen = <T extends object>(o: T): T => Object.freeze(o);
function build(scene: VectorScene, nodes: Record<NodeId, VectorNode>, roots: readonly NodeId[] = scene.roots): VectorScene {
  return frozen({ ...scene, roots: Object.freeze([...roots]), nodes: frozen(nodes) });
}
function spliceChildren(scene: VectorScene, parentId: NodeId | null, ids: readonly NodeId[]): { roots: readonly NodeId[]; nodes: Record<NodeId, VectorNode> } {
  const nodes = { ...scene.nodes };
  if (parentId === null) return { roots: ids, nodes };
  const p = scene.nodes[parentId];
  if (p.kind !== 'group') throw new Error(`Not a group: ${parentId}`);
  nodes[parentId] = frozen({ ...p, children: frozen([...ids]) });
  return { roots: scene.roots, nodes };
}
function insertAt(scene: VectorScene, parentId: NodeId | null, at: number, add: readonly NodeId[]): { roots: readonly NodeId[]; nodes: Record<NodeId, VectorNode> } {
  const cur = siblings(scene, parentId);
  if (at > cur.length) throw new RangeError('index out of range');
  return spliceChildren(scene, parentId, [...cur.slice(0, at), ...add, ...cur.slice(at)]);
}
/** Removes ids from whichever parents hold them (does not delete the nodes themselves). */
function detach(scene: VectorScene, ids: ReadonlySet<NodeId>, parents: Map<NodeId, NodeId | null>): VectorScene {
  const nodes = { ...scene.nodes };
  const touched = new Set([...ids].map((i) => parents.get(i) ?? null));
  let roots = scene.roots;
  for (const p of touched) {
    if (p === null) { roots = roots.filter((r) => !ids.has(r)); continue; }
    const g = nodes[p]; if (g.kind === 'group') nodes[p] = frozen({ ...g, children: frozen(g.children.filter((c) => !ids.has(c))) });
  }
  return build(scene, nodes, roots);
}
const withoutDescendantsOf = (ids: readonly NodeId[], parents: Map<NodeId, NodeId | null>) => {
  const set = new Set(ids);
  return ids.filter((id) => { for (let p = parents.get(id); p; p = parents.get(p)) if (set.has(p)) return false; return true; });
};
function matrixList(v: unknown, name: string): { id: NodeId; matrix: Matrix }[] {
  if (!Array.isArray(v) || v.length < 1 || v.length > LIMITS.nodes) throw new TypeError(`${name} must be a non-empty array`);
  const out = v.map((e, i) => { const r = rec(e, `${name}[${i}]`, ['id', 'matrix']); return { id: nodeId(r.id), matrix: matrix(r.matrix) }; });
  if (new Set(out.map((o) => o.id)).size !== out.length) throw new Error(`${name} has duplicate ids`);
  return out;
}
function setNodes(scene: VectorScene, patch: Record<NodeId, VectorNode>): VectorScene { return build(scene, { ...scene.nodes, ...patch }); }

const INSERT: VectorHandler = {
  type: 'vector.insert', version: VECTOR_OP_VERSION,
  validate(p) {
    const r = rec(p, 'params', ['parentId', 'index', 'rootId', 'nodes']);
    const rootId = nodeId(r.rootId, 'rootId');
    if (!r.nodes || typeof r.nodes !== 'object' || Array.isArray(r.nodes)) throw new TypeError('nodes must be an object map');
    const nodes: Record<NodeId, VectorNode> = {};
    for (const [id, raw] of Object.entries(r.nodes)) { const n = validateNode(raw); if (n.id !== id) throw new Error(`Node key ${id} does not match its id`); nodes[id] = n; }
    checkTree([rootId], nodes, true);
    return json({ parentId: nullableId(r.parentId, 'parentId'), index: index(r.index), rootId, nodes });
  },
  apply(scene, p) {
    const { parentId, index: at, rootId, nodes: sub } = p as unknown as { parentId: NodeId | null; index: number; rootId: NodeId; nodes: Record<NodeId, VectorNode> };
    for (const id of Object.keys(sub)) if (Object.hasOwn(scene.nodes, id)) throw new Error(`Node ID collision: ${id}`);
    if (parentId !== null) { need(scene, parentId); editable(scene, [parentId]); }
    const r = insertAt(scene, parentId, at, [rootId]);
    return build(scene, { ...r.nodes, ...sub }, r.roots);
  },
};
const DELETE: VectorHandler = {
  type: 'vector.delete', version: VECTOR_OP_VERSION,
  validate: (p) => json({ ids: idList(rec(p, 'params', ['ids']).ids, 'ids') }),
  apply(scene, p) {
    const parents = parentIndex(scene), ids = (p as { ids: NodeId[] }).ids;
    editable(scene, ids, parents);
    const top = withoutDescendantsOf(ids, parents);
    const doomed = new Set(top.flatMap((id) => subtreeIds(scene, id)));
    const detached = detach(scene, new Set(top), parents);
    const nodes = { ...detached.nodes };
    for (const id of doomed) delete nodes[id];
    return build(scene, nodes, detached.roots);
  },
};
const TRANSFORM: VectorHandler = {
  type: 'vector.transform', version: VECTOR_OP_VERSION,
  validate: (p) => json({ nodes: matrixList(rec(p, 'params', ['nodes']).nodes, 'nodes') }),
  apply(scene, p) {
    const list = (p as unknown as { nodes: { id: NodeId; matrix: Matrix }[] }).nodes;
    editable(scene, list.map((l) => l.id));
    return setNodes(scene, Object.fromEntries(list.map(({ id, matrix: m }) => [id, frozen({ ...scene.nodes[id], transform: frozen([...m]) as unknown as Matrix }) as VectorNode])));
  },
};
const STYLE: VectorHandler = {
  type: 'vector.style', version: VECTOR_OP_VERSION,
  validate(p) { const r = rec(p, 'params', ['ids', 'patch']); return json({ ids: idList(r.ids, 'ids'), patch: validateStylePatch(r.patch) }); },
  apply(scene, p) {
    const { ids, patch } = p as unknown as { ids: NodeId[]; patch: Parameters<typeof mergeStyle>[1] };
    editable(scene, ids);
    return setNodes(scene, Object.fromEntries(ids.map((id) => {
      const n = scene.nodes[id];
      if (n.kind === 'group') throw new TypeError(`Groups have no shape style: ${n.name}`);
      return [id, frozen({ ...n, style: mergeStyle(n.style, patch) }) as VectorNode];
    })));
  },
};
const GEOMETRY: VectorHandler = {
  type: 'vector.geometry', version: VECTOR_OP_VERSION,
  validate(p) { const r = rec(p, 'params', ['id', 'geometry']); return json({ id: nodeId(r.id), geometry: validateGeometry(r.geometry) }); },
  apply(scene, p) {
    const { id, geometry } = p as unknown as { id: NodeId; geometry: { kind: string } };
    editable(scene, [id]);
    const n = scene.nodes[id];
    if (n.kind === 'group') throw new TypeError('Groups have no geometry');
    if (n.kind !== geometry.kind) throw new TypeError(`Geometry kind ${geometry.kind} does not match node kind ${n.kind}; use a bake batch to change kind`);
    return setNodes(scene, { [id]: frozen({ ...n, ...geometry }) as VectorNode });
  },
};
const REPARENT: VectorHandler = {
  type: 'vector.reparent', version: VECTOR_OP_VERSION,
  validate(p) {
    const r = rec(p, 'params', ['ids', 'parentId', 'index', 'nodes']);
    const ids = idList(r.ids, 'ids'), nodes = matrixList(r.nodes, 'nodes');
    if (nodes.length !== ids.length || nodes.some((n, i) => n.id !== ids[i])) throw new Error('nodes must list the same ids in the same order as ids');
    return json({ ids, parentId: nullableId(r.parentId, 'parentId'), index: index(r.index), nodes });
  },
  apply(scene, p) {
    const { ids, parentId, index: at, nodes: ms } = p as unknown as { ids: NodeId[]; parentId: NodeId | null; index: number; nodes: { id: NodeId; matrix: Matrix }[] };
    const parents = parentIndex(scene);
    editable(scene, ids, parents);
    if (withoutDescendantsOf(ids, parents).length !== ids.length) throw new Error('Cannot move a node together with its own descendant');
    if (parentId !== null) {
      const dest = need(scene, parentId);
      if (dest.kind !== 'group') throw new TypeError('Destination is not a group');
      editable(scene, [parentId], parents);
      for (const id of ids) if (subtreeIds(scene, id).includes(parentId)) throw new Error('Cannot move a node into itself or its descendants (cycle)');
    }
    const detached = detach(scene, new Set(ids), parents);
    const moved = { ...detached.nodes };
    for (const { id, matrix: m } of ms) moved[id] = frozen({ ...moved[id], transform: frozen([...m]) as unknown as Matrix }) as VectorNode;
    const base = build(scene, moved, detached.roots);
    const r = insertAt(base, parentId, at, ids);
    return build(scene, r.nodes, r.roots);
  },
};
const PROPERTIES: VectorHandler = {
  type: 'vector.properties', version: VECTOR_OP_VERSION,
  validate(p) {
    const r = rec(p, 'params', ['nodes']);
    if (!Array.isArray(r.nodes) || r.nodes.length < 1 || r.nodes.length > LIMITS.nodes) throw new TypeError('nodes must be a non-empty array');
    const out = r.nodes.map((e, i) => {
      const o = rec(e, `nodes[${i}]`, ['id', 'name', 'opacity', 'visible', 'locked']);
      const c: Rec = { id: nodeId(o.id) };
      if (o.name !== undefined) c.name = nodeName(o.name);
      if (o.opacity !== undefined) c.opacity = opacity(o.opacity);
      for (const k of ['visible', 'locked']) if (o[k] !== undefined) { if (typeof o[k] !== 'boolean') throw new TypeError(`${k} must be a boolean`); c[k] = o[k]; }
      if (Object.keys(c).length === 1) throw new TypeError('Each entry needs at least one property');
      return c;
    });
    if (new Set(out.map((o) => o.id)).size !== out.length) throw new Error('nodes has duplicate ids');
    return json({ nodes: out });
  },
  /** Allowed on locked nodes: this is how a node gets unlocked, renamed or hidden. */
  apply(scene, p) {
    const list = (p as unknown as { nodes: Rec[] }).nodes;
    return setNodes(scene, Object.fromEntries(list.map(({ id, ...patch }) => [id as string, frozen({ ...need(scene, id as string), ...patch }) as VectorNode])));
  },
};
const VIEWPORT: VectorHandler = {
  type: 'vector.viewport', version: VECTOR_OP_VERSION,
  validate(p) {
    const r = rec(p, 'params', ['viewBox', 'outputSize']);
    const s = validateScene({ viewBox: r.viewBox, outputSize: r.outputSize, roots: [], nodes: {} });
    return json({ viewBox: [...s.viewBox], outputSize: { ...s.outputSize } });
  },
  apply(scene, p) { const { viewBox, outputSize } = p as unknown as VectorScene; return frozen({ ...scene, viewBox: frozen([...viewBox]) as unknown as VectorScene['viewBox'], outputSize: frozen({ ...outputSize }) }); },
};
/** Bounded list of non-batch child envelopes, replayed atomically: any failing child rejects the whole batch. */
function batchHandler(registry: VectorOperationRegistry): VectorHandler {
  return {
    type: 'vector.batch', version: VECTOR_OP_VERSION,
    validate(p) {
      const r = rec(p, 'params', ['ops']);
      if (!Array.isArray(r.ops) || r.ops.length < 1 || r.ops.length > LIMITS.batch) throw new RangeError(`batch needs 1..${LIMITS.batch} operations`);
      const ops = r.ops.map((e, i) => {
        const o = rec(e, `ops[${i}]`, ['id', 'type', 'version', 'enabled', 'params']);
        if (typeof o.id !== 'string' || !o.id) throw new TypeError('child id must be a non-empty string');
        if (o.type === 'vector.batch') throw new TypeError('Batches cannot be nested');
        if (typeof o.enabled !== 'boolean') throw new TypeError('child enabled must be a boolean');
        const h = registry.get({ type: o.type as string, version: o.version as number });
        return { id: o.id, type: o.type, version: o.version, enabled: o.enabled, params: h.validate(o.params) };
      });
      return json({ ops });
    },
    apply(scene, p, ctx) {
      let cur = scene;
      for (const op of (p as unknown as { ops: ImageOperation[] }).ops) {
        if (!op.enabled) continue;
        ctx.signal?.throwIfAborted();
        cur = registry.get(op).apply(cur, op.params, ctx);
        checkTree(cur.roots, cur.nodes);
      }
      return cur;
    },
  };
}

export const SIMPLE_HANDLERS: readonly VectorHandler[] = [INSERT, DELETE, TRANSFORM, STYLE, GEOMETRY, REPARENT, PROPERTIES, VIEWPORT];
/** Explicit opt-in with rollback on partial failure; no global side effects. */
export function registerVectorOperations(registry: VectorOperationRegistry): () => void {
  const cleanup: (() => void)[] = [];
  try { for (const h of [...SIMPLE_HANDLERS, batchHandler(registry)]) cleanup.push(registry.register(h)); }
  catch (e) { for (const c of cleanup.reverse()) c(); throw e; }
  return () => { for (const c of cleanup) c(); };
}
export function createVectorRegistry(): VectorOperationRegistry { const r = new VectorOperationRegistry(); registerVectorOperations(r); return r; }

/** Envelope constructors. IDs (operation and node) are supplied by the caller; replay never generates IDs. */
export const vectorOp = (id: string, type: `vector.${string}`, params: Record<string, unknown>, enabled = true): ImageOperation =>
  ({ id, type, version: VECTOR_OP_VERSION, enabled, params: params as Params });
export const insertOp = (id: string, a: { parentId: NodeId | null; index: number; rootId: NodeId; nodes: Record<NodeId, VectorNode> }) => vectorOp(id, 'vector.insert', a);
export const deleteOp = (id: string, ids: readonly NodeId[]) => vectorOp(id, 'vector.delete', { ids });
export const transformOp = (id: string, nodes: readonly { id: NodeId; matrix: Matrix }[]) => vectorOp(id, 'vector.transform', { nodes });
export const styleOp = (id: string, ids: readonly NodeId[], patch: Record<string, unknown>) => vectorOp(id, 'vector.style', { ids, patch });
export const geometryOp = (id: string, nodeId_: NodeId, geometry: Record<string, unknown>) => vectorOp(id, 'vector.geometry', { id: nodeId_, geometry });
export const reparentOp = (id: string, a: { ids: readonly NodeId[]; parentId: NodeId | null; index: number; nodes: readonly { id: NodeId; matrix: Matrix }[] }) => vectorOp(id, 'vector.reparent', a);
export const propertiesOp = (id: string, nodes: readonly Record<string, JsonValue>[]) => vectorOp(id, 'vector.properties', { nodes });
export const viewportOp = (id: string, viewBox: readonly number[], outputSize: { width: number; height: number }) => vectorOp(id, 'vector.viewport', { viewBox, outputSize });
export const batchOp = (id: string, ops: readonly ImageOperation[]) => vectorOp(id, 'vector.batch', { ops });
/** Reorder within one parent without changing world appearance: a reparent to the same parent with unchanged matrices. */
export function reorderOp(id: string, scene: VectorScene, nodeId_: NodeId, to: number): ImageOperation {
  const parents = parentIndex(scene), parentId = parents.get(nodeId_) ?? null;
  need(scene, nodeId_);
  const sibs = siblings(scene, parentId);
  if (!Number.isInteger(to) || to < 0 || to >= sibs.length) throw new RangeError('to out of range');
  return reparentOp(id, { ids: [nodeId_], parentId, index: to, nodes: [{ id: nodeId_, matrix: scene.nodes[nodeId_].transform }] });
}
/**
 * Explicit flatten/bake: replaces a primitive with an equivalent path node (new id) at the same place in one atomic batch.
 * Source parametric geometry is not kept in the new node. Rejects locked nodes at build time, like replay would.
 */
export function bakeToPathOp(id: string, scene: VectorScene, targetId: NodeId, newNodeId: NodeId): ImageOperation {
  const parents = parentIndex(scene), n = need(scene, targetId);
  if (n.kind === 'group') throw new TypeError('Groups cannot be baked');
  if (isLocked(scene, targetId, parents)) throw new Error(`Node is locked: ${n.name}`);
  const parentId = parents.get(targetId) ?? null, at = siblings(scene, parentId).indexOf(targetId);
  const path = validateNode({ id: newNodeId, kind: 'path', name: n.name, transform: n.transform, opacity: n.opacity, visible: n.visible, locked: n.locked, segments: geometryToSegments(geometryOf(n)), style: n.style });
  return batchOp(id, [
    insertOp(`${id}-i`, { parentId, index: at, rootId: newNodeId, nodes: { [newNodeId]: path } }),
    deleteOp(`${id}-d`, [targetId]),
  ]);
}
