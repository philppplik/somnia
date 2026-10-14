import {findComp,findLayer,TRANSFORM_KEYS,type AnimationDocument,type KeyRef} from './model';
export const sameKey=(a:KeyRef,b:KeyRef)=>a.layer===b.layer&&a.prop===b.prop&&a.t===b.t;
const has=(list:readonly KeyRef[],k:KeyRef)=>list.some(x=>sameKey(x,k));
/** Drops references to keys that no longer exist (after undo, delete or a layer change). */
export function pruneSelection(doc:AnimationDocument|null,sel:readonly KeyRef[]):KeyRef[]{
 const comp=doc&&findComp(doc);if(!comp)return [];
 return sel.filter(r=>findLayer(comp,r.layer)?.transform[r.prop]?.keys.some(k=>k.t===r.t));
}
/** Click semantics: plain click replaces the selection, shift or ctrl toggles one key. */
export function clickSelect(sel:readonly KeyRef[],k:KeyRef,additive:boolean):KeyRef[]{
 if(!additive)return has(sel,k)&&sel.length===1?[...sel]:[k];
 return has(sel,k)?sel.filter(x=>!sameKey(x,k)):[...sel,k];
}
/** Marquee semantics: `hit` replaces the base unless additive, in which case it is unioned with it. */
export function marqueeSelect(base:readonly KeyRef[],hit:readonly KeyRef[],additive:boolean):KeyRef[]{
 const out=additive?[...base]:[];for(const k of hit)if(!has(out,k))out.push(k);return out;
}
/** Selection after the keys were moved by `ticks`. */
export const shiftSelection=(sel:readonly KeyRef[],ticks:number):KeyRef[]=>sel.map(k=>({...k,t:k.t+ticks}));
/** Every key of every animated transform property of a layer. */
export function allKeysOf(doc:AnimationDocument,layerId:string):KeyRef[]{
 const l=findLayer(findComp(doc),layerId);if(!l)return [];
 return TRANSFORM_KEYS.flatMap(prop=>l.transform[prop].keys.map(k=>({layer:layerId,prop,t:k.t})));
}
/** Axis-aligned rectangle overlap, for marquee hit tests. */
export const rectsOverlap=(a:{l:number;t:number;r:number;b:number},b:{l:number;t:number;r:number;b:number})=>a.l<=b.r&&a.r>=b.l&&a.t<=b.b&&a.b>=b.t;
