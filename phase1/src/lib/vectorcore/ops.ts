import { segmentCount, splitSegment } from './path';
import { documentFromJSON, pathFromJSON } from './serialize';
import type { HandleKind, JsonValue, VNode, Vec, VectorDocument, VectorPath } from './types';

/** Same shape as image-editor ImageOperation, so a host can store both in one history list. */
export interface VectorOperation {
  readonly id: string;
  readonly type: string;
  readonly version: number;
  readonly enabled: boolean;
  readonly params: Readonly<Record<string, JsonValue>>;
}
/** Registry handler. apply() is pure: it returns a new document and never mutates the input. */
export interface VectorOpHandler {
  readonly type: string;
  readonly version: number;
  /** Returns canonical detached JSON params or throws. Shape checks only; semantic checks (targets exist) run in apply. */
  validate(params: unknown): VectorOperation['params'];
  apply(doc: VectorDocument, params: VectorOperation['params'], context?: { signal?: AbortSignal }): VectorDocument;
}

export const VECTOR_OP_VERSION = 1;
export const VECTOR_OP_TYPES = [
  'vector.path.add-path', 'vector.path.delete-path', 'vector.path.add-node', 'vector.path.move-node', 'vector.path.move-handle', 'vector.path.set-node-kind',
  'vector.path.delete-node', 'vector.path.split-segment', 'vector.path.set-closed', 'vector.path.translate-path', 'vector.path.set-style',
  'vector.path.batch',
] as const;
export type VectorOpType = typeof VECTOR_OP_TYPES[number];

export class VectorOperationRegistry {
  private handlers = new Map<string, VectorOpHandler>();
  register(h: VectorOpHandler): () => void {
    const key = `${h.type}@${h.version}`;
    if (this.handlers.has(key)) throw new Error(`Duplicate vector op ${key}`);
    this.handlers.set(key, h);
    return () => { this.handlers.delete(key); };
  }
  get(op: Pick<VectorOperation, 'type' | 'version'>): VectorOpHandler {
    const h = this.handlers.get(`${op.type}@${op.version}`);
    if (!h) throw new Error(`Unsupported vector op ${op.type}@${op.version}`);
    return h;
  }
  has(type: string): boolean { return [...this.handlers.keys()].some((k) => k.startsWith(`${type}@`)); }
}

type Params = VectorOperation['params'];
const s = (p: Params, k: string): string => { const v = p[k]; if (typeof v !== 'string' || !v) throw new TypeError(`${k} must be a non-empty string`); return v; };
const n = (p: Params, k: string): number => { const v = p[k]; if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw new TypeError(`${k} must be a non-negative integer`); return v; };
const vec = (p: Params, k: string): Vec => { const v = p[k]; if (typeof v !== 'object' || v === null || Array.isArray(v) || typeof (v as { x?: unknown }).x !== 'number' || typeof (v as { y?: unknown }).y !== 'number' || !Number.isFinite((v as { x: number }).x) || !Number.isFinite((v as { y: number }).y)) throw new TypeError(`${k} must be finite {x,y}`); return { x: (v as { x: number }).x, y: (v as { y: number }).y }; };
const sv = (v: Vec | undefined, d: Vec): Vec | undefined => (v ? { x: v.x + d.x, y: v.y + d.y } : undefined);
const shiftNode = (a: VNode, d: Vec): VNode => ({ ...a, x: a.x + d.x, y: a.y + d.y, ...(a.in ? { in: sv(a.in, d) } : {}), ...(a.out ? { out: sv(a.out, d) } : {}) });

function mapPath(doc: VectorDocument, id: string, fn: (p: VectorPath) => VectorPath): VectorDocument {
  const i = doc.paths.findIndex((p) => p.id === id);
  if (i < 0) throw new Error(`Unknown path ${id}`);
  const paths = doc.paths.slice(); paths[i] = fn(doc.paths[i]);
  return { ...doc, paths };
}
const nodeIndex = (p: VectorPath, params: Params): number => {
  const id = s(params, 'nodeId'); const i = p.nodes.findIndex((x) => x.id === id);
  if (i < 0) throw new Error(`Unknown node ${id}`);
  return i;
};

