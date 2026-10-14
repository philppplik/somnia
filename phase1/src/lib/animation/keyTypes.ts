/** Leaf module for shared key/property value types. Imported by model.ts (re-exported) and motionModel.ts; keeps model <-> motionModel acyclic. */
export type Vec2=readonly [number,number];
export type PropValue=number|Vec2;
export type Interp='hold'|'linear'|'bezier';
export const TRANSFORM_KEYS=['anchor','position','scale','rotation','opacity'] as const;
export type TransformKey=typeof TRANSFORM_KEYS[number];

export const REPEATER_KEYS=['x','y','rotation','scale','opacity','hue'] as const;
export type RepeaterKey=typeof REPEATER_KEYS[number];
export type StyleLaneId='gain'|'strokeWidth'|'strokeOpacity'|'fill'|'stroke'|'repX'|'repY'|'repRotation'|'repScale'|'repOpacity'|'repHue'|'gradFillAngle'|'gradStrokeAngle'|GradientLaneId;
export const GRADIENT_KEYS=['cx','cy','radius','startOpacity','endOpacity'] as const;
export type GradientKey=typeof GRADIENT_KEYS[number];
export type GradientLaneId=`grad${'Fill'|'Stroke'}${'Cx'|'Cy'|'Radius'|'StartOpacity'|'EndOpacity'}`;
export const gradientLaneId=(target:'fill'|'stroke',k:GradientKey):GradientLaneId=>`grad${target==='fill'?'Fill':'Stroke'}${k[0].toUpperCase()}${k.slice(1)}` as GradientLaneId;
export const parseGradientLane=(l:string):{target:'fill'|'stroke';key:GradientKey}|null=>{const m=/^grad(Fill|Stroke)(Cx|Cy|Radius|StartOpacity|EndOpacity)$/.exec(l);return m?{target:m[1]==='Fill'?'fill':'stroke',key:(m[2][0].toLowerCase()+m[2].slice(1)) as GradientKey}:null;};
