import { createGpuAdjust, probeWebGL2, type CanvasLike, type GpuAdjust } from './gpu';
import { applyAdjust, isNeutralAdjust, type PixelBuffer } from './math';
import type { AdjustParams } from './types';

export type AdjustBackend = 'webgl2' | 'cpu';

export interface AdjustRenderer {
  readonly backend: AdjustBackend;
  setSource(img: PixelBuffer): void;
  /** Full-quality result (export, op handler). Never mutates the source. */
  render(params: Partial<AdjustParams>): PixelBuffer;
  /** Live preview: paint onto a 2D canvas. GPU draws+blits, CPU putImageData. */
  present(params: Partial<AdjustParams>, target: CanvasRenderingContext2D): void;
  onBackendChange(cb: (b: AdjustBackend) => void): () => void;
  dispose(): void;
}

export interface RendererOptions {
  /** Factory for a scratch canvas; defaults to OffscreenCanvas / document.createElement. */
  createCanvas?: () => CanvasLike;
  forceCpu?: boolean;
}

const defaultCanvas = (): CanvasLike =>
  typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1)
    : typeof document !== 'undefined' ? document.createElement('canvas') : (null as never);

/** Picks WebGL2 when the probe passes, falls back to the CPU loop on any failure or context loss. */
export function createAdjustRenderer(opts: RendererOptions = {}): AdjustRenderer {
  const create = opts.createCanvas ?? defaultCanvas;
  let source: PixelBuffer | null = null;
  let gpu: GpuAdjust | null = null;
  let backend: AdjustBackend = 'cpu';
  const listeners = new Set<(b: AdjustBackend) => void>();
  const set = (b: AdjustBackend) => { if (b !== backend) { backend = b; listeners.forEach((l) => l(b)); } };

  const tryGpu = () => {
    if (opts.forceCpu) return;
    try {
      if (typeof OffscreenCanvas === 'undefined' && typeof document === 'undefined' && !opts.createCanvas) return;
      if (!probeWebGL2(create, source ?? undefined)) return;
      gpu = createGpuAdjust(create(), {
        onLost: () => set('cpu'),
        onRestored: () => { if (gpu && !gpu.lost) set('webgl2'); },
      });
      if (gpu) { if (source) gpu.setSource(source); set('webgl2'); }
    } catch { gpu = null; }
  };

  const failGpu = () => { try { gpu?.dispose(); } catch { /* ignore */ } gpu = null; set('cpu'); };
  const usable = () => !!gpu && !gpu.lost;

  return {
    get backend() { return backend; },
    setSource(img) {
      source = img;
      if (!gpu && !opts.forceCpu && backend === 'cpu') tryGpu();
      if (gpu) {
        if (img.width > 8192 || img.height > 8192) failGpu();
        else gpu.setSource(img);
      }
    },
    render(params) {
      if (!source) throw new Error('adjust: no source');
      if (isNeutralAdjust(params)) return { width: source.width, height: source.height, data: new Uint8ClampedArray(source.data) };
      if (usable()) { try { return gpu!.readback(params); } catch { if (!gpu!.lost) failGpu(); } }
      return applyAdjust(source, params);
    },
    present(params, target) {
      if (!source) return;
      if (usable()) {
        try {
          gpu!.draw(params);
          const c = target.canvas;
          if (c.width !== source.width) c.width = source.width;
          if (c.height !== source.height) c.height = source.height;
          target.clearRect(0, 0, source.width, source.height);
          target.drawImage(gpu!.canvas as CanvasImageSource, 0, 0);
          return;
        } catch { if (!gpu!.lost) failGpu(); }
      }
      const out = applyAdjust(source, params);
      const c = target.canvas;
      if (c.width !== out.width) c.width = out.width;
      if (c.height !== out.height) c.height = out.height;
      target.putImageData(new ImageData(out.data as Uint8ClampedArray<ArrayBuffer>, out.width, out.height), 0, 0);
    },
    onBackendChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
    dispose() { try { gpu?.dispose(); } catch { /* ignore */ } gpu = null; source = null; listeners.clear(); },
  };
}

/** Coalesce slider storms: at most one render per frame, latest params win. */
export function createLivePreview(
  draw: (params: Partial<AdjustParams>) => void,
  raf: (cb: () => void) => number = (cb) => requestAnimationFrame(cb),
  caf: (id: number) => void = (id) => cancelAnimationFrame(id),
) {
  let pending: Partial<AdjustParams> | null = null;
  let id: number | null = null;
  return {
    schedule(params: Partial<AdjustParams>) {
      pending = params;
      if (id !== null) return;
      id = raf(() => { id = null; const p = pending; pending = null; if (p) draw(p); });
    },
    cancel() { if (id !== null) caf(id); id = null; pending = null; },
  };
}
