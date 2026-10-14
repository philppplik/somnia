/** Leaf module for shared key/property value types. Imported by model.ts (re-exported) and motionModel.ts; keeps model <-> motionModel acyclic. */
export type Vec2=readonly [number,number];
export type PropValue=number|Vec2;
export type Interp='hold'|'linear'|'bezier';
export const TRANSFORM_KEYS=['anchor','position','scale','rotation','opacity'] as const;
export type TransformKey=typeof TRANSFORM_KEYS[number];

export const REPEATER_KEYS=['x','y','rotation','scale','opacity','hue'] as const;
export type RepeaterKey=typeof REPEATER_KEYS[number];
export type StyleLaneId='gain'|'strokeWidth'|'strokeOpacity'|'fill'|'stroke'|'repX'|'repY'|'repRotation'|'repScale'|'repOpacity'|'repHue';
