import type { ImageOperation, JsonValue } from '../../image-editor/types';
import type { RenderContext } from '../../image-editor/pipeline';
import type { VectorEditDocument, VectorScene } from './types';
import { LIMITS, createScene, validateScene } from './scene';
import { createVectorRegistry } from './operations';
import type { VectorOperationRegistry } from './registry';

function freezeJson(v: JsonValue): JsonValue {
  if (typeof v === 'number' && !Number.isFinite(v)) throw new TypeError('Operation numbers must be finite.');
  if (Array.isArray(v)) return Object.freeze(v.map(freezeJson));
  if (v !== null && typeof v === 'object') return Object.freeze(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, freezeJson(x as JsonValue)])));
  if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) return v;
  throw new TypeError('Operation parameters must be JSON values.');
}
/** Same invariants as image-editor `operation()`: detached, frozen, JSON-only params. */
export function vectorOperation(input: ImageOperation): ImageOperation {
  if (!input.id || !input.type || !Number.isInteger(input.version) || input.version < 1 || typeof input.enabled !== 'boolean') throw new TypeError('Invalid vector operation.');
  if (!input.params || typeof input.params !== 'object' || Array.isArray(input.params)) throw new TypeError('Operation parameters must be an object.');
  return Object.freeze({ ...input, params: freezeJson(JSON.parse(JSON.stringify(input.params)) as JsonValue) as ImageOperation['params'] });
}
export function createVectorDocument(source: { id: string; name: string }, base: VectorScene = createScene(1024, 1024)): VectorEditDocument {
  if (!source.id || !source.name) throw new TypeError('Vector document source needs id and name.');
  return Object.freeze({ kind: 'vector' as const, schemaVersion: 1 as const, source: Object.freeze({ id: source.id, name: source.name, mime: 'image/svg+xml' as const }), base: validateScene(base), operations: Object.freeze([]), revision: 0 });
}
export function withVectorOperations(doc: VectorEditDocument, ops: readonly ImageOperation[]): VectorEditDocument {
  if (ops.length > LIMITS.operations) throw new RangeError(`Too many operations (max ${LIMITS.operations}).`);
  const ids = new Set<string>();
  const operations = ops.map((op) => { if (ids.has(op.id)) throw new Error(`Duplicate operation ID: ${op.id}`); ids.add(op.id); return vectorOperation(op); });
  return Object.freeze({ ...doc, operations: Object.freeze(operations), revision: doc.revision + 1 });
}
export const appendVectorOperation = (doc: VectorEditDocument, op: ImageOperation) => withVectorOperations(doc, [...doc.operations, op]);
export function updateVectorOperation(doc: VectorEditDocument, id: string, patch: Partial<Omit<ImageOperation, 'id'>>): VectorEditDocument {
  if (!doc.operations.some((o) => o.id === id)) throw new Error(`Unknown operation: ${id}`);
  return withVectorOperations(doc, doc.operations.map((o) => (o.id === id ? { ...o, ...patch } : o)));
}
export const removeVectorOperation = (doc: VectorEditDocument, id: string) => withVectorOperations(doc, doc.operations.filter((o) => o.id !== id));
export const serializeVectorDocument = (doc: VectorEditDocument) => JSON.stringify(doc);

/**
 * Validates the base, every operation's schema (disabled ones too), then applies enabled ops in order with abort checks
 * and validates each resulting scene. Any failure rejects the whole replay: nothing is skipped or migrated.
 */
export function replayVector(doc: VectorEditDocument, registry: VectorOperationRegistry = createVectorRegistry(), context: RenderContext = {}): VectorScene {
  let scene = validateScene(doc.base);
  const ids = new Set<string>();
  const prepared = doc.operations.map((op) => {
    if (ids.has(op.id)) throw new Error(`Duplicate operation ID: ${op.id}`);
    ids.add(op.id);
    const handler = registry.get(op);
    return { op, handler, params: handler.validate(op.params) };
  });
  for (const { op, handler, params } of prepared) {
    context.signal?.throwIfAborted();
    if (!op.enabled) continue;
    scene = validateScene(handler.apply(scene, params, context));
    context.signal?.throwIfAborted();
  }
  return scene;
}
/** Unknown schema/type/version throws; the caller keeps the original file and shows a read-only error state. */
export function parseVectorDocument(json: string, registry?: VectorOperationRegistry): VectorEditDocument {
  const raw = JSON.parse(json);
  if (raw?.kind !== 'vector' || raw.schemaVersion !== 1 || !Array.isArray(raw.operations)) throw new Error('Unsupported vector document.');
  if (!raw.source || ['id', 'name'].some((k) => typeof raw.source[k] !== 'string') || raw.source.mime !== 'image/svg+xml') throw new Error('Invalid vector document source.');
  if (!Number.isInteger(raw.revision) || raw.revision < 0) throw new Error('Invalid vector document revision.');
  const doc = withVectorOperations(createVectorDocument(raw.source, raw.base), raw.operations);
  replayVector(doc, registry);
  return Object.freeze({ ...doc, revision: raw.revision });
}

/** Undo/redo over immutable document snapshots; no inverse ops. Commit replays first, so a bad op changes nothing. */
export class VectorHistory {
  private past: VectorEditDocument[] = []; private future: VectorEditDocument[] = [];
  constructor(private doc: VectorEditDocument, private readonly limit = 100) {}
  get current(): VectorEditDocument { return this.doc; }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  push(op: ImageOperation, registry?: VectorOperationRegistry): VectorEditDocument {
    const next = appendVectorOperation(this.doc, op);
    replayVector(next, registry);
    this.past.push(this.doc); if (this.past.length > this.limit) this.past.shift();
    this.future = []; this.doc = next; return next;
  }
  undo(): VectorEditDocument { const p = this.past.pop(); if (p) { this.future.push(this.doc); this.doc = p; } return this.doc; }
  redo(): VectorEditDocument { const f = this.future.pop(); if (f) { this.past.push(this.doc); this.doc = f; } return this.doc; }
}