const handlers: Record<Exclude<VectorOpType, 'vector.path.batch'>, (doc: VectorDocument, p: Params) => VectorDocument> = {
  'vector.path.add-path'(doc, p) {
    const path = pathFromJSON(p.path);
    if (doc.paths.some((x) => x.id === path.id)) throw new Error(`Duplicate path ${path.id}`);
    const at = p.index === undefined ? doc.paths.length : n(p, 'index');
    const paths = doc.paths.slice(); paths.splice(Math.min(at, paths.length), 0, path);
    return { ...doc, paths };
  },
  'vector.path.delete-path'(doc, p) {
    const id = s(p, 'pathId');
    if (!doc.paths.some((x) => x.id === id)) throw new Error(`Unknown path ${id}`);
    return { ...doc, paths: doc.paths.filter((x) => x.id !== id) };
  },
  'vector.path.add-node'(doc, p) {
    const node = pathFromJSON({ id: 'tmp', nodes: [p.node] }).nodes[0];
    return mapPath(doc, s(p, 'pathId'), (path) => {
      if (path.nodes.some((x) => x.id === node.id)) throw new Error(`Duplicate node ${node.id}`);
      const at = p.index === undefined ? path.nodes.length : n(p, 'index');
      if (at > path.nodes.length) throw new RangeError('node index out of range');
      const nodes = path.nodes.slice(); nodes.splice(at, 0, node);
      return { ...path, nodes };
    });
  },
  /** Moves the node and both handles together. */
  'vector.path.move-node'(doc, p) {
    const d = vec(p, 'delta');
    return mapPath(doc, s(p, 'pathId'), (path) => { const i = nodeIndex(path, p); const nodes = path.nodes.slice(); nodes[i] = shiftNode(path.nodes[i], d); return { ...path, nodes }; });
  },
  /** to: absolute. Smooth nodes mirror the opposite handle unless mirror=false; corner nodes only if mirror=true. */
  'vector.path.move-handle'(doc, p) {
    const kind = s(p, 'handle') as HandleKind, to = vec(p, 'to');
    if (kind !== 'in' && kind !== 'out') throw new TypeError('handle must be in|out');
    return mapPath(doc, s(p, 'pathId'), (path) => {
      const i = nodeIndex(path, p), a = path.nodes[i];
      const mirror = typeof p.mirror === 'boolean' ? p.mirror : a.kind === 'smooth';
      const next: VNode = { ...a, [kind]: to };
      if (mirror) next[kind === 'in' ? 'out' : 'in'] = { x: 2 * a.x - to.x, y: 2 * a.y - to.y };
      const nodes = path.nodes.slice(); nodes[i] = next;
      return { ...path, nodes };
    });
  },
  'vector.path.set-node-kind'(doc, p) {
    const kind = s(p, 'kind'); if (kind !== 'corner' && kind !== 'smooth') throw new TypeError('kind must be corner|smooth');
    return mapPath(doc, s(p, 'pathId'), (path) => { const i = nodeIndex(path, p); const nodes = path.nodes.slice(); nodes[i] = { ...path.nodes[i], kind }; return { ...path, nodes }; });
  },
  'vector.path.delete-node'(doc, p) {
    return mapPath(doc, s(p, 'pathId'), (path) => { const i = nodeIndex(path, p); return { ...path, nodes: path.nodes.filter((_, k) => k !== i) }; });
  },
  'vector.path.split-segment'(doc, p) {
    const i = n(p, 'segment'), t = p.t;
    if (typeof t !== 'number') throw new TypeError('t must be a number');
    return mapPath(doc, s(p, 'pathId'), (path) => { if (i >= segmentCount(path)) throw new RangeError('segment index out of range'); return splitSegment(path, i, t, s(p, 'newNodeId')); });
  },
  'vector.path.set-closed'(doc, p) {
    if (typeof p.closed !== 'boolean') throw new TypeError('closed must be boolean');
    const closed = p.closed;
    return mapPath(doc, s(p, 'pathId'), (path) => ({ ...path, closed }));
  },
  'vector.path.translate-path'(doc, p) {
    const d = vec(p, 'delta');
    return mapPath(doc, s(p, 'pathId'), (path) => ({ ...path, nodes: path.nodes.map((a) => shiftNode(a, d)) }));
  },
  'vector.path.set-style'(doc, p) {
    const patch = p.style;
    if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) throw new TypeError('style must be an object');
    const allowed = ['fill', 'stroke', 'strokeWidth', 'fillRule'];
    for (const k of Object.keys(patch)) if (!allowed.includes(k)) throw new TypeError(`unknown style key ${k}`);
    return mapPath(doc, s(p, 'pathId'), (path) => pathFromJSON({ ...path, ...(patch as object) }));
  },
};

/** Detach + reject non-finite numbers / dangerous keys. */
function detach(v: unknown, depth = 0): JsonValue {
  if (depth > 32) throw new RangeError('params nested too deeply');
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw new TypeError('params must be finite'); return v; }
  if (Array.isArray(v)) return v.map((x) => detach(x, depth + 1));
  if (typeof v === 'object') {
    const out: Record<string, JsonValue> = {};
    for (const [k, x] of Object.entries(v as object)) { if (k === '__proto__' || k === 'constructor' || k === 'prototype') throw new TypeError(`forbidden key ${k}`); out[k] = detach(x, depth + 1); }
    return out;
  }
  throw new TypeError('params must be JSON');
}
const MAX_BATCH = 256;
const abortErr = () => Object.assign(new Error('Aborted'), { name: 'AbortError' });

