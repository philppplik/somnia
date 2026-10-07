// Image transform kernels: crop, resize (Lanczos), rotate, flip.
// Pure CPU code on RGBA8 rasters (straight alpha). No dependencies, no DOM: runs in Node tests, Workers and the webview.
// The operations stack, undo and rendering live in the image-editor core; ./handlers.ts plugs these kernels into it.
export type Bitmap = import('../image/buffer').RasterImage;

export type FlipAxis = 'horizontal' | 'vertical';
export type ResizeFilter = 'lanczos3' | 'lanczos2' | 'bilinear' | 'nearest';
export interface CropRect { x: number; y: number; width: number; height: number }

export const MAX_DIMENSION = 16384;
export const MAX_PIXELS = 100_000_000;

export function createBitmap(width: number, height: number, data?: Uint8ClampedArray): Bitmap {
  checkSize(width, height);
  if (data && data.length !== width * height * 4) throw new RangeError('bitmap data length does not match size');
  return { width, height, data: data ?? new Uint8ClampedArray(width * height * 4) };
}

function checkSize(w: number, h: number): void {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1) throw new RangeError(`invalid size ${w}x${h}`);
  if (w > MAX_DIMENSION || h > MAX_DIMENSION || w * h > MAX_PIXELS) throw new RangeError(`size ${w}x${h} too large`);
}

// ---------- crop ----------

