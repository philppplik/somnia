/** Leaf module for shared key/property value types. Imported by model.ts (re-exported) and motionModel.ts; keeps model <-> motionModel acyclic. */
export type Vec2=readonly [number,number];
export type PropValue=number|Vec2;
export type Interp='hold'|'linear'|'bezier';
export const TRANSFORM_KEYS=['anchor','position','scale','rotation','opacity'] as const;
export type TransformKey=typeof TRANSFORM_KEYS[number];

export const REPEATER_KEYS=['x','y','rotation','scale','opacity','hue'] as const;
export type RepeaterKey=typeof REPEATER_KEYS[number];
export type StyleLaneId='gain'|'strokeWidth'|'strokeOpacity'|'fill'|'stroke'|'repX'|'repY'|'repRotation'|'repScale'|'repOpacity'|'repHue'|'gradFillAngle'|'gradStrokeAngle'|GradientLaneId|GradientStopLaneId|'pathFxSize'|'textPathStart';
export const GRADIENT_KEYS=['cx','cy','radius','startOpacity','endOpacity'] as const;
export type GradientKey=typeof GRADIENT_KEYS[number];
export type GradientLaneId=`grad${'Fill'|'Stroke'}${'Cx'|'Cy'|'Radius'|'StartOpacity'|'EndOpacity'|'StartColor'|'EndColor'}`;
export const gradientLaneId=(target:'fill'|'stroke',k:GradientKey):GradientLaneId=>`grad${target==='fill'?'Fill':'Stroke'}${k[0].toUpperCase()}${k.slice(1)}` as GradientLaneId;
export const parseGradientLane=(l:string):{target:'fill'|'stroke';key:GradientKey}|null=>{const m=/^grad(Fill|Stroke)(Cx|Cy|Radius|StartOpacity|EndOpacity)$/.exec(l);return m?{target:m[1]==='Fill'?'fill':'stroke',key:(m[2][0].toLowerCase()+m[2].slice(1)) as GradientKey}:null;};
export type GradientColorKey='start'|'end';
export const gradientColorLaneId=(target:'fill'|'stroke',k:GradientColorKey):GradientLaneId=>`grad${target==='fill'?'Fill':'Stroke'}${k==='start'?'Start':'End'}Color`;
export const parseGradientColorLane=(l:string):{target:'fill'|'stroke';key:GradientColorKey}|null=>{const m=/^grad(Fill|Stroke)(Start|End)Color$/.exec(l);return m?{target:m[1]==='Fill'?'fill':'stroke',key:m[2]==='Start'?'start':'end'}:null;};
export type GradientStopLaneId=`grad${'Fill'|'Stroke'}Stop${number}${'Offset'|'Color'}`;
export const gradientStopLaneId=(target:'fill'|'stroke',index:number,prop:'offset'|'color'):GradientStopLaneId=>`grad${target==='fill'?'Fill':'Stroke'}Stop${index}${prop==='offset'?'Offset':'Color'}`;
export const parseGradientStopLane=(l:string):{target:'fill'|'stroke';index:number;prop:'offset'|'color'}|null=>{const m=/^grad(Fill|Stroke)Stop(\d+)(Offset|Color)$/.exec(l);return m?{target:m[1]==='Fill'?'fill':'stroke',index:Number(m[2]),prop:m[3]==='Offset'?'offset':'color'}:null;};
