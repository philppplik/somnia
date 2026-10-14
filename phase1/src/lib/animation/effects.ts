import {evaluate} from './interpolate';
import type {Layer,LayerEffect} from './model';
export const EFFECT_KINDS=['blur','tint','shadow','glow','innerShadow','innerGlow'] as const;
/** Starting values for a new effect of each kind. */
export function defaultEffect(kind:LayerEffect['kind'],id:string,accent:string):LayerEffect{
 return kind==='blur'?{id,kind,enabled:true,amount:4,color:accent}:kind==='tint'?{id,kind,enabled:true,amount:1,color:accent}
  :kind==='shadow'?{id,kind,enabled:true,amount:0.6,color:'#000000',blur:8,distance:12,angle:45}:kind==='glow'?{id,kind,enabled:true,amount:1,color:accent,blur:12}
  :kind==='innerShadow'?{id,kind,enabled:true,amount:0.6,color:'#000000',blur:8,distance:8,angle:45}:{id,kind,enabled:true,amount:1,color:accent,blur:10};
}
/** Default radius and distance of a style effect, for fields that show the value when none is stored. */
export const styleDefaults=(kind:LayerEffect['kind']):{blur:number;distance:number}=>{const d=defaultEffect(kind,'d','#ffffff');return {blur:d.blur??8,distance:d.distance??12};};
const shadowDelta=(e:LayerEffect):[number,number]=>{const r=(e.angle??45)*Math.PI/180,d=e.kind==='shadow'||e.kind==='innerShadow'?e.distance??(e.kind==='shadow'?12:8):0;return [Math.round(Math.cos(r)*d*1000)/1000,Math.round(Math.sin(r)*d*1000)/1000];};

const rgb=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
/** Tint uses a luminance-to-colour matrix, preserving alpha. Ordered with blur in SVG filter definitions. */
export function effectPrimitives(layer:Layer,tick=0):string{
 return (layer.effects??[]).filter(e=>!effectBypassed(e,tick)).map((original,n)=>{const e={...original,amount:original.animation?Math.max(0,Math.min(original.kind==='blur'?64:1,evaluate(original.animation,tick) as number)):original.amount};
  if(e.kind==='blur')return `<feGaussianBlur stdDeviation="${e.amount}"/>`;
  if(e.kind==='innerShadow'||e.kind==='innerGlow'){const [dx,dy]=shadowDelta(e),k=`is${n}`;
   return `<feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0" result="${k}a"/><feComponentTransfer in="${k}a" result="${k}b"><feFuncA type="table" tableValues="1 0"/></feComponentTransfer><feGaussianBlur in="${k}b" stdDeviation="${e.blur??(e.kind==='innerGlow'?10:8)}" result="${k}c"/><feOffset in="${k}c" dx="${dx}" dy="${dy}" result="${k}d"/><feFlood flood-color="${effectColor(e,tick)}" flood-opacity="${e.amount}" result="${k}e"/><feComposite in="${k}e" in2="${k}d" operator="in" result="${k}f"/><feComposite in="${k}f" in2="${k}a" operator="in" result="${k}g"/><feMerge><feMergeNode in="${k}a"/><feMergeNode in="${k}g"/></feMerge>`;}
  if(e.kind==='shadow'||e.kind==='glow'){const [dx,dy]=shadowDelta(e),pass=`<feDropShadow dx="${dx}" dy="${dy}" stdDeviation="${e.blur??(e.kind==='glow'?12:8)}" flood-color="${effectColor(e,tick)}" flood-opacity="${e.amount}"/>`;return e.kind==='glow'?pass+pass:pass;}
  const color=rgb(effectColor(e,tick)),a=e.amount,rows=color.map((c,i)=>[0.2126,0.7152,0.0722].map((w,j)=>w*c*a+(i===j?1-a:0)).join(' ')+' 0 0');
  return `<feColorMatrix type="matrix" values="${rows.join(' ')} 0 0 0 1 0"/>`;
 }).join('');
}
/** Three-sigma growth for each blur pass; source-space bounds also cover editable text conservatively. */
export function effectBounds(layer:Layer,tick=0){
 const live=(layer.effects??[]).filter(e=>!effectBypassed(e,tick));
 const blur=live.filter(e=>e.kind==='blur').reduce((n,e)=>n+(e.animation?Math.max(0,Math.min(64,evaluate(e.animation,tick) as number)):e.amount)*3,0)
  +live.filter(e=>e.kind==='shadow'||e.kind==='glow').reduce((n,e)=>n+(e.blur??(e.kind==='glow'?12:8))*(e.kind==='glow'?6:3)+(e.kind==='shadow'?e.distance??12:0),0);
 const strokePad=layer.stroke?.width??0;
 const width=layer.kind==='text'?(layer.source.size??48)*(layer.source.text?.length??1):layer.source.width??1;
 const height=layer.kind==='text'?(layer.source.size??48)*1.5:layer.source.height??1;
 return {x:-blur-strokePad,y:-blur-strokePad,width:width+(blur+strokePad)*2,height:height+(blur+strokePad)*2};
}

/** Unicode code points, not UTF-16 code units. Typewriter never evaluates scripts or markup. */
export function revealedText(layer:Layer,tick:number):string{
 const text=Array.from(layer.source.text??'');const percent=layer.textReveal?Math.max(0,Math.min(100,evaluate(layer.textReveal,tick) as number)):100;
 return text.slice(0,Math.floor(text.length*percent/100+1e-9)).join('');
}

/** Bypass is hold/discrete. Before the first explicit key, use the effect's static enabled flag. */
export function effectBypassed(effect:LayerEffect,tick:number):boolean{let bypass=!effect.enabled;for(const k of effect.bypassKeys??[]){if(k.t>tick)break;bypass=k.bypass;}return bypass;}
/** Linear RGB-channel colour interpolation, alpha unchanged. */
export function effectColor(effect:LayerEffect,tick:number):string{
 const keys=effect.colorKeys;if(!keys?.length)return effect.color;if(tick<=keys[0].t)return keys[0].color;
 let a=keys[0];for(const b of keys.slice(1)){if(tick<b.t){const u=(tick-a.t)/(b.t-a.t),av=rgb(a.color),bv=rgb(b.color);return '#'+av.map((v,i)=>Math.round((v+(bv[i]-v)*u)*255).toString(16).padStart(2,'0')).join('');}a=b;}return a.color;
}
export function strokeAttributes(layer:Layer,tick:number):{stroke:string;strokeWidth:number;pathLength:number;strokeDasharray:string;strokeDashoffset:number;fill:string;strokeLinejoin?:'round'|'bevel';strokeLinecap?:'round'|'square'}|undefined{
 if(layer.kind!=='shape'||!layer.stroke)return undefined;const s=layer.stroke,trim=s.trim?Math.min(100,Math.max(0,evaluate(s.trim,tick) as number)):100,dash=s.dash?evaluate(s.dash,tick) as number:0;
 return {stroke:s.color,strokeWidth:s.width,pathLength:100,strokeDasharray:trim<100?`${trim} 100`:s.dash?'8 4':'100 0',strokeDashoffset:dash,fill:layer.source.color??'none',...(s.join==='round'||s.join==='bevel'?{strokeLinejoin:s.join}:{}),...(s.cap==='round'||s.cap==='square'?{strokeLinecap:s.cap}:{})};
}