/** Clamp a rect to the bitmap and round to whole pixels. Throws if nothing is left. */
export function clampRect(r: CropRect, w: number, h: number): CropRect {
  const x0 = Math.max(0, Math.round(r.x)), y0 = Math.max(0, Math.round(r.y));
  const x1 = Math.min(w, Math.round(r.x + r.width)), y1 = Math.min(h, Math.round(r.y + r.height));
  if (!(x1 > x0 && y1 > y0)) throw new RangeError('crop rect is empty');
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export function crop(src: Bitmap, rect: CropRect): Bitmap {
  const r = clampRect(rect, src.width, src.height);
  const out = createBitmap(r.width, r.height);
  for (let y = 0; y < r.height; y++) {
    const from = ((r.y + y) * src.width + r.x) * 4;
    out.data.set(src.data.subarray(from, from + r.width * 4), y * r.width * 4);
  }
  return out;
}

export type AspectPreset = 'free' | 'original' | '1:1' | '4:3' | '3:2' | '16:9' | '3:4' | '2:3' | '9:16' | '5:4' | '21:9';
export const ASPECT_PRESETS: AspectPreset[] = ['free', 'original', '1:1', '4:3', '3:2', '16:9', '3:4', '2:3', '9:16', '5:4', '21:9'];

/** Numeric ratio (w/h) for a preset; null for free. */
export function aspectRatio(preset: AspectPreset | number, srcW: number, srcH: number): number | null {
  if (typeof preset === 'number') return preset > 0 && isFinite(preset) ? preset : null;
  if (preset === 'free') return null;
  if (preset === 'original') return srcW / srcH;
  const [a, b] = preset.split(':').map(Number);
  return a / b;
}

/** Largest rect with the given ratio inside the bitmap, centred (or around `center`). */
export function fitAspectRect(srcW: number, srcH: number, ratio: number, center?: { x: number; y: number }): CropRect {
  let w = srcW, h = Math.round(srcW / ratio);
  if (h > srcH) { h = srcH; w = Math.round(srcH * ratio); }
  w = Math.max(1, Math.min(srcW, w)); h = Math.max(1, Math.min(srcH, h));
  const cx = center?.x ?? srcW / 2, cy = center?.y ?? srcH / 2;
  const x = Math.min(srcW - w, Math.max(0, Math.round(cx - w / 2)));
  const y = Math.min(srcH - h, Math.max(0, Math.round(cy - h / 2)));
  return { x, y, width: w, height: h };
}

/**
 * Drag a crop handle. `handle` is a compass point. With `ratio` the opposite edge/corner stays fixed and the
 * rect keeps the ratio; the result always stays inside the bounds.
 */
export type CropHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export function dragCropHandle(rect: CropRect, handle: CropHandle, dx: number, dy: number, bounds: { width: number; height: number }, ratio: number | null, minSize = 1): CropRect {
  let l = rect.x, t = rect.y, r = rect.x + rect.width, b = rect.y + rect.height;
  if (handle.includes('w')) l += dx; if (handle.includes('e')) r += dx;
  if (handle.includes('n')) t += dy; if (handle.includes('s')) b += dy;
  const hasX = /[we]/.test(handle), hasY = /[ns]/.test(handle);
  const anchorX = handle.includes('w') ? rect.x + rect.width : rect.x; // fixed x edge
  const anchorY = handle.includes('n') ? rect.y + rect.height : rect.y;
  if (ratio) {
    if (hasX && hasY) {
      // corner: width drives, unless height changed more in relative terms
      const sx = handle.includes('w') ? -1 : 1, sy = handle.includes('n') ? -1 : 1;
      let w = (sx > 0 ? r : anchorX) - (sx > 0 ? anchorX : l), h = (sy > 0 ? b : anchorY) - (sy > 0 ? anchorY : t);
      w = Math.max(minSize, w); h = Math.max(minSize, h);
      if (w / rect.width >= h / rect.height) h = w / ratio; else w = h * ratio;
      const maxW = sx > 0 ? bounds.width - anchorX : anchorX, maxH = sy > 0 ? bounds.height - anchorY : anchorY;
      const k = Math.min(1, maxW / w, maxH / h); w *= k; h *= k;
      l = sx > 0 ? anchorX : anchorX - w; r = sx > 0 ? anchorX + w : anchorX;
      t = sy > 0 ? anchorY : anchorY - h; b = sy > 0 ? anchorY + h : anchorY;
    } else if (hasX) {
      let w = Math.max(minSize, r - l); let h = w / ratio;
      const cy = rect.y + rect.height / 2;
      const maxH = 2 * Math.min(cy, bounds.height - cy);
      const maxW = handle === 'e' ? bounds.width - anchorX : anchorX;
      const k = Math.min(1, maxH / h, maxW / w); w *= k; h *= k;
      if (handle === 'e') { l = anchorX; r = anchorX + w; } else { r = anchorX; l = anchorX - w; }
      t = cy - h / 2; b = cy + h / 2;
    } else {
      let h = Math.max(minSize, b - t); let w = h * ratio;
      const cx = rect.x + rect.width / 2;
      const maxW = 2 * Math.min(cx, bounds.width - cx);
      const maxH = handle === 's' ? bounds.height - anchorY : anchorY;
      const k = Math.min(1, maxW / w, maxH / h); w *= k; h *= k;
      if (handle === 's') { t = anchorY; b = anchorY + h; } else { b = anchorY; t = anchorY - h; }
      l = cx - w / 2; r = cx + w / 2;
    }
  } else {
    if (hasX) { if (handle.includes('w')) l = Math.min(l, r - minSize); else r = Math.max(r, l + minSize); }
    if (hasY) { if (handle.includes('n')) t = Math.min(t, b - minSize); else b = Math.max(b, t + minSize); }
    l = Math.max(0, l); t = Math.max(0, t); r = Math.min(bounds.width, r); b = Math.min(bounds.height, b);
  }
  const x = Math.round(l), y = Math.round(t);
  return { x, y, width: Math.max(1, Math.round(r) - x), height: Math.max(1, Math.round(b) - y) };
}

/** Move a rect, keeping it inside bounds. */
export function moveCropRect(rect: CropRect, dx: number, dy: number, bounds: { width: number; height: number }): CropRect {
  return {
    x: Math.round(Math.min(bounds.width - rect.width, Math.max(0, rect.x + dx))),
    y: Math.round(Math.min(bounds.height - rect.height, Math.max(0, rect.y + dy))),
    width: rect.width, height: rect.height,
  };
}

// ---------- resize ----------

function sinc(x: number): number { if (x === 0) return 1; const p = Math.PI * x; return Math.sin(p) / p; }
export function lanczosKernel(x: number, a: number): number { x = Math.abs(x); return x >= a ? 0 : sinc(x) * sinc(x / a); }

interface Contribs { start: Int32Array; count: Int32Array; weights: Float32Array; stride: number }

function kernelFor(filter: ResizeFilter): { support: number; fn: (x: number) => number } {
  switch (filter) {
    case 'lanczos3': return { support: 3, fn: (x) => lanczosKernel(x, 3) };
    case 'lanczos2': return { support: 2, fn: (x) => lanczosKernel(x, 2) };
    case 'bilinear': return { support: 1, fn: (x) => Math.max(0, 1 - Math.abs(x)) };
    case 'nearest': return { support: 0.5, fn: (x) => (x >= -0.5 && x < 0.5 ? 1 : 0) };
  }
}

/** Per-output-pixel source taps. When shrinking, the kernel is stretched (area-aware, no aliasing). */
function buildContribs(srcLen: number, dstLen: number, filter: ResizeFilter): Contribs {
  const { support, fn } = kernelFor(filter);
  const scale = dstLen / srcLen;
  const fscale = Math.max(1, 1 / scale);
  const radius = support * fscale;
  const stride = Math.ceil(radius * 2) + 2;
  const start = new Int32Array(dstLen), count = new Int32Array(dstLen), weights = new Float32Array(dstLen * stride);
  for (let i = 0; i < dstLen; i++) {
    const center = (i + 0.5) / scale - 0.5; // source-space centre
    let lo = Math.floor(center - radius + 0.5), hi = Math.floor(center + radius + 0.5);
    if (filter === 'nearest') { lo = hi = Math.min(srcLen - 1, Math.max(0, Math.floor((i + 0.5) / scale))); }
    lo = Math.max(0, lo); hi = Math.min(srcLen - 1, hi);
    let sum = 0, n = 0;
    for (let s = lo; s <= hi && n < stride; s++, n++) {
      const w = filter === 'nearest' ? 1 : fn((s - center) / fscale);
      weights[i * stride + n] = w; sum += w;
    }
    if (sum === 0) { weights[i * stride] = 1; sum = 1; n = 1; lo = Math.min(srcLen - 1, Math.max(0, Math.round(center))); }
    for (let k = 0; k < n; k++) weights[i * stride + k] /= sum;
    start[i] = lo; count[i] = n;
  }
  return { start, count, weights, stride };
}

/**
 * Separable resize in premultiplied alpha (no dark/bright fringes around transparent edges).
 * Lanczos can overshoot; results are clamped.
 */
export function resize(src: Bitmap, width: number, height: number, filter: ResizeFilter = 'lanczos3'): Bitmap {
  checkSize(width, height);
  if (width === src.width && height === src.height) return { width, height, data: new Uint8ClampedArray(src.data) };
  const sw = src.width, sh = src.height;
  // premultiply into float
  const pm = new Float32Array(sw * sh * 4);
  for (let i = 0; i < sw * sh; i++) {
    const a = src.data[i * 4 + 3] / 255;
    pm[i * 4] = src.data[i * 4] * a; pm[i * 4 + 1] = src.data[i * 4 + 1] * a; pm[i * 4 + 2] = src.data[i * 4 + 2] * a; pm[i * 4 + 3] = src.data[i * 4 + 3];
  }
  // horizontal pass -> width x sh
  const cx = buildContribs(sw, width, filter);
  const tmp = new Float32Array(width * sh * 4);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      const s0 = cx.start[x], n = cx.count[x], wo = x * cx.stride;
      for (let k = 0; k < n; k++) {
        const w = cx.weights[wo + k], p = (y * sw + s0 + k) * 4;
        r += pm[p] * w; g += pm[p + 1] * w; b += pm[p + 2] * w; a += pm[p + 3] * w;
      }
      const o = (y * width + x) * 4; tmp[o] = r; tmp[o + 1] = g; tmp[o + 2] = b; tmp[o + 3] = a;
    }
  }
  // vertical pass -> width x height
  const cy = buildContribs(sh, height, filter);
  const out = createBitmap(width, height);
  for (let y = 0; y < height; y++) {
    const s0 = cy.start[y], n = cy.count[y], wo = y * cy.stride;
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = 0; k < n; k++) {
        const w = cy.weights[wo + k], p = ((s0 + k) * width + x) * 4;
        r += tmp[p] * w; g += tmp[p + 1] * w; b += tmp[p + 2] * w; a += tmp[p + 3] * w;
      }
      a = Math.min(255, Math.max(0, a));
      const o = (y * width + x) * 4;
      if (a > 0) {
        const inv = 255 / a;
        out.data[o] = Math.min(255, Math.max(0, r * inv)); out.data[o + 1] = Math.min(255, Math.max(0, g * inv)); out.data[o + 2] = Math.min(255, Math.max(0, b * inv));
      }
      out.data[o + 3] = a;
    }
  }
  return out;
}

