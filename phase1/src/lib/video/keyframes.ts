/**
 * Keyframed properties: small ascending key lists in clip-local seconds with linear or smoothstep interpolation.
 * Pure helpers shared by the model, the export pipeline and the preview - same discipline as transitionVisual.
 */

/** One key: local time t (seconds, ascending), value v, and the easing of the segment STARTING at this key. */
export interface Key<T>{t:number;v:T;e?:'linear'|'smooth'}

/** Segment easing: linear or smoothstep. Hold steps are expressed as two keys with the same value. */
const ease=(e:Key<unknown>['e'],p:number)=>e==='smooth'?p*p*(3-2*p):p;

/**
 * The animated value at local time t. Outside the key range the first/last key holds; an absent or empty
 * list falls back to the static field, so every existing project behaves identically.
 */
export function valueAt<T>(keys:readonly Key<T>[]|undefined,t:number,lerp:(a:T,b:T,p:number)=>T,fallback:T):T{
 if(!keys||!keys.length)return fallback;
 if(t<=keys[0].t)return keys[0].v;
 const last=keys[keys.length-1];
 if(t>=last.t)return last.v;
 for(let i=0;i<keys.length-1;i++){
  const a=keys[i],b=keys[i+1];
  if(t<b.t)return lerp(a.v,b.v,ease(a.e,Math.min(1,Math.max(0,(t-a.t)/Math.max(1e-9,b.t-a.t)))));
 }
 return last.v;
}

export const lerpNumber=(a:number,b:number,p:number)=>a+(b-a)*p;

/**
 * Inserts or replaces a key at local time t (keys within 30 ms merge). The first key seeds t=0 with the
 * current static value, so frames before the first placed key keep the look the user started from.
 */
export function upsertKey<T>(keys:readonly Key<T>[]|undefined,seed:Key<T>,t:number,v:T):Key<T>[]{
 const list=keys?.length?[...keys]:[seed];
 const tt=Math.max(0,Number(t.toFixed(3)));
 const i=list.findIndex(k=>Math.abs(k.t-tt)<0.03);
 if(i>=0)list[i]={...list[i],v};
 else list.push({t:tt,v});
 return list.sort((a,b)=>a.t-b.t);
}

/** Validates raw key lists (from project files or edits): finite ascending times clamped to [0,duration], mapped values, junk dropped. */
export function sanitizeKeys<T>(keys:unknown,duration:number,mapV:(v:unknown)=>T|null):Key<T>[]|undefined{
 if(!Array.isArray(keys))return undefined;
 const out=keys.flatMap(k=>{
  if(!k||typeof k!=='object')return[];
  const o=k as Record<string,unknown>;
  const t=typeof o.t==='number'&&Number.isFinite(o.t)?Math.min(Math.max(0,o.t),Math.max(0,duration)):null;
  const v=mapV(o.v);
  if(t===null||v===null)return[];
  const key:Key<T>={t:Number(t.toFixed(3)),v};
  if(o.e==='smooth')key.e='smooth';
  return[key];
 }).sort((a,b)=>a.t-b.t);
 // Same-time duplicates: the later entry wins.
 const dedup=out.filter((k,i)=>i===out.length-1||out[i+1].t>k.t);
 return dedup.length?dedup:undefined;
}
