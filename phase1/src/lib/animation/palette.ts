import type {Layer,LayerEffect} from './model';
/** Colour palette of a composition: every solid colour of solid, shape and text fills and shape strokes, with how many layers use it. */
export const MAX_PALETTE=12;
export const HEX=/^#[0-9a-fA-F]{6}$/;
export interface PaletteEntry{color:string;layers:number}
type Grad=NonNullable<Layer['source']['gradient']>;
export interface StaticChange{source?:Record<string,unknown>;stroke?:NonNullable<Layer['stroke']>;effects?:readonly LayerEffect[]}
/** Every static colour of a layer through `f`: flat fill, gradients (fill and stroke, stops included), stroke and effect colours. Returns only what changed. `withKeys` also maps the effect colour keys. Colour keys of layers and gradients are not touched here. */
export function mapStatic(l:Layer,f:(hex:string)=>string,withKeys=false):StaticChange|null{
 const g=(c:string)=>{if(!HEX.test(c))return c;const n=f(c);return n.toLowerCase()===c.toLowerCase()?c:n;};
 const grad=(x:Grad):Grad=>({...x,start:g(x.start),end:g(x.end),...(x.stops?{stops:x.stops.map(t=>({...t,color:g(t.color)}))}:{})});
 const out:StaticChange={},same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
 const src:Record<string,unknown>={};
 if(['solid','shape','text'].includes(l.kind)&&l.source.color){const n=g(l.source.color);if(n!==l.source.color)src.color=n;}
 if(['solid','shape'].includes(l.kind)&&l.source.gradient){const n=grad(l.source.gradient);if(!same(n,l.source.gradient))src.gradient=n;}
 if(Object.keys(src).length)out.source=src;
 if(l.kind==='shape'&&l.stroke){let st=l.stroke;const n=g(st.color);if(n!==st.color)st={...st,color:n};
  if(st.gradient){const ng=grad(st.gradient);if(!same(ng,st.gradient))st={...st,gradient:ng};}
  if(st!==l.stroke)out.stroke=st;}
 if(l.effects?.length){const ne=l.effects.map(e=>{const c=g(e.color);const ks=withKeys&&e.colorKeys?e.colorKeys.map(k=>({...k,color:g(k.color)})):e.colorKeys;
  return c===e.color&&same(ks,e.colorKeys)?e:{...e,color:c,...(ks?{colorKeys:ks}:{})};});
  if(ne.some((e,i)=>e!==l.effects![i]))out.effects=ne;}
 return Object.keys(out).length?out:null;
}
const uses=(l:Layer):string[]=>{const o:string[]=[];mapStatic(l,c=>{o.push(c.toLowerCase());return c;});return o;};
/** Colours in order of first use (top layer first), at most MAX_PALETTE. A layer counts once per colour. */
export function paletteOf(layers:readonly Layer[]):PaletteEntry[]{
 const m=new Map<string,number>();for(const l of layers)for(const c of new Set(uses(l)))m.set(c,(m.get(c)??0)+1);
 return [...m].slice(0,MAX_PALETTE).map(([color,layers])=>({color,layers}));
}
export type RecolorEdit=StaticChange&{layer:string};
/** Changes that swap `from` for `to` on the unlocked layers (fills, gradients, strokes, effects). */
export function recolor(layers:readonly Layer[],from:string,to:string):RecolorEdit[]{
 const f=from.toLowerCase(),t=to.toLowerCase(),out:RecolorEdit[]=[];
 if(f===t)return out;
 for(const l of layers){if(l.locked)continue;const e=mapStatic(l,c=>c.toLowerCase()===f?t:c);if(e)out.push({layer:l.id,...e});}
 return out;
}