/** Size for a target width and/or height, optionally keeping aspect. Missing side follows the source ratio. */
export function resolveResizeSize(srcW: number, srcH: number, target: { width?: number; height?: number; keepAspect?: boolean; percent?: number }): { width: number; height: number } {
  if (target.percent !== undefined) {
    if (!(target.percent > 0)) throw new RangeError('percent must be > 0');
    return { width: Math.max(1, Math.round(srcW * target.percent / 100)), height: Math.max(1, Math.round(srcH * target.percent / 100)) };
  }
  const keep = target.keepAspect !== false;
  let { width, height } = target;
  if (keep) {
    if (width && !height) height = (width * srcH) / srcW;
    else if (height && !width) width = (height * srcW) / srcH;
    else if (width && height) { const s = Math.min(width / srcW, height / srcH); width = srcW * s; height = srcH * s; }
  }
  return { width: Math.max(1, Math.round(width ?? srcW)), height: Math.max(1, Math.round(height ?? srcH)) };
}

// ---------- flip ----------

export function flip(src: Bitmap, axis: FlipAxis): Bitmap {
  const { width: w, height: h } = src;
  const out = createBitmap(w, h);
  if (axis === 'vertical') {
    for (let y = 0; y < h; y++) out.data.set(src.data.subarray(y * w * 4, (y + 1) * w * 4), (h - 1 - y) * w * 4);
  } else {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const a = (y * w + x) * 4, b = (y * w + (w - 1 - x)) * 4;
      out.data[b] = src.data[a]; out.data[b + 1] = src.data[a + 1]; out.data[b + 2] = src.data[a + 2]; out.data[b + 3] = src.data[a + 3];
    }
  }
  return out;
}

