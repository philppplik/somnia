import {evaluate} from './interpolate';
import {WIGGLE_MAX_AMPLITUDE,WIGGLE_MAX_FREQUENCY,type Modifier} from './modifierModel';
export type {Modifier} from './modifierModel';
export {WIGGLE_MAX_AMPLITUDE,WIGGLE_MAX_FREQUENCY,validateModifiers,linkProblems,LINK_PROPS,MAX_LINK_DEPTH,type LinkProp} from './modifierModel';
import type {Property,PropValue,Vec2} from './model';
import {TICKS_PER_SECOND} from './time';
/** Looks up another layer's evaluated property at a tick (undefined when the layer is missing or the chain is too deep). */
export type LinkResolver=(layer:string,prop:string,t:number)=>PropValue|undefined;
/** Expression-free post-evaluation modifiers. Deterministic, bounded, serialised inside the document. */
/** Deterministic value noise in [-1,1]: hashed lattice, smoothstep interpolation. Same seed+x always yields the same value. */
const hash=(i:number,seed:number)=>{const s=Math.sin(i*127.1+seed*311.7)*43758.5453;return (s-Math.floor(s))*2-1;};
const noise=(x:number,seed:number)=>{const i=Math.floor(x),f=x-i,s=f*f*(3-2*f);return hash(i,seed)+(hash(i+1,seed)-hash(i,seed))*s;};
/** Time remapped by the first loop modifier. Without keys there is nothing to loop. */
export const loopTime=(p:Property,t:number):{t:number;cycles:number}=>{
 const m=(p.modifiers??[]).find((x):x is Extract<Modifier,{type:'loop'}>=>x.type==='loop');
 const k=p.keys;if(!m||k.length<2)return {t,cycles:0};
 const span=k[k.length-1].t-k[0].t;if(span<=0)return {t,cycles:0};
 const rel=t-k[0].t,n=Math.floor(rel/span),u=rel-n*span;
 if(m.mode==='pingpong')return {t:k[0].t+(n%2?span-u:u),cycles:0};
 return {t:k[0].t+u,cycles:m.mode==='offset'?n:0};
};
/** Value at t with modifiers applied: loop remaps time (offset accumulates the keyed delta), wiggle adds seeded noise per channel. */
export function evaluateMod(p:Property,t:number,links?:LinkResolver):PropValue{
 const {t:lt,cycles}=loopTime(p,t);
 let v=evaluate(p,lt);
 if(cycles&&p.keys.length>=2){const k=p.keys,d=sub(k[k.length-1].v,k[0].v);v=add(v,scale(d,cycles));}

 const lk=(p.modifiers??[]).find((x):x is Extract<Modifier,{type:'link'}>=>x.type==='link');
 if(lk&&links){const src=links(lk.layer,lk.prop,t);
  if(typeof src==='number'&&typeof v==='number')v=src*lk.multiplier+lk.offset;
  else if(Array.isArray(src)&&Array.isArray(v))v=[src[0]*lk.multiplier+lk.offset,src[1]*lk.multiplier+lk.offset];}
 const w=(p.modifiers??[]).filter((x):x is Extract<Modifier,{type:'wiggle'}>=>x.type==='wiggle');
 if(!w.length)return v;
 if(typeof v==='number')return w.reduce((acc,m)=>acc+m.amplitude*noise(t/TICKS_PER_SECOND*m.frequency,m.seed),v);
 const out:[number,number]=[v[0],v[1]];
 for(const m of w){out[0]+=m.amplitude*noise(t/TICKS_PER_SECOND*m.frequency,m.seed);out[1]+=m.amplitude*noise(t/TICKS_PER_SECOND*m.frequency,m.seed+100003);}
 return out;
}
const sub=(a:PropValue,b:PropValue):PropValue=>typeof a==='number'&&typeof b==='number'?a-b:[(a as Vec2)[0]-(b as Vec2)[0],(a as Vec2)[1]-(b as Vec2)[1]];
const add=(a:PropValue,b:PropValue):PropValue=>typeof a==='number'?a+(b as number):[a[0]+(b as Vec2)[0],a[1]+(b as Vec2)[1]];
const scale=(a:PropValue,n:number):PropValue=>typeof a==='number'?a*n:[a[0]*n,a[1]*n];
/** Validation errors for one modifier list (empty when valid). */
