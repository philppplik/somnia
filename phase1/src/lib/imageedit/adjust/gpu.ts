import { buildUniforms, type PixelBuffer } from './math';
import { VERTEX_SHADER, buildFragmentShader } from './shader';
import type { AdjustParams } from './types';

type GL = WebGL2RenderingContext;
export type CanvasLike = HTMLCanvasElement | OffscreenCanvas;

export interface GpuAdjust {
  readonly canvas: CanvasLike;
  readonly lost: boolean;
  setSource(img: PixelBuffer): void;
  /** Draw into the internal canvas. */
  draw(params: Partial<AdjustParams>): void;
  /** Draw and read back (top row first, like ImageData). */
  readback(params: Partial<AdjustParams>): PixelBuffer;
  dispose(): void;
}

/** Capability probe: WebGL2, shader compiles, link ok, usable texture size. */
export function probeWebGL2(create: () => CanvasLike, size?: { width: number; height: number }): boolean {
  try {
    const c = create();
    const gl = c.getContext('webgl2') as GL | null;
    if (!gl || (gl.isContextLost && gl.isContextLost())) return false;
    const max = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    if (size && (size.width > max || size.height > max)) return false;
    const p = compileProgram(gl);
    gl.deleteProgram(p);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function compileProgram(gl: GL): WebGLProgram {
  const mk = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error('adjust shader: ' + log);
    }
    return s;
  };
  const p = gl.createProgram()!;
  const vs = mk(gl.VERTEX_SHADER, VERTEX_SHADER);
  const fs = mk(gl.FRAGMENT_SHADER, buildFragmentShader());
  gl.attachShader(p, vs); gl.attachShader(p, fs);
  gl.bindAttribLocation(p, 0, 'aPos');
  gl.linkProgram(p);
  gl.deleteShader(vs); gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('adjust link: ' + gl.getProgramInfoLog(p));
  return p;
}

/**
 * WebGL2 adjust pass. Handles context loss: `lost` flips to true and `onLost` fires;
 * on restore all GL resources are rebuilt from the retained CPU source and `onRestored` fires.
 */
