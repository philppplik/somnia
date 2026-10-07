import type { ImageOperation } from '../../image-editor/types';
import type { RenderContext } from '../../image-editor/pipeline';
import type { VectorScene } from './types';

export interface VectorHandler {
  readonly type: `vector.${string}`;
  readonly version: number;
  /** Returns canonical detached JSON params or throws. Must not depend on any scene. */
  validate(params: unknown): ImageOperation['params'];
  /** Pure and atomic: returns a new scene, never mutates the input, throws on missing/locked targets. */
  apply(scene: VectorScene, params: ImageOperation['params'], context: RenderContext): VectorScene;
}
/**
 * Independent storage, same `register(handler): () => void` / `get(op)` shape as the raster OperationRegistry.
 * The raster OperationHandler.apply is deliberately not widened.
 */
export class VectorOperationRegistry {
  private handlers = new Map<string, VectorHandler>();
  register(handler: VectorHandler): () => void {
    if (typeof handler.type !== 'string' || !handler.type.startsWith('vector.') || handler.type.length <= 7) throw new Error(`Vector handler type must start with "vector.": ${handler.type}`);
    if (!Number.isInteger(handler.version) || handler.version < 1) throw new Error('Vector handler version must be a positive integer');
    const key = `${handler.type}@${handler.version}`;
    if (this.handlers.has(key)) throw new Error(`Vector handler already registered: ${key}`);
    this.handlers.set(key, handler);
    return () => { if (this.handlers.get(key) === handler) this.handlers.delete(key); };
  }
  get(op: Pick<ImageOperation, 'type' | 'version'>): VectorHandler {
    if (typeof op.type !== 'string' || !op.type.startsWith('vector.')) throw new Error(`Not a vector operation: ${String(op.type)}`);
    const h = this.handlers.get(`${op.type}@${op.version}`);
    if (!h) throw new Error(`Unsupported vector operation: ${op.type}@${op.version}`);
    return h;
  }
}