export const VECTOR_HANDLERS: readonly VectorOpHandler[] = VECTOR_OP_TYPES.map((type) => ({
  type, version: VECTOR_OP_VERSION,
  validate(params: unknown) {
    const p = detach(params) as Record<string, JsonValue>;
    if (typeof p !== 'object' || p === null || Array.isArray(p)) throw new TypeError('params must be an object');
    if (type === 'vector.path.batch') {
      const ops = p.ops;
      if (!Array.isArray(ops) || ops.length === 0 || ops.length > MAX_BATCH) throw new RangeError(`ops must have 1..${MAX_BATCH} entries`);
      for (const c of ops as unknown[]) {
        const o = c as Partial<VectorOperation>;
        if (!o || typeof o.type !== 'string' || o.type === 'vector.path.batch' || !(VECTOR_OP_TYPES as readonly string[]).includes(o.type)) throw new TypeError('batch children must be non-batch vector ops');
        if (o.version !== VECTOR_OP_VERSION || typeof o.params !== 'object') throw new TypeError('bad batch child');
      }
    }
    return p;
  },
  apply(doc, params, context) {
    context?.signal?.throwIfAborted?.();
    if (type === 'vector.path.batch') {
      let d = doc;
      for (const c of params.ops as unknown as VectorOperation[]) { if (context?.signal?.aborted) throw abortErr(); d = handlers[c.type as Exclude<VectorOpType, 'vector.path.batch'>](d, c.params); }
      return d;
    }
    return handlers[type as Exclude<VectorOpType, 'vector.path.batch'>](doc, params);
  },
}));

/** Explicit opt-in like registerFilterOps. Returns a cleanup that removes only these registrations. */
export function registerVectorOps(registry: VectorOperationRegistry): () => void {
  const cleanups = VECTOR_HANDLERS.map((h) => registry.register(h));
  return () => cleanups.forEach((c) => c());
}
export function createVectorRegistry(): VectorOperationRegistry { const r = new VectorOperationRegistry(); registerVectorOps(r); return r; }

export function newVectorOperation(id: string, type: VectorOpType, params: VectorOperation['params']): VectorOperation {
  if (!(VECTOR_OP_TYPES as readonly string[]).includes(type)) throw new TypeError('Unknown vector op');
  return { id, type, version: VECTOR_OP_VERSION, enabled: true, params };
}

/**
 * Deterministic replay. Validates every op (including disabled ones: unique ids, known type@version, params shape)
 * before applying enabled ones in order. Each result is re-validated; any failure rejects the whole replay
 * (caller keeps its last valid document). Never mutates `base`.
 */
export function replay(base: VectorDocument, ops: readonly VectorOperation[], registry: VectorOperationRegistry = createVectorRegistry(), signal?: AbortSignal): VectorDocument {
  const seen = new Set<string>();
  const validated = ops.map((op) => {
    if (seen.has(op.id)) throw new Error(`Duplicate operation id ${op.id}`);
    seen.add(op.id);
    const h = registry.get(op);
    return { op, h, params: h.validate(op.params) };
  });
  let doc = base;
  for (const { op, h, params } of validated) {
    signal?.throwIfAborted();
    if (!op.enabled) continue;
    doc = documentFromJSON(h.apply(doc, params, { signal }));
    signal?.throwIfAborted();
  }
  return doc;
}

/** Undo/redo helper: state at `cursor` ops applied, always recomputed from base (no inverse ops needed). */
export class VectorHistory {
  private ops: VectorOperation[] = [];
  private cursor = 0;
  constructor(readonly base: VectorDocument, private registry = createVectorRegistry()) {}
  get document(): VectorDocument { return replay(this.base, this.ops.slice(0, this.cursor), this.registry); }
  get operations(): readonly VectorOperation[] { return this.ops.slice(0, this.cursor); }
  get canUndo(): boolean { return this.cursor > 0; }
  get canRedo(): boolean { return this.cursor < this.ops.length; }
  /** Validates by applying first; a failing op leaves history untouched. */
  push(op: VectorOperation): VectorDocument {
    const next = replay(this.base, [...this.ops.slice(0, this.cursor), op], this.registry);
    this.ops = this.ops.slice(0, this.cursor); this.ops.push(op); this.cursor++;
    return next;
  }
  undo(): VectorDocument { if (this.canUndo) this.cursor--; return this.document; }
  redo(): VectorDocument { if (this.canRedo) this.cursor++; return this.document; }
}
