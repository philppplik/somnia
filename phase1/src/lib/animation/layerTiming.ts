import type {Composition} from './model';
import type {Edit} from './edit';
import {snapToFrame,frameToTick} from './time';
/** Layer timing tools: set in or out to the playhead, stagger in-points, put in-points on markers. They only move in and out; keyframes stay where they are. Pure and bounded. */
export const TIMING_MODES=['in','out','stagger','markers'] as const;
export type TimingMode=typeof TIMING_MODES[number];
export const MAX_TIMING_LAYERS=50,MAX_STAGGER_FRAMES=600;
export interface TimingPlan{edits:Edit[];changed:number;skipped:number}
/** Layers that cannot take a timing edit (audio, locked, missing) are dropped with the skipped count; the order of `ids` is kept. */
export function timingPlan(c:Composition,ids:readonly string[],mode:TimingMode,opts:{playhead:number;frames?:number}):TimingPlan{
 const u=[...new Set(ids)].slice(0,MAX_TIMING_LAYERS);let skipped=0;
 const ls=u.map(id=>c.layers.find(l=>l.id===id)).filter((l):l is NonNullable<typeof l>=>{const ok=!!l&&l.kind!=='audio'&&!l.locked;if(!ok)skipped++;return ok;});
 const end=c.duration,snap=(t:number)=>snapToFrame(t,c.fps),edits:Edit[]=[];let changed=0;
 const markers=[...(c.markers??[])].map(m=>snap(m.t)).sort((a,b)=>a-b);
 const frames=Math.min(MAX_STAGGER_FRAMES,Math.max(0,Math.round(opts.frames??0)));
 const base=ls.length?ls[0].inT:0;
 ls.forEach((l,i)=>{
  let inT=l.inT,outT=l.outT;
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
