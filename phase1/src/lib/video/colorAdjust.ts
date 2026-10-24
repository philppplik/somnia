/**
 * Per-clip colour correction for the Video studio: brightness, contrast and saturation as whole numbers in
 * -100..100 (0 = untouched). The maths follow the CSS filter definitions (brightness, then contrast, then
 * saturate) so the live preview (CSS filter on the player) and the export (pixel pass) agree. Pure: no DOM.
 */
export interface ClipColor{brightness:number;contrast:number;saturation:number}
export const COLOR_MIN=-100,COLOR_MAX=100;
export const NEUTRAL_COLOR:ClipColor={brightness:0,contrast:0,saturation:0};
const clampInt=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?Math.min(COLOR_MAX,Math.max(COLOR_MIN,Math.round(v))):0;
/** The clip's colour with every channel clamped and defaulted. Never throws on foreign input. */
export function colorOf(c:{color?:Partial<ClipColor>|null}|null|undefined):ClipColor{
 const v=c?.color;if(!v||typeof v!=='object')return{...NEUTRAL_COLOR};
 return{brightness:clampInt(v.brightness),contrast:clampInt(v.contrast),saturation:clampInt(v.saturation)};
}
export const isNeutralColor=(v:ClipColor)=>v.brightness===0&&v.contrast===0&&v.saturation===0;
export const hasColor=(c:{color?:Partial<ClipColor>|null}|null|undefined)=>!isNeutralColor(colorOf(c));
const factor=(v:number)=>1+v/100;
/** CSS filter string for the preview, '' when neutral. */
export function colorCssFilter(v:ClipColor):string{
 if(isNeutralColor(v))return '';
 return `brightness(${factor(v.brightness).toFixed(2)}) contrast(${factor(v.contrast).toFixed(2)}) saturate(${factor(v.saturation).toFixed(2)})`;
}
/** Applies the correction in place to RGBA bytes (alpha untouched). */
export function applyColorToPixels(data:Uint8ClampedArray,v:ClipColor):void{
 if(isNeutralColor(v))return;
 const b=factor(v.brightness),k=factor(v.contrast),s=factor(v.saturation);
 // CSS saturate matrix.
 const m00=0.213+0.787*s,m01=0.715-0.715*s,m02=0.072-0.072*s;
 const m10=0.213-0.213*s,m11=0.715+0.285*s,m12=0.072-0.072*s;
 const m20=0.213-0.213*s,m21=0.715-0.715*s,m22=0.072+0.928*s;
 const off=0.5-0.5*k;
 for(let i=0;i+3<data.length;i+=4){
  let r=data[i]/255*b,g=data[i+1]/255*b,bl=data[i+2]/255*b;
  r=Math.min(1,Math.max(0,r*k+off));g=Math.min(1,Math.max(0,g*k+off));bl=Math.min(1,Math.max(0,bl*k+off));
  data[i]=Math.round(Math.min(1,Math.max(0,m00*r+m01*g+m02*bl))*255);
  data[i+1]=Math.round(Math.min(1,Math.max(0,m10*r+m11*g+m12*bl))*255);
  data[i+2]=Math.round(Math.min(1,Math.max(0,m20*r+m21*g+m22*bl))*255);
 }
}
