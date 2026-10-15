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
export type ShiftEdit={layer:string;source?:Record<string,unknown>;stroke?:NonNullable<Layer['stroke']>;/** Edits (same shape as the animation Edit union) that move colour keys: layer fill and stroke keys, gradient end colours and stop colours. */keyed:{type:string;[k:string]:unknown}[]};
type Grad=NonNullable<Layer['source']['gradient']>;
const hex=(c:string|undefined,s:ColorShift)=>c&&HEX.test(c)?shiftColor(c,s):c;
/** A gradient with every static colour shifted. Keys stay as they are; `keyed` edits move them. */
function shiftGradient(g:Grad,s:ColorShift):Grad{return {...g,start:hex(g.start,s)!,end:hex(g.end,s)!,...(g.stops?{stops:g.stops.map(x=>({...x,color:hex(x.color,s)!}))}:{})};}
function gradientKeyed(layer:string,target:'fill'|'stroke',g:Grad,s:ColorShift,out:ShiftEdit['keyed']){
 for(const w of ['start','end'] as const)for(const k of g.colorKeys?.[w]??[])if(HEX.test(k.color))out.push({type:'gradient.color',layer,target,which:w,op:'set',color:shiftColor(k.color,s),t:k.t});
 (g.stops??[]).forEach((st,index)=>{for(const k of st.colorKeys??[])if(HEX.test(k.color))out.push({type:'gradient.stop',layer,target,index,prop:'color',op:'set',color:shiftColor(k.color,s),t:k.t});});
}
/** Edits for the unlocked layers' fills, strokes, gradients and colour keys; layers whose colour does not change are left out. */
export function shiftPalette(layers:readonly Layer[],s:ColorShift):ShiftEdit[]{
 const out:ShiftEdit[]=[];
 for(const l of layers){if(l.locked)continue;const e:ShiftEdit={layer:l.id,keyed:[]};
  const c=l.source.color;
  if(['solid','shape','text'].includes(l.kind)&&c&&HEX.test(c)){const n=shiftColor(c,s);if(n!==c.toLowerCase())e.source={color:n};}
  const g=l.source.gradient;
  if(g&&['solid','shape'].includes(l.kind)){const ng=shiftGradient(g,s);if(JSON.stringify(ng)!==JSON.stringify(g))e.source={...e.source,gradient:ng};gradientKeyed(l.id,'fill',g,s,e.keyed);}
  if(l.kind==='shape'&&l.stroke){
   let st=l.stroke;if(HEX.test(st.color)){const n=shiftColor(st.color,s);if(n!==st.color.toLowerCase())st={...st,color:n};}
   if(st.gradient){const ng=shiftGradient(st.gradient,s);if(JSON.stringify(ng)!==JSON.stringify(st.gradient))st={...st,gradient:ng};gradientKeyed(l.id,'stroke',st.gradient,s,e.keyed);}
   if(st!==l.stroke)e.stroke=st;}
  for(const p of ['fill','stroke'] as const)for(const k of l.colorKeys?.[p]??[])if(HEX.test(k.color))e.keyed.push({type:'color.prop',layer:l.id,prop:p,op:'set',color:shiftColor(k.color,s),t:k.t});
  if(e.source||e.stroke||e.keyed.length)out.push(e);}
 return out;
}