// ---------- rotate ----------

export function normalizeDegrees(d: number): number { const m = d % 360; return m < 0 ? m + 360 : m; }

export function rotate90(src: Bitmap, quarterTurnsClockwise: number): Bitmap {
  const q = ((Math.round(quarterTurnsClockwise) % 4) + 4) % 4;
  if (q === 0) return { ...src, data: new Uint8ClampedArray(src.data) };
  const w = src.width, h = src.height;
  if (q === 2) {
    const out = createBitmap(w, h);
    for (let i = 0; i < w * h; i++) { const j = (w * h - 1 - i) * 4; out.data.set(src.data.subarray(i * 4, i * 4 + 4), j); }
    return out;
  }
  const out = createBitmap(h, w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = (y * w + x) * 4;
    // 90 cw: (x,y) -> (h-1-y, x); 270 cw: (x,y) -> (y, w-1-x)
    const nx = q === 1 ? h - 1 - y : y, ny = q === 1 ? x : w - 1 - x;
    out.data.set(src.data.subarray(a, a + 4), (ny * h + nx) * 4);
  }
  return out;
}

/** Size of the canvas that holds the whole image rotated by `degrees`. */
export function rotatedBounds(w: number, h: number, degrees: number): { width: number; height: number } {
  const t = (normalizeDegrees(degrees) * Math.PI) / 180, c = Math.abs(Math.cos(t)), s = Math.abs(Math.sin(t));
  // snap float noise so exact quarter turns give exact sizes
  const W = w * c + h * s, H = w * s + h * c;
  const snap = (v: number) => Math.max(1, Math.ceil(Math.round(v * 1e6) / 1e6));
  return { width: snap(W), height: snap(H) };
}

