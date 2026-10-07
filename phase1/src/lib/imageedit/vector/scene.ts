import type { Matrix, NodeId, VectorNode, VectorScene } from './types';
import { IDENTITY, multiply } from './math';
import { GEOMETRY_KEYS, matrix, num, validateGeometry } from './path';
import { validateStyle } from './style';

export const LIMITS = { nodes: 10_000, depth: 64, segments: 100_000, operations: 5_000, batch: 256, name: 200 } as const;
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const DANGEROUS = new Set(['__proto__', 'constructor', 'prototype', 'hasOwnProperty', 'toString', 'valueOf']);
export function nodeId(v: unknown, name = 'id'): NodeId {
  if (typeof v !== 'string' || !ID.test(v) || DANGEROUS.has(v)) throw new TypeError(`${name} must be an opaque id (1-64 of A-Z a-z 0-9 _ -)`);
  return v;
}
export function nodeName(v: unknown): string {
  if (typeof v !== 'string' || v.length === 0 || v.length > LIMITS.name) throw new TypeError(`name must be 1..${LIMITS.name} characters`);
  return v;
}
export function opacity(v: unknown): number { return num(v, 'opacity', 0, 1); }
function bool(v: unknown, name: string): boolean { if (typeof v !== 'boolean') throw new TypeError(`${name} must be a boolean`); return v; }

const COMMON = ['id', 'name', 'transform', 'opacity', 'visible', 'locked'] as const;
/** Validates one node (children are ids only; tree checks happen in validateScene). Output is frozen and detached. */
export function validateNode(input: unknown): VectorNode {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('node must be an object');
  const n = input as Record<string, unknown>;
  const common = { id: nodeId(n.id), name: nodeName(n.name), transform: matrix(n.transform, 'transform'), opacity: opacity(n.opacity), visible: bool(n.visible, 'visible'), locked: bool(n.locked, 'locked') };
  if (n.kind === 'group') {
    for (const k of Object.keys(n)) if (k !== 'kind' && k !== 'children' && !(COMMON as readonly string[]).includes(k)) throw new TypeError(`group has unknown key: ${k}`);
    if (!Array.isArray(n.children) || n.children.length > LIMITS.nodes) throw new TypeError('children must be an array of ids');
    return Object.freeze({ ...common, kind: 'group' as const, children: Object.freeze(n.children.map((c) => nodeId(c, 'child id'))) });
  }
  if (typeof n.kind !== 'string' || !Object.hasOwn(GEOMETRY_KEYS, n.kind)) throw new TypeError('Unknown node kind');
  for (const k of Object.keys(n)) if (k !== 'kind' && k !== 'style' && !(COMMON as readonly string[]).includes(k) && !GEOMETRY_KEYS[n.kind as keyof typeof GEOMETRY_KEYS].includes(k)) throw new TypeError(`${n.kind} has unknown key: ${k}`);
  const geometry = validateGeometry(Object.fromEntries(Object.entries(n).filter(([k]) => k === 'kind' || GEOMETRY_KEYS[n.kind as keyof typeof GEOMETRY_KEYS].includes(k))));
  return Object.freeze({ ...common, ...geometry, style: validateStyle(n.style) }) as VectorNode;
}

