import {evaluate} from './interpolate';
import type {Layer} from './model';
const rgb=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
/** Tint uses a luminance-to-colour matrix, preserving alpha. Ordered with blur in SVG filter definitions. */
export function effectPrimitives(layer:Layer,tick=0):string{
 return (layer.effects??[]).filter(e=>e.enabled).map(original=>{const e={...original,amount:original.animation?Math.max(0,Math.min(original.kind==='blur'?64:1,evaluate(original.animation,tick) as number)):original.amount};
  if(e.kind==='blur')return `<feGaussianBlur stdDeviation="${e.amount}"/>`;
  const color=rgb(e.color),a=e.amount,rows=color.map((c,i)=>[0.2126,0.7152,0.0722].map((w,j)=>w*c*a+(i===j?1-a:0)).join(' ')+' 0 0');
  return `<feColorMatrix type="matrix" values="${rows.join(' ')} 0 0 0 1 0"/>`;
 }).join('');
}
/** Three-sigma growth for each blur pass; source-space bounds also cover editable text conservatively. */
export function effectBounds(layer:Layer,tick=0){
 const blur=(layer.effects??[]).filter(e=>e.enabled&&e.kind==='blur').reduce((n,e)=>n+(e.animation?Math.max(0,Math.min(64,evaluate(e.animation,tick) as number)):e.amount)*3,0);
 const width=layer.kind==='text'?(layer.source.size??48)*(layer.source.text?.length??1):layer.source.width??1;
 const height=layer.kind==='text'?(layer.source.size??48)*1.5:layer.source.height??1;
 return {x:-blur,y:-blur,width:width+blur*2,height:height+blur*2};
}

/** Unicode code points, not UTF-16 code units. Typewriter never evaluates scripts or markup. */
export function revealedText(layer:Layer,tick:number):string{
 const text=Array.from(layer.source.text??'');const percent=layer.textReveal?Math.max(0,Math.min(100,evaluate(layer.textReveal,tick) as number)):100;
 return text.slice(0,Math.floor(text.length*percent/100+1e-9)).join('');
}
