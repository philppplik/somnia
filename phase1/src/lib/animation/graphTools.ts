import {useSyncExternalStore} from 'react';
import type {Keyframe,KeyRef} from './model';
import type {Edit} from './edit';
/** Handle editing helpers for the value graph: snapping, mirrored handles and a clipboard for ease curves (view state, never saved). */
export type Ease2=readonly [number,number];
export const SNAP_STEP=0.05,EASE_Y_LO=-2,EASE_Y_HI=3;
const clamp=(n:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,n));
const val=(v:Keyframe['v'],ch:0|1)=>typeof v==='number'?v:v[ch];
const round=(n:number)=>Math.round(n*1e6)/1e6;
/** Snaps a handle to a 0.05 grid in progress space, kept inside the valid range. */
export const snapEase=(h:Ease2,step=SNAP_STEP):Ease2=>[clamp(round(Math.round(h[0]/step)*step),0,1),clamp(round(Math.round(h[1]/step)*step),EASE_Y_LO,EASE_Y_HI)];
/**
 * The opposite handle of key `i` that mirrors `ease` (the dragged handle) through the key, so the tangent stays smooth.
 * Both handles live on key `i`. Returns null when the other side has no bezier segment. A flat segment keeps `fallback` y.
 */
export function mirrorEase(keys:readonly Keyframe[],i:number,kind:'in'|'out',ease:Ease2,ch:0|1,fallback:Ease2):Ease2|null{
 const k=keys[i],prev=keys[i-1],next=keys[i+1];if(!k)return null;
 const kv=val(k.v,ch);
 if(kind==='out'){
  if(!next||!prev||prev.interp!=='bezier'||next.t<=k.t||k.t<=prev.t)return null;
  const dt=ease[0]*(next.t-k.t),dv=ease[1]*(val(next.v,ch)-kv),pv=val(prev.v,ch);
  return [clamp(1-dt/(k.t-prev.t),0,1),Math.abs(kv-pv)<1e-9?fallback[1]:clamp(1-dv/(kv-pv),EASE_Y_LO,EASE_Y_HI)];
 }
 if(!next||!prev||k.interp!=='bezier'||next.t<=k.t||k.t<=prev.t)return null;
 const dt=(1-ease[0])*(k.t-prev.t),pv=val(prev.v,ch),dv=(1-ease[1])*(kv-pv),nv=val(next.v,ch);
 return [clamp(dt/(next.t-k.t),0,1),Math.abs(nv-kv)<1e-9?fallback[1]:clamp(dv/(nv-kv),EASE_Y_LO,EASE_Y_HI)];
}
interface S{snap:boolean;mirror:boolean;curve:{out:Ease2;in:Ease2}|null}
let state:S={snap:true,mirror:false,curve:null};const ls=new Set<()=>void>();
const put=(n:Partial<S>)=>{state={...state,...n};ls.forEach(f=>f());};
export const graphTools=()=>state;
export const setGraphSnap=(snap:boolean)=>put({snap});
export const setGraphMirror=(mirror:boolean)=>put({mirror});
/** Remembers an ease curve (the out and in handles of one bezier key). */
export function copyCurve(k:Keyframe|undefined){if(!k||k.interp!=='bezier')throw Object.assign(new Error('Select a key with a bezier ease.'),{expected:true});put({curve:{out:k.out,in:k.in}});}
/** One undoable edit that gives the copied curve to every selected key. */
export function pasteCurveEdit(keys:readonly KeyRef[]):Edit{
 const c=state.curve;if(!c)throw Object.assign(new Error('Copy an easing curve first.'),{expected:true});
 if(!keys.length)throw Object.assign(new Error('Select keys first.'),{expected:true});
 return {type:'keys.interp',keys:[...keys],interp:'bezier',out:c.out,in:c.in};
}
export const resetGraphTools=()=>{state={snap:true,mirror:false,curve:null};ls.forEach(f=>f());};
export function useGraphTools():S{return useSyncExternalStore(f=>{ls.add(f);return()=>{ls.delete(f);};},()=>state,()=>state);}
