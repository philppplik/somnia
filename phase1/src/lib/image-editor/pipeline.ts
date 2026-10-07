import type { RasterImage } from '../image/buffer';
import { applyOp, type EditOp } from '../image/pipeline';
import { assertImageSize } from './document';
import type { ImageEditDocument, ImageOperation } from './types';
export type { RasterImage } from '../image/buffer';
export interface RenderContext { signal?: AbortSignal }
export interface OperationHandler {
  readonly type: string;
  readonly version: number;
  apply(input: RasterImage, params: ImageOperation['params'], context: RenderContext): RasterImage | Promise<RasterImage>;
  /** GLSL ES 3.00; uniforms uTex (sampler2D), uSize (vec2); in vec2 vUv; out vec4 outColor. Same-sized operations only. */
  fragmentShader?(params: ImageOperation['params']): string;
}
export class OperationRegistry {
  private handlers = new Map<string,OperationHandler>();
  register(handler: OperationHandler): () => void {
    const key = `${handler.type}@${handler.version}`;
    if (this.handlers.has(key)) throw new Error(`Image handler already registered: ${key}`);
    this.handlers.set(key,handler);
    return () => { if (this.handlers.get(key) === handler) this.handlers.delete(key); };
  }
  get(op: ImageOperation): OperationHandler {
    const handler = this.handlers.get(`${op.type}@${op.version}`);
    if (!handler) throw new Error(`Unsupported image operation: ${op.type}@${op.version}`);
    return handler;
  }
}
export function validateRaster(image: RasterImage): void {
  assertImageSize(image.width,image.height);
  if (!(image.data instanceof Uint8ClampedArray) || image.data.length !== image.width * image.height * 4) throw new Error('Invalid RGBA raster.');
}
/** No pixel math duplication: bridge to the researched, pure CPU reference stack. */
export function createOperationRegistry(): OperationRegistry {
  const registry = new OperationRegistry();
  registry.register({type:'raster',version:1, apply(input,params) {
    if (!params.edit || typeof params.edit !== 'object' || Array.isArray(params.edit)) throw new Error('Missing raster edit.');
    const edit=params.edit as unknown as EditOp;
    if(edit.op==='resize')assertImageSize(edit.width,edit.height);
    if(edit.op==='rotate' && edit.expand!==false){const angle=edit.degrees*Math.PI/180;assertImageSize(Math.max(1,Math.round(Math.abs(input.width*Math.cos(angle))+Math.abs(input.height*Math.sin(angle)))),Math.max(1,Math.round(Math.abs(input.width*Math.sin(angle))+Math.abs(input.height*Math.cos(angle)))));}
    if(edit.op==='blur' && (edit.sigma<0 || edit.sigma>100))throw new RangeError('Blur sigma must be between 0 and 100.');
    return applyOp(input,edit);
  }});
  return registry;
}
export async function renderStack(source: RasterImage, doc: ImageEditDocument, registry: OperationRegistry, context: RenderContext = {}): Promise<RasterImage> {
  validateRaster(source);
  if (source.width !== doc.source.width || source.height !== doc.source.height) throw new Error('Source dimensions do not match the document.');
  // Copy once at the trust boundary: an extension handler cannot change the decoded base image.
  let output: RasterImage = {...source,data:new Uint8ClampedArray(source.data)};
  for (const op of doc.operations) {
    context.signal?.throwIfAborted();
    if (!op.enabled) continue;
    output = await registry.get(op).apply(output,op.params,context);
    validateRaster(output);
  }
  context.signal?.throwIfAborted();
  return output;
}
