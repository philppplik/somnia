/// <reference lib="webworker" />
import init, { gaussian_blur_rgba } from '../../../craft/pkg/somnia_craft.js';
import type { CraftRequest, CraftResponse } from './protocol';
const scope = self as unknown as DedicatedWorkerGlobalScope;
let ready: Promise<unknown> | undefined;
scope.onmessage = async ({ data }: MessageEvent<CraftRequest>) => {
  const send = (message: CraftResponse, transfer: Transferable[] = []) => scope.postMessage(message, transfer);
  try {
    if (data.kind === 'init') {
      const start = performance.now();
      ready ??= init({ module_or_path: data.wasmUrl });
      await ready;
      send({ id: data.id, ok: true, kind: 'ready', initMs: performance.now() - start });
      return;
    }
    if (!ready) throw new Error('engine not initialized');
    await ready;
    const start = performance.now();
    const result = gaussian_blur_rgba(new Uint8Array(data.bytes), data.width, data.height, data.radius);
    const jobMs = performance.now() - start;
    // wasm-bindgen returns owned JS bytes, not a view into growing WASM memory.
    const bytes = result.buffer as ArrayBuffer;
    send({ id: data.id, ok: true, kind: 'result', bytes, jobMs }, [bytes]);
  } catch (error) {
    send({ id: data.id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
