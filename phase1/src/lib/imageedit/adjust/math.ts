import { buildCurveLut, isIdentityCurve, normalizeCurve } from './curve';
import {
  DEFAULT_ADJUST_PARAMS, SLIDER_KEYS, type AdjustParams,
} from './types';

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const num = (v: unknown, fallback = 0) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** Merge a partial patch over the defaults/current and clamp every value. Curves are cleaned. */
export function normalizeAdjustParams(p?: Partial<AdjustParams> | null, base: AdjustParams = DEFAULT_ADJUST_PARAMS): AdjustParams {
  const src = { ...base, ...(p ?? {}) } as AdjustParams;
  const out = { ...DEFAULT_ADJUST_PARAMS } as AdjustParams;
  for (const k of SLIDER_KEYS) out[k] = k === 'hue' ? clamp(num(src[k]), -180, 180) : clamp(num(src[k]), -1, 1);
  out.curves = normalizeCurve(src.curves);
  return out;
}


export function isNeutralAdjust(p: Partial<AdjustParams> | null | undefined): boolean {
  const n = normalizeAdjustParams(p);
  return SLIDER_KEYS.every((k) => n[k] === 0) && isIdentityCurve(n.curves);
}

export function adjustParamsEqual(a: AdjustParams, b: AdjustParams): boolean {
  const x = normalizeAdjustParams(a);
  const y = normalizeAdjustParams(b);
  if (!SLIDER_KEYS.every((k) => x[k] === y[k])) return false;
  if (x.curves.length !== y.curves.length) return false;
  return x.curves.every((p, i) => p.x === y.curves[i].x && p.y === y.curves[i].y);
}

/** Tunable strengths. The GLSL shader uses the same constants (see shader.ts). */
export const K = {
  brightness: 0.5,
  temperature: 0.3,
  tone: 0.4,
  luma: [0.2126, 0.7152, 0.0722] as const,
};

/** Everything the per-pixel stage needs, precomputed once per param change. */
export interface AdjustUniforms {
  neutral: boolean;
  brightness: number;
  contrast: number;
  saturation: number;
  /** Row-major 3x3 hue rotation. */
  hue: Float32Array;
  hueActive: boolean;
  temperature: number;
  highlights: number;
  shadows: number;
  useCurve: boolean;
  lut: Uint8Array;
}

export function contrastFactor(c: number): number {
  return c >= 0 ? 1 + c * 2 : 1 + c;
}

export function hueMatrix(deg: number): Float32Array {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return new Float32Array([
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.140, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
  ]);
}

export function buildUniforms(params: Partial<AdjustParams> | null | undefined): AdjustUniforms {
  const p = normalizeAdjustParams(params);
  const useCurve = !isIdentityCurve(p.curves);
  return {
    neutral: isNeutralAdjust(p),
    brightness: p.brightness * K.brightness,
    contrast: contrastFactor(p.contrast),
    saturation: 1 + p.saturation,
    hue: hueMatrix(p.hue),
    hueActive: p.hue !== 0,
    temperature: p.temperature * K.temperature,
    highlights: p.highlights * K.tone,
    shadows: p.shadows * K.tone,
    useCurve,
    lut: buildCurveLut(p.curves),
  };
}

const c01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Stage order (each stage clamps to 0..1, mirrored 1:1 in the shader):
 * temperature, brightness, contrast, shadows/highlights, saturation, hue, curve.
 * Writes [r,g,b] into out (0..1).
 */
export function adjustRgb(r: number, g: number, b: number, u: AdjustUniforms, out: number[] | Float64Array): void {
  if (u.temperature !== 0) {
    r = c01(r * (1 + u.temperature));
    b = c01(b * (1 - u.temperature));
  }
  if (u.brightness !== 0) {
    r = c01(r + u.brightness); g = c01(g + u.brightness); b = c01(b + u.brightness);
  }
  if (u.contrast !== 1) {
    r = c01((r - 0.5) * u.contrast + 0.5);
    g = c01((g - 0.5) * u.contrast + 0.5);
    b = c01((b - 0.5) * u.contrast + 0.5);
  }
  if (u.shadows !== 0 || u.highlights !== 0) {
    const l = c01(K.luma[0] * r + K.luma[1] * g + K.luma[2] * b);
    const d = u.shadows * (1 - l) * (1 - l) + u.highlights * l * l;
    r = c01(r + d); g = c01(g + d); b = c01(b + d);
  }
  if (u.saturation !== 1) {
    const l = K.luma[0] * r + K.luma[1] * g + K.luma[2] * b;
    r = c01(l + (r - l) * u.saturation);
    g = c01(l + (g - l) * u.saturation);
    b = c01(l + (b - l) * u.saturation);
  }
  if (u.hueActive) {
    const m = u.hue;
    const nr = m[0] * r + m[1] * g + m[2] * b;
    const ng = m[3] * r + m[4] * g + m[5] * b;
    const nb = m[6] * r + m[7] * g + m[8] * b;
    r = c01(nr); g = c01(ng); b = c01(nb);
  }
  if (u.useCurve) {
    r = u.lut[Math.round(r * 255)] / 255;
    g = u.lut[Math.round(g * 255)] / 255;
    b = u.lut[Math.round(b * 255)] / 255;
  }
  out[0] = r; out[1] = g; out[2] = b;
}

export interface PixelBuffer { width: number; height: number; data: Uint8ClampedArray }

/** Optimised CPU pass. Reads src, writes dst (may be the same buffer). Alpha untouched. */
export function applyAdjustCpu(src: Uint8ClampedArray, dst: Uint8ClampedArray, params: Partial<AdjustParams> | null | undefined): void {
  const u = buildUniforms(params);
  if (u.neutral) { if (src !== dst) dst.set(src); return; }
  const out = new Float64Array(3);
  const n = src.length;
  // Per-colour memo: photos and flat UI art repeat colours a lot.
  let lastKey = -1; let lr = 0; let lg = 0; let lb = 0;
  for (let i = 0; i < n; i += 4) {
    const key = (src[i] << 16) | (src[i + 1] << 8) | src[i + 2];
    if (key !== lastKey) {
      adjustRgb(src[i] / 255, src[i + 1] / 255, src[i + 2] / 255, u, out);
      lr = Math.round(out[0] * 255); lg = Math.round(out[1] * 255); lb = Math.round(out[2] * 255);
      lastKey = key;
    }
    const a = src[i + 3];
    dst[i] = lr; dst[i + 1] = lg; dst[i + 2] = lb; dst[i + 3] = a;
  }
}

/** Pure op handler: returns a new pixel buffer. */
export function applyAdjust(img: PixelBuffer, params: Partial<AdjustParams> | null | undefined): PixelBuffer {
  const data = new Uint8ClampedArray(img.data.length);
  applyAdjustCpu(img.data, data, params);
  return { width: img.width, height: img.height, data };
}
