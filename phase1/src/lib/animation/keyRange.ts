import type {Composition,KeyRef} from './model';
/** Transform keys of the given layers on one side of a time: before (earlier), after (later), or both sides including the time itself with `at`. */
export type KeyRangeSide='before'|'after'|'at';
export const KEY_RANGE_SIDES:readonly KeyRangeSide[]=['before','after','at'];
export function keysAround(c:Composition,layers:readonly string[],t:number,side:KeyRangeSide):KeyRef[]{
 return c.layers.filter(l=>layers.includes(l.id)).flatMap(l=>(Object.keys(l.transform) as KeyRef['prop'][]).flatMap(prop=>l.transform[prop].keys.filter(k=>side==='at'?k.t===t:side==='after'?k.t>=t:k.t<=t).map(k=>({layer:l.id,prop,t:k.t}))));
}
