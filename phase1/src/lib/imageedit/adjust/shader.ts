import { K, buildUniforms, type AdjustUniforms } from './math';
import type { AdjustParams } from './types';

export const VERTEX_SHADER = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main(){
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const f = (n: number) => {
  const s = Number(n).toPrecision(9);
  return s.includes('.') || s.includes('e') ? s : s + '.0';
};

function declarations(u: AdjustUniforms | null): string {
  if (!u) {
    return `uniform float uBrightness;
uniform float uContrast;
uniform float uSaturation;
uniform mat3 uHue;
uniform float uTemperature;
uniform float uHighlights;
uniform float uShadows;
uniform bool uUseCurve;
uniform bool uHueActive;
uniform sampler2D uLut;
float lutAt(int i){ return texelFetch(uLut, ivec2(i, 0), 0).r; }
`;
  }
  const h = u.hue;
  // GLSL mat3 constructor is column-major; our matrix is row-major, so transpose.
  const m = [h[0], h[3], h[6], h[1], h[4], h[7], h[2], h[5], h[8]].map(f).join(', ');
  const lut = Array.from(u.lut, (v) => f(v / 255)).join(',');
  return `const float uBrightness = ${f(u.brightness)};
const float uContrast = ${f(u.contrast)};
const float uSaturation = ${f(u.saturation)};
const mat3 uHue = mat3(${m});
const float uTemperature = ${f(u.temperature)};
const float uHighlights = ${f(u.highlights)};
const float uShadows = ${f(u.shadows)};
const bool uUseCurve = ${u.useCurve ? 'true' : 'false'};
const bool uHueActive = ${u.hueActive ? 'true' : 'false'};
const float LUT[256] = float[256](${lut});
float lutAt(int i){ return LUT[i]; }
`;
}

/**
 * Fragment shader for the adjust op. Same stage order and constants as math.ts adjustRgb.
 * Without `params` it declares uniforms (fast path for live sliders: set uniforms, no recompile).
 * With `params` all values are baked in as constants (self-contained, no uniform plumbing).
 * Input: sampler `uTex` and varying `vUv`; output `outColor` (straight alpha, alpha passthrough).
 */
export function buildFragmentShader(params?: Partial<AdjustParams> | null, bake = params !== undefined): string {
  const u = bake ? buildUniforms(params) : null;
  return `#version 300 es
precision highp float;
precision highp int;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
${declarations(u)}
const vec3 LUMA = vec3(${K.luma.map(f).join(', ')});
vec3 c01(vec3 v){ return clamp(v, 0.0, 1.0); }
vec3 curve(vec3 c){
  ivec3 i = ivec3(floor(c * 255.0 + 0.5));
  return vec3(lutAt(i.r), lutAt(i.g), lutAt(i.b));
}
void main(){
  vec4 px = texture(uTex, vUv);
  vec3 c = px.rgb;
  if (uTemperature != 0.0) {
    c.r = clamp(c.r * (1.0 + uTemperature), 0.0, 1.0);
    c.b = clamp(c.b * (1.0 - uTemperature), 0.0, 1.0);
  }
  if (uBrightness != 0.0) c = c01(c + uBrightness);
  if (uContrast != 1.0) c = c01((c - 0.5) * uContrast + 0.5);
  if (uShadows != 0.0 || uHighlights != 0.0) {
    float l = clamp(dot(LUMA, c), 0.0, 1.0);
    float d = uShadows * (1.0 - l) * (1.0 - l) + uHighlights * l * l;
    c = c01(c + d);
  }
  if (uSaturation != 1.0) {
    float l = dot(LUMA, c);
    c = c01(vec3(l) + (c - vec3(l)) * uSaturation);
  }
  if (uHueActive) c = c01(uHue * c);
  if (uUseCurve) c = curve(c);
  outColor = vec4(c, px.a);
}
`;
}