/** Validates a flat node map plus root list as a tree. Returns the parent index (child id -> parent id or null for roots). */
export function checkTree(roots: readonly NodeId[], nodes: Readonly<Record<NodeId, VectorNode>>, requireAll = true): Map<NodeId, NodeId | null> {
  const parent = new Map<NodeId, NodeId | null>();
  const ids = Object.keys(nodes);
  if (ids.length > LIMITS.nodes) throw new RangeError(`Too many nodes (max ${LIMITS.nodes})`);
  let segments = 0;
  for (const id of ids) { if (nodes[id].id !== id) throw new Error(`Node key ${id} does not match its id`); const n = nodes[id]; if (n.kind === 'path') segments += n.segments.length; }
  if (segments > LIMITS.segments) throw new RangeError(`Too many path segments (max ${LIMITS.segments})`);
  const visit = (id: NodeId, par: NodeId | null, depth: number) => {
    if (depth > LIMITS.depth) throw new RangeError(`Tree too deep (max ${LIMITS.depth})`);
    if (!Object.hasOwn(nodes, id)) throw new Error(`Dangling node reference: ${id}`);
    if (parent.has(id)) throw new Error(`Node appears more than once or forms a cycle: ${id}`);
    parent.set(id, par);
    const n = nodes[id];
    if (n.kind === 'group') for (const c of n.children) visit(c, id, depth + 1);
  };
  for (const r of roots) visit(r, null, 1);
  if (requireAll && parent.size !== ids.length) throw new Error('Unreachable nodes in scene');
  return parent;
}
export function validateScene(input: unknown): VectorScene {
  if (!input || typeof input !== 'object') throw new TypeError('scene must be an object');
  const s = input as Record<string, any>;
  const vb = s.viewBox;
  if (!Array.isArray(vb) || vb.length !== 4) throw new TypeError('viewBox must have 4 numbers');
  const viewBox = [num(vb[0], 'viewBox.x'), num(vb[1], 'viewBox.y'), num(vb[2], 'viewBox.width', 1e-6), num(vb[3], 'viewBox.height', 1e-6)] as const;
  const os = s.outputSize;
  if (!os || typeof os !== 'object') throw new TypeError('outputSize is required');
  const outputSize = Object.freeze({ width: num(os.width, 'outputSize.width', 1e-6, 100_000), height: num(os.height, 'outputSize.height', 1e-6, 100_000) });
  if (!Array.isArray(s.roots) || !s.nodes || typeof s.nodes !== 'object' || Array.isArray(s.nodes)) throw new TypeError('roots and nodes are required');
  const nodes: Record<NodeId, VectorNode> = {};
  for (const [id, raw] of Object.entries(s.nodes)) { const node = validateNode(raw); if (node.id !== id) throw new Error(`Node key ${id} does not match its id`); nodes[id] = node; }
  const roots = Object.freeze(s.roots.map((r: unknown) => nodeId(r, 'root id')));
  Object.freeze(nodes);
  checkTree(roots, nodes);
  return Object.freeze({ viewBox: Object.freeze(viewBox) as unknown as VectorScene['viewBox'], outputSize, roots, nodes });
}
export function createScene(width: number, height: number): VectorScene {
  return validateScene({ viewBox: [0, 0, width, height], outputSize: { width, height }, roots: [], nodes: {} });
}
export const emptyNodeFields = { transform: IDENTITY, opacity: 1, visible: true, locked: false } as const;

/** Derived, never serialized. */
export const parentIndex = (scene: VectorScene) => checkTree(scene.roots, scene.nodes);
export function siblings(scene: VectorScene, parentId: NodeId | null): readonly NodeId[] {
  if (parentId === null) return scene.roots;
  const p = scene.nodes[parentId];
  if (!p || p.kind !== 'group') throw new Error(`Not a group: ${parentId}`);
  return p.children;
}
export function worldMatrix(scene: VectorScene, id: NodeId, parents: Map<NodeId, NodeId | null> = parentIndex(scene)): Matrix {
  const chain: NodeId[] = [];
  for (let cur: NodeId | null | undefined = id; cur; cur = parents.get(cur)) chain.push(cur);
  if (chain.length === 0 || !Object.hasOwn(scene.nodes, id)) throw new Error(`Unknown node: ${id}`);
  return chain.reverse().reduce<Matrix>((acc, nid) => multiply(acc, scene.nodes[nid].transform), IDENTITY);
}
/** Own lock or any ancestor group lock. Editor metadata, not a security boundary. */
export function isLocked(scene: VectorScene, id: NodeId, parents: Map<NodeId, NodeId | null> = parentIndex(scene)): boolean {
  for (let cur: NodeId | null | undefined = id; cur; cur = parents.get(cur)) if (scene.nodes[cur].locked) return true;
  return false;
}
export function subtreeIds(scene: VectorScene, id: NodeId): NodeId[] {
  const out: NodeId[] = [], stack = [id];
  while (stack.length) { const cur = stack.pop()!; out.push(cur); const n = scene.nodes[cur]; if (n.kind === 'group') stack.push(...n.children); }
  return out;
}
export interface OutlineRow { readonly id: NodeId; readonly name: string; readonly kind: VectorNode['kind']; readonly depth: number; readonly parentId: NodeId | null; readonly index: number; readonly siblingCount: number; readonly visible: boolean; readonly locked: boolean; readonly lockedByAncestor: boolean }
/** Depth-first rows for a layers panel, top-most (last child, painted last) first. */
export function outline(scene: VectorScene): OutlineRow[] {
  const rows: OutlineRow[] = [];
  const walk = (ids: readonly NodeId[], parentId: NodeId | null, depth: number, ancLocked: boolean) => {
    for (let i = ids.length - 1; i >= 0; i--) {
      const n = scene.nodes[ids[i]];
      rows.push({ id: n.id, name: n.name, kind: n.kind, depth, parentId, index: i, siblingCount: ids.length, visible: n.visible, locked: n.locked, lockedByAncestor: ancLocked });
      if (n.kind === 'group') walk(n.children, n.id, depth + 1, ancLocked || n.locked);
    }
  };
  walk(scene.roots, null, 0, false);
  return rows;
}
