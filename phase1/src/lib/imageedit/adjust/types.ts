/** Adjust op: one registered op, one pixel pass. All sliders -1..1 (hue -180..180), neutral 0. */
export interface CurvePoint { x: number; y: number }

export interface AdjustParams {
  brightness: number;
  contrast: number;
  saturation: number;
  /** Degrees, -180..180. */
  hue: number;
  temperature: number;
  highlights: number;
  shadows: number;
  /** Normalised 0..1 control points, piecewise-linear, endpoints anchored at x=0 and x=1. */
  curves: CurvePoint[];
}

export interface AdjustOpData { type: 'adjust'; params: AdjustParams }

export const ADJUST_OP_TYPE = 'adjust' as const;

export const IDENTITY_CURVE: readonly CurvePoint[] = Object.freeze([
  Object.freeze({ x: 0, y: 0 }),
  Object.freeze({ x: 1, y: 1 }),
]);

export const DEFAULT_ADJUST_PARAMS: Readonly<AdjustParams> = Object.freeze({
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
  temperature: 0,
  highlights: 0,
  shadows: 0,
  curves: IDENTITY_CURVE as CurvePoint[],
});

export const SLIDER_KEYS = ['brightness', 'contrast', 'saturation', 'hue', 'temperature', 'highlights', 'shadows'] as const;
export type SliderKey = (typeof SLIDER_KEYS)[number];
