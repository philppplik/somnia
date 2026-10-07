import type { JsonValue, VectorLayer, VectorOperation, VectorState } from './types';
import { DEFAULT_STYLE, normalizeShape, normalizeStyle, shapeToPath } from './shapes';

export const VECTOR_OP_VERSION = 1;
export type VectorParams = VectorOperation['params'];
export interface VectorOpHandler {
  readonly type: string;
  readonly version: number;
  /** Pure: returns a new state, never mutates the input. Throws on invalid params or unknown layers. */
  apply(state: VectorState, params: VectorParams): VectorState;
}
/** Same registry shape as the image OperationRegistry: `type@version` keys, cleanup function on register. */
export class VectorOpRegistry {
  private handlers = new Map<string, VectorOpHandler>();
  register(handler: VectorOpHandler): () => void {
    const key = `${handler.type}@${handler.version}`;
    if (this.handlers.has(key)) throw new Error(`Vector handler already registered: ${key}`);
    this.handlers.set(key, handler);
    return () => { if (this.handlers.get(key) === handler) this.handlers.delete(key); };
  }
  get(op: Pick<VectorOperation, 'type' | 'version'>): VectorOpHandler {
    const h = this.handlers.get(`${op.type}@${op.version}`);
    if (!h) throw new Error(`Unsupported vector operation: ${op.type}@${op.version}`);
    return h;
  }
}

function str(v: unknown, name: string, max = 200): string {
  if (typeof v !== 'string' || v.length === 0 || v.length > max) throw new TypeError(`${name} must be a non-empty string up to ${max} chars`);
  return v;
}
function bool(v: unknown, name: string): boolean {
  if (typeof v !== 'boolean') throw new TypeError(`${name} must be a boolean`);
  return v;
}
function indexOf(state: VectorState, id: unknown): number {
  const i = state.findIndex((l) => l.id === str(id, 'id'));
  if (i < 0) throw new Error(`Unknown layer: ${String(id)}`);
  return i;
}
function unlocked(state: VectorState, id: unknown): number {
  const i = indexOf(state, id);
  if (state[i].locked) throw new Error(`Layer is locked: ${state[i].name}`);
  return i;
}
const replaceAt = (state: VectorState, i: number, layer: VectorLayer): VectorState => state.map((l, j) => (j === i ? layer : l));

export const VECTOR_HANDLERS: readonly VectorOpHandler[] = [
  { type: 'layer.add', version: VECTOR_OP_VERSION, apply(state, p) {
    const raw = p.layer as Record<string, unknown> | undefined;
    if (!raw || typeof raw !== 'object') throw new TypeError('layer is required');
    const id = str(raw.id, 'layer.id');
    if (state.some((l) => l.id === id)) throw new Error(`Duplicate layer ID: ${id}`);
    const layer: VectorLayer = Object.freeze({
      id, name: raw.name === undefined ? `Layer ${state.length + 1}` : str(raw.name, 'name'),
      visible: raw.visible === undefined ? true : bool(raw.visible, 'visible'),
      locked: raw.locked === undefined ? false : bool(raw.locked, 'locked'),
      shape: normalizeShape(raw.shape), style: normalizeStyle(raw.style, DEFAULT_STYLE),
    });
    const at = p.index === undefined ? state.length : Number(p.index);
    if (!Number.isInteger(at) || at < 0 || at > state.length) throw new RangeError('index out of range');
    return [...state.slice(0, at), layer, ...state.slice(at)];
  } },
  { type: 'layer.update', version: VECTOR_OP_VERSION, apply(state, p) {
    const i = unlocked(state, p.id);
    if (p.shape === undefined && p.style === undefined) throw new TypeError('layer.update needs shape or style');
    const cur = state[i];
    const shape = p.shape === undefined ? cur.shape : normalizeShape(p.shape);
    if (p.shape !== undefined && cur.shape.kind !== shape.kind) throw new TypeError('Use shape.toPath to change a shape kind');
    return replaceAt(state, i, { ...cur, shape, style: p.style === undefined ? cur.style : normalizeStyle(p.style, cur.style) });
  } },
  { type: 'layer.remove', version: VECTOR_OP_VERSION, apply(state, p) { const i = unlocked(state, p.id); return state.filter((_, j) => j !== i); } },
  { type: 'layer.reorder', version: VECTOR_OP_VERSION, apply(state, p) {
    const i = indexOf(state, p.id), to = Number(p.to);
    if (!Number.isInteger(to) || to < 0 || to >= state.length) throw new RangeError('to out of range');
    const next = [...state]; const [moved] = next.splice(i, 1); next.splice(to, 0, moved); return next;
  } },
  { type: 'layer.rename', version: VECTOR_OP_VERSION, apply(state, p) { const i = indexOf(state, p.id); return replaceAt(state, i, { ...state[i], name: str(p.name, 'name') }); } },
  { type: 'layer.setVisible', version: VECTOR_OP_VERSION, apply(state, p) { const i = indexOf(state, p.id); return replaceAt(state, i, { ...state[i], visible: bool(p.visible, 'visible') }); } },
  { type: 'layer.setLocked', version: VECTOR_OP_VERSION, apply(state, p) { const i = indexOf(state, p.id); return replaceAt(state, i, { ...state[i], locked: bool(p.locked, 'locked') }); } },
  { type: 'shape.toPath', version: VECTOR_OP_VERSION, apply(state, p) { const i = unlocked(state, p.id); return replaceAt(state, i, { ...state[i], shape: shapeToPath(state[i].shape) }); } },
];

export function registerVectorOps(registry: VectorOpRegistry): () => void {
  const cleanup: (() => void)[] = [];
  try { for (const h of VECTOR_HANDLERS) cleanup.push(registry.register(h)); }
  catch (e) { for (const c of cleanup.reverse()) c(); throw e; }
  return () => { for (const c of cleanup) c(); };
}
export function createVectorRegistry(): VectorOpRegistry { const r = new VectorOpRegistry(); registerVectorOps(r); return r; }

/** Operation constructors. Params are plain JSON so the result serializes as is. */
export const vectorOp = (id: string, type: string, params: Record<string, JsonValue>): VectorOperation =>
  ({ id, type, version: VECTOR_OP_VERSION, enabled: true, params });
export const addLayerOp = (id: string, layer: Record<string, JsonValue>, index?: number) => vectorOp(id, 'layer.add', index === undefined ? { layer } : { layer, index });
export const updateLayerOp = (id: string, layerId: string, patch: { shape?: JsonValue; style?: JsonValue }) =>
  vectorOp(id, 'layer.update', { id: layerId, ...(patch.shape !== undefined ? { shape: patch.shape } : {}), ...(patch.style !== undefined ? { style: patch.style } : {}) });
export const removeLayerOp = (id: string, layerId: string) => vectorOp(id, 'layer.remove', { id: layerId });
export const reorderLayerOp = (id: string, layerId: string, to: number) => vectorOp(id, 'layer.reorder', { id: layerId, to });
export const renameLayerOp = (id: string, layerId: string, name: string) => vectorOp(id, 'layer.rename', { id: layerId, name });
export const setVisibleOp = (id: string, layerId: string, visible: boolean) => vectorOp(id, 'layer.setVisible', { id: layerId, visible });
export const setLockedOp = (id: string, layerId: string, locked: boolean) => vectorOp(id, 'layer.setLocked', { id: layerId, locked });
export const toPathOp = (id: string, layerId: string) => vectorOp(id, 'shape.toPath', { id: layerId });