/**
 * Rotate by any angle (clockwise, degrees). Multiples of 90 are lossless pixel moves.
 * Other angles use bicubic (Catmull-Rom) sampling in premultiplied alpha; uncovered area gets `background`
 * (default transparent). `expand` (default true) grows the canvas to fit, otherwise the size is kept.
 */
export function rotate(src: Bitmap, degrees: number, opts: { expand?: boolean; background?: [number, number, number, number] } = {}): Bitmap {
  const deg = normalizeDegrees(degrees);
  if (deg % 90 === 0) return rotate90(src, deg / 90);
  const expand = opts.expand !== false;
  const { width: ow, height: oh } = expand ? rotatedBounds(src.width, src.height, deg) : { width: src.width, height: src.height };
  const out = createBitmap(ow, oh);
  const bg = opts.background ?? [0, 0, 0, 0];
  const t = (deg * Math.PI) / 180, cos = Math.cos(t), sin = Math.sin(t);
  const scx = src.width / 2, scy = src.height / 2, dcx = ow / 2, dcy = oh / 2;
  const sw = src.width, sh = src.height, d = src.data;
  const ba = bg[3] / 255;
  const cr = (x: number) => { x = Math.abs(x); return x < 1 ? 1.5 * x * x * x - 2.5 * x * x + 1 : x < 2 ? -0.5 * x * x * x + 2.5 * x * x - 4 * x + 2 : 0; };
  const wx = new Float64Array(4), wy = new Float64Array(4);
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    // inverse mapping (rotate dest back by -deg)
    const px = x + 0.5 - dcx, py = y + 0.5 - dcy;
    const sx = px * cos + py * sin + scx - 0.5, sy = -px * sin + py * cos + scy - 0.5;
    const o = (y * ow + x) * 4;
    // coverage: how much of the pixel centre lies inside the source, softened over 1px for smooth edges
    const cov = Math.min(1, Math.max(0, Math.min(sx + 1, sw - sx, sy + 1, sh - sy)));
    if (cov <= 0) { out.data[o] = bg[0]; out.data[o + 1] = bg[1]; out.data[o + 2] = bg[2]; out.data[o + 3] = bg[3]; continue; }
    const ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy;
    for (let k = 0; k < 4; k++) { wx[k] = cr(fx - (k - 1)); wy[k] = cr(fy - (k - 1)); }
    let r = 0, g = 0, b = 0, a = 0;
    for (let j = 0; j < 4; j++) {
      const yy = Math.min(sh - 1, Math.max(0, iy + j - 1));
      for (let i = 0; i < 4; i++) {
        const xx = Math.min(sw - 1, Math.max(0, ix + i - 1));
        const w = wx[i] * wy[j], p = (yy * sw + xx) * 4, al = d[p + 3] / 255;
        r += d[p] * al * w; g += d[p + 1] * al * w; b += d[p + 2] * al * w; a += al * w;
      }
    }
    a = Math.min(1, Math.max(0, a)) * cov;
    // composite over background (premultiplied)
    const ra = a + ba * (1 - a);
    const k = cov; // r,g,b are premultiplied sums scaled by coverage
    const pr = Math.max(0, r) * k + bg[0] * ba * (1 - a), pg = Math.max(0, g) * k + bg[1] * ba * (1 - a), pb = Math.max(0, b) * k + bg[2] * ba * (1 - a);
    if (ra > 0) { out.data[o] = Math.min(255, pr / ra); out.data[o + 1] = Math.min(255, pg / ra); out.data[o + 2] = Math.min(255, pb / ra); }
    out.data[o + 3] = ra * 255;
  }
  return out;
}

