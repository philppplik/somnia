import type {Composition} from './model';
import type {Edit} from './edit';
import {snapToFrame,frameToTick} from './time';
import {layerKeyTimes} from './layerShift';
/** Layer timing tools. in, out, stagger and markers only move in and out (keyframes stay). slide moves the whole layer (in, out and every key) by N frames, slideTo moves it so it starts at the playhead, slip moves only the keys under the same in and out. sequence plays the layers one after the other in the given order: the first stays, each next one (keys included) moves so it starts N frames after the previous one ends. Pure and bounded. */
export const TIMING_MODES=['in','out','stagger','markers','slide','slip','slideTo','sequence'] as const;
/** Modes that take a frame count, and those where it may be negative. */
export const FRAME_MODES:readonly TimingMode[]=['stagger','slide','slip','sequence'],SIGNED_MODES:readonly TimingMode[]=['slide','slip'];
export type TimingMode=typeof TIMING_MODES[number];
export const MAX_TIMING_LAYERS=50,MAX_STAGGER_FRAMES=600;
export interface TimingPlan{edits:Edit[];changed:number;skipped:number}
/** Layers that cannot take a timing edit (audio, locked, missing) are dropped with the skipped count; the order of `ids` is kept. */
export function timingPlan(c:Composition,ids:readonly string[],mode:TimingMode,opts:{playhead:number;frames?:number}):TimingPlan{
 const u=[...new Set(ids)].slice(0,MAX_TIMING_LAYERS);let skipped=0;
 const ls=u.map(id=>c.layers.find(l=>l.id===id)).filter((l):l is NonNullable<typeof l>=>{const ok=!!l&&l.kind!=='audio'&&!l.locked;if(!ok)skipped++;return ok;});
 const end=c.duration,snap=(t:number)=>snapToFrame(t,c.fps),edits:Edit[]=[];let changed=0;
 const markers=[...(c.markers??[])].map(m=>snap(m.t)).sort((a,b)=>a-b);
 const signed=SIGNED_MODES.includes(mode),frames=Math.min(MAX_STAGGER_FRAMES,Math.max(signed?-MAX_STAGGER_FRAMES:0,Math.round(opts.frames??0)));
 const base=ls.length?ls[0].inT:0;let prevOut=ls.length?ls[0].outT:0;
 ls.forEach((l,i)=>{
  let inT=l.inT,outT=l.outT;
  if(mode==='sequence'){
   if(i===0)return;
   const delta=prevOut+frameToTick(frames,c.fps)-l.inT,lo=c.start,hi=c.start+c.duration;
   if(delta===0){prevOut=l.outT;return;}
   if(Math.abs(delta)>c.duration||layerKeyTimes(l).some(t=>t+delta<lo||t+delta>hi)||l.inT+delta<0||l.outT+delta>end){skipped++;prevOut=l.outT;return;}
   edits.push({type:'layer.shift',layer:l.id,delta,mode:'slide'});changed++;prevOut=l.outT+delta;return;
  }
  if(mode==='slide'||mode==='slip'||mode==='slideTo'){
   const delta=mode==='slideTo'?snap(opts.playhead)-l.inT:frameToTick(frames,c.fps);
   const lo=c.start,hi=c.start+c.duration;
   if(delta===0)return;
   if(Math.abs(delta)>c.duration||layerKeyTimes(l).some(t=>t+delta<lo||t+delta>hi)||(mode!=='slip'&&(l.inT+delta<0||l.outT+delta>end))){skipped++;return;}
   const how:'slide'|'slip'=mode==='slip'?'slip':'slide',shift:Edit={type:'layer.shift',layer:l.id,delta,mode:how};
   edits.push(shift);changed++;return;
  }
  if(mode==='in')inT=snap(opts.playhead);
  else if(mode==='out')outT=snap(opts.playhead);
  else if(mode==='stagger')inT=base+frameToTick(i*frames,c.fps);
  else{if(i>=markers.length){skipped++;return;}inT=markers[i];}
  if(inT<0||outT>end||outT<=inT){skipped++;return;}
  if(inT===l.inT&&outT===l.outT)return;
  edits.push({type:'layer.timing',layer:l.id,inT,outT});changed++;
 });
 return {edits,changed,skipped};
}
