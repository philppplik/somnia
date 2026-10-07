/**
 * GLSL ES 1.00 (WebGL1/2 compatible) fragment shaders mirroring the CPU reference in adjust.ts/convolve.ts.
 * Curves/Levels are baked into a 256x1 RGBA LUT texture on the CPU (curveLut/levelsLut), so the GPU only does a lookup.
 * Input texture is expected non-premultiplied (UNPACK_PREMULTIPLY_ALPHA_WEBGL = false).
 */
export const VERTEX_SHADER = `attribute vec2 aPos;
varying vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`

/** One pass: exposure -> brightness/contrast -> hue -> saturation -> LUT (levels/curves) -> sepia/gray/invert. */
export const ADJUST_FRAGMENT = `precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform sampler2D uLut;   // 256x1, rgb = per-channel curve
uniform float uExposure;  // stops
uniform float uBrightness; // -1..1
uniform float uContrast;   // -1..1
uniform mat3 uHue;         // see hueRotateMatrix (row-major on CPU -> transpose=false upload of transposed)
uniform float uSaturation; // -1..1
uniform float uUseLut;
uniform float uSepia;      // 0..1
uniform float uGray;       // 0..1
uniform float uInvert;     // 0..1
const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
vec3 toLinear(vec3 c){ return mix(c/12.92, pow((c+0.055)/1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toSrgb(vec3 c){ c = clamp(c,0.0,1.0); return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4))-0.055, step(0.0031308, c)); }
void main(){
  vec4 px = texture2D(uTex, vUv);
  vec3 c = px.rgb;
  if (uExposure != 0.0) c = toSrgb(toLinear(c) * exp2(uExposure));
  float k = uContrast > 0.0 ? 1.0 / (1.0 - min(uContrast, 0.999)) : 1.0 + uContrast;
  c = (c + uBrightness - 0.5) * k + 0.5;
  c = clamp(c, 0.0, 1.0);
  c = uHue * c;
  float y = dot(c, LUMA);
  c = vec3(y) + (c - vec3(y)) * (1.0 + uSaturation);
  c = clamp(c, 0.0, 1.0);
  if (uUseLut > 0.5) {
    c = vec3(texture2D(uLut, vec2((c.r*255.0+0.5)/256.0, 0.5)).r,
             texture2D(uLut, vec2((c.g*255.0+0.5)/256.0, 0.5)).g,
             texture2D(uLut, vec2((c.b*255.0+0.5)/256.0, 0.5)).b);
  }
  vec3 sep = vec3(dot(c, vec3(0.393,0.769,0.189)), dot(c, vec3(0.349,0.686,0.168)), dot(c, vec3(0.272,0.534,0.131)));
  c = mix(c, clamp(sep,0.0,1.0), uSepia);
  c = mix(c, vec3(dot(c, LUMA)), uGray);
  c = mix(c, 1.0 - c, uInvert);
  gl_FragColor = vec4(c, px.a);
}`

/** Separable Gaussian: run twice with uDir=(1/w,0) then (0,1/h). Uses the linear-sampling trick would halve taps; plain taps kept for clarity. Max radius 32. */
export const GAUSSIAN_FRAGMENT = `precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uDir;
uniform float uSigma;
void main(){
  float r = min(ceil(uSigma * 3.0), 32.0);
  vec4 acc = vec4(0.0);
  float sum = 0.0;
  for (int i = -32; i <= 32; i++) {
    float fi = float(i);
    if (abs(fi) > r) continue;
    float w = exp(-(fi*fi) / (2.0*uSigma*uSigma));
    acc += texture2D(uTex, vUv + uDir * fi) * w;
    sum += w;
  }
  gl_FragColor = acc / sum;
}`

/** Unsharp mask second pass: needs original (uTex) and blurred (uBlur). */
export const UNSHARP_FRAGMENT = `precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform sampler2D uBlur;
uniform float uAmount;
uniform float uThreshold; // 0..1
void main(){
  vec4 o = texture2D(uTex, vUv);
  vec3 d = o.rgb - texture2D(uBlur, vUv).rgb;
  vec3 m = step(vec3(uThreshold), abs(d));
  gl_FragColor = vec4(clamp(o.rgb + uAmount * d * m, 0.0, 1.0), o.a);
}`

/** 3x3 convolution (sharpen/edge/emboss). Kernel row-major in uK, uDiv divisor. */
export const CONVOLVE3_FRAGMENT = `precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uK[9];
uniform float uDiv;
uniform float uBias;
void main(){
  vec3 acc = vec3(0.0);
  for (int j = 0; j < 3; j++) for (int i = 0; i < 3; i++) {
    acc += texture2D(uTex, vUv + vec2(float(i-1), float(j-1)) * uTexel).rgb * uK[j*3+i];
  }
  gl_FragColor = vec4(clamp(acc / uDiv + uBias, 0.0, 1.0), texture2D(uTex, vUv).a);
}`

/** Column-major mat3 from the row-major 9-array of hueRotateMatrix, for gl.uniformMatrix3fv(loc, false, ...). */
export function toColumnMajor(rowMajor: readonly number[]): Float32Array {
  const m = rowMajor
  return new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]])
}

/** Pack three 256-entry LUTs into 256x1 RGBA bytes for gl.texImage2D. */
export function packLutTexture(r: ArrayLike<number>, g: ArrayLike<number>, b: ArrayLike<number>): Uint8Array {
  const out = new Uint8Array(256 * 4)
  for (let i = 0; i < 256; i++) {
    out[i * 4] = r[i]; out[i * 4 + 1] = g[i]; out[i * 4 + 2] = b[i]; out[i * 4 + 3] = 255
  }
  return out
}