export function createGpuAdjust(
  canvas: CanvasLike,
  hooks: { onLost?: () => void; onRestored?: () => void } = {},
): GpuAdjust | null {
  let gl = canvas.getContext('webgl2', { premultipliedAlpha: false, alpha: true, preserveDrawingBuffer: true, antialias: false }) as GL | null;
  if (!gl) return null;
  let source: PixelBuffer | null = null;
  let lost = false;
  let program: WebGLProgram | null = null;
  let tex: WebGLTexture | null = null;
  let lutTex: WebGLTexture | null = null;
  let vbo: WebGLBuffer | null = null;
  let loc: Record<string, WebGLUniformLocation | null> = {};
  let lutKey = '';

  const init = () => {
    const g = gl!;
    program = compileProgram(g);
    vbo = g.createBuffer();
    g.bindBuffer(g.ARRAY_BUFFER, vbo);
    g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), g.STATIC_DRAW);
    g.enableVertexAttribArray(0);
    g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
    tex = g.createTexture();
    lutTex = g.createTexture();
    loc = {};
    for (const n of ['uTex', 'uBrightness', 'uContrast', 'uSaturation', 'uHue', 'uTemperature', 'uHighlights', 'uShadows', 'uUseCurve', 'uHueActive', 'uLut']) {
      loc[n] = g.getUniformLocation(program, n);
    }
    lutKey = '';
    if (source) upload();
  };

  const upload = () => {
    const g = gl!;
    if (!source) return;
    canvas.width = source.width; canvas.height = source.height;
    g.viewport(0, 0, source.width, source.height);
    g.activeTexture(g.TEXTURE0);
    g.bindTexture(g.TEXTURE_2D, tex);
    g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL, 0);
    g.pixelStorei(g.UNPACK_ALIGNMENT, 1);
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA8, source.width, source.height, 0, g.RGBA, g.UNSIGNED_BYTE, new Uint8Array(source.data.buffer, source.data.byteOffset, source.data.byteLength));
    for (const [k, v] of [[g.TEXTURE_MIN_FILTER, g.NEAREST], [g.TEXTURE_MAG_FILTER, g.NEAREST], [g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE], [g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE]] as const) g.texParameteri(g.TEXTURE_2D, k, v);
  };

  const onLostEv = (e: Event) => { e.preventDefault(); lost = true; hooks.onLost?.(); };
  const onRestoredEv = () => {
    try { init(); lost = false; hooks.onRestored?.(); } catch { lost = true; }
  };
  (canvas as HTMLCanvasElement).addEventListener?.('webglcontextlost', onLostEv as EventListener, false);
  (canvas as HTMLCanvasElement).addEventListener?.('webglcontextrestored', onRestoredEv as EventListener, false);
  try { init(); } catch { return null; }

  const draw = (params: Partial<AdjustParams>) => {
    const g = gl!;
    if (lost || !source || g.isContextLost()) { if (g.isContextLost() && !lost) { lost = true; hooks.onLost?.(); } throw new Error('adjust: GL context lost'); }
    const u = buildUniforms(params);
    g.useProgram(program);
    g.uniform1i(loc.uTex, 0);
    g.uniform1f(loc.uBrightness, u.brightness);
    g.uniform1f(loc.uContrast, u.contrast);
    g.uniform1f(loc.uSaturation, u.saturation);
    // Row-major -> column-major: upload transposed.
    g.uniformMatrix3fv(loc.uHue, true, u.hue);
    g.uniform1f(loc.uTemperature, u.temperature);
    g.uniform1f(loc.uHighlights, u.highlights);
    g.uniform1f(loc.uShadows, u.shadows);
    g.uniform1i(loc.uUseCurve, u.useCurve ? 1 : 0);
    g.uniform1i(loc.uHueActive, u.hueActive ? 1 : 0);
    const key = u.useCurve ? u.lut.join(',') : 'id';
    g.activeTexture(g.TEXTURE1);
    g.bindTexture(g.TEXTURE_2D, lutTex);
    if (key !== lutKey) {
      g.pixelStorei(g.UNPACK_ALIGNMENT, 1);
      g.texImage2D(g.TEXTURE_2D, 0, g.R8, 256, 1, 0, g.RED, g.UNSIGNED_BYTE, u.lut);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.NEAREST);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.NEAREST);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
      lutKey = key;
    }
    g.uniform1i(loc.uLut, 1);
    g.activeTexture(g.TEXTURE0);
    g.bindTexture(g.TEXTURE_2D, tex);
    g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
  };

  return {
    canvas,
    get lost() { return lost; },
    setSource(img) { source = img; if (!lost) upload(); },
    draw,
    readback(params) {
      draw(params);
      const g = gl!;
      const w = source!.width; const h = source!.height;
      const raw = new Uint8Array(w * h * 4);
      g.readPixels(0, 0, w, h, g.RGBA, g.UNSIGNED_BYTE, raw);
      const out = new Uint8ClampedArray(w * h * 4);
      const row = w * 4;
      for (let y = 0; y < h; y++) out.set(raw.subarray((h - 1 - y) * row, (h - y) * row), y * row);
      return { width: w, height: h, data: out };
    },
    dispose() {
      (canvas as HTMLCanvasElement).removeEventListener?.('webglcontextlost', onLostEv as EventListener);
      (canvas as HTMLCanvasElement).removeEventListener?.('webglcontextrestored', onRestoredEv as EventListener);
      if (!gl.isContextLost()) {
        gl.deleteTexture(tex); gl.deleteTexture(lutTex); gl.deleteBuffer(vbo); gl.deleteProgram(program);
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
      source = null; lost = true;
    },
  };
}
