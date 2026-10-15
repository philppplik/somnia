import type {Layer} from './model';
import {HEX} from './palette';
/** Shift every solid colour of the composition in HSL: hue in degrees, saturation and lightness in percentage points. Pure. */
export interface ColorShift{hue?:number;saturation?:number;lightness?:number}
const clamp=(x:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,x));
export function hexToHsl(hex:string):[number,number,number]{
 const n=parseInt(hex.slice(1),16),r=(n>>16&255)/255,g=(n>>8&255)/255,b=(n&255)/255,mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2,d=mx-mn;
 if(d===0)return [0,0,l*100];
 const s=d/(1-Math.abs(2*l-1));let h=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;h=(h*60+360)%360;return [h,s*100,l*100];
}
export function hslToHex(h:number,s:number,l:number):string{
 const S=s/100,L=l/100,c=(1-Math.abs(2*L-1))*S,x=c*(1-Math.abs((h/60)%2-1)),m=L-c/2;
 const [r,g,b]=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
 return '#'+[r,g,b].map(v=>Math.round((v+m)*255).toString(16).padStart(2,'0')).join('');
}
export function shiftColor(hex:string,s:ColorShift):string{
 const [h,sa,l]=hexToHsl(hex);
 return hslToHex(((h+(s.hue??0))%360+360)%360,clamp(sa+(s.saturation??0),0,100),clamp(l+(s.lightness??0),0,100));
}
export type ShiftEdit={layer:string;source?:{color:string};stroke?:NonNullable<Layer['stroke']>};
/** Edits for the unlocked layers' fills and strokes; layers whose colour does not change are left out. */
export function shiftPalette(layers:readonly Layer[],s:ColorShift):ShiftEdit[]{
 const out:ShiftEdit[]=[];
 for(const l of layers){if(l.locked)continue;const e:ShiftEdit={layer:l.id};
  const c=l.source.color;
  if(['solid','shape','text'].includes(l.kind)&&c&&HEX.test(c)){const n=shiftColor(c,s);if(n!==c.toLowerCase())e.source={color:n};}
  if(l.kind==='shape'&&l.stroke&&HEX.test(l.stroke.color)){const n=shiftColor(l.stroke.color,s);if(n!==l.stroke.color.toLowerCase())e.stroke={...l.stroke,color:n};}
  if(e.source||e.stroke)out.push(e);}
 return out;
}
