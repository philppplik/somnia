import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
import {frameToTick} from './time';
/** Fade the selected layers in and/or out with opacity keys at their in and out points. Own file so the big command array keeps cheap type inference. */
export const FADE_MODES=['in','out','both'] as const;
export type FadeMode=typeof FADE_MODES[number];
export const MAX_FADE_LAYERS=50,MAX_FADE_FRAMES=240,DEFAULT_FADE_FRAMES=12;
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const layerFadeSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.fade',title:'Fade the selected layers in or out',category:'Edit',level:'ui',keywords:['animation','layer','fade','in','out','opacity','dissolve','transition'],
 params:{type:'object',properties:{mode:{type:'string',enum:[...FADE_MODES]},frames:{type:'integer',minimum:1,maximum:MAX_FADE_FRAMES},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_FADE_LAYERS}},required:['mode'],additionalProperties:false},
 // The Rig menu passes its own ticked layers, so this must not depend on the timeline selection.
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>0;},
 run:((p:{mode:FadeMode;frames?:number;layers?:string[]})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  if(!FADE_MODES.includes(p?.mode))return expected('Unknown fade mode.');
  const frames=p.frames??DEFAULT_FADE_FRAMES;if(!Number.isInteger(frames)||frames<1||frames>MAX_FADE_FRAMES)return expected(`Fade length must be a whole number of frames from 1 to ${MAX_FADE_FRAMES}.`);
  const ls=(p.layers??layerSetIds(s.getState().view.selectedLayer)).slice(0,MAX_FADE_LAYERS).map(id=>findLayer(c,id)).filter(l=>!!l);
  if(!ls.length)return expected('Select a layer first.');
  const len=frameToTick(frames,c.fps),one=frameToTick(1,c.fps),edits:Edit[]=[];let skipped=0;
  for(const l of ls){
   if(l!.kind==='audio'&&l!.audio){
    // Audio fades the clip volume, in composition time, between where the clip starts and ends playing.
    const a=l!.audio,start=Math.max(0,l!.inT+l!.offset),end=Math.min(c.duration,l!.outT+l!.offset)-one,full=a.volume.value as number;
    if(l!.locked||a.volume.keys.length||end-start<=one*(p.mode==='both'?2*frames:frames)){skipped++;continue;}
    edits.push({type:'audio.volume.animate',layer:l!.id,on:true,t:start});
    if(p.mode!=='out')edits.push({type:'audio.volume.set',layer:l!.id,value:0,t:start},{type:'audio.volume.animate',layer:l!.id,on:true,t:start+len},{type:'audio.volume.set',layer:l!.id,value:full,t:start+len});
    if(p.mode!=='in')edits.push({type:'audio.volume.animate',layer:l!.id,on:true,t:end-len},{type:'audio.volume.set',layer:l!.id,value:full,t:end-len},{type:'audio.volume.animate',layer:l!.id,on:true,t:end},{type:'audio.volume.set',layer:l!.id,value:0,t:end});
    continue;
   }
   const o=l!.transform.opacity;
   if(l!.locked||l!.kind==='audio'||o.keys.length||l!.outT-l!.inT<=one*(p.mode==='both'?2*frames:frames)){skipped++;continue;}
   const full=o.value as number,first=l!.inT,last=l!.outT-one;
   edits.push({type:'prop.animate',layer:l!.id,prop:'opacity',on:true,t:first});
   if(p.mode!=='out'){edits.push({type:'prop.set',layer:l!.id,prop:'opacity',value:0,t:first},{type:'prop.set',layer:l!.id,prop:'opacity',value:full,t:first+len});}
   if(p.mode!=='in'){edits.push({type:'prop.set',layer:l!.id,prop:'opacity',value:full,t:last-len},{type:'prop.set',layer:l!.id,prop:'opacity',value:0,t:last});}
  }
  if(!edits.length)return expected('No selected layer can be faded (locked, opacity or volume already animated, or too short).');
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {faded:ls.length-skipped,skipped};
 }) as (p:unknown)=>unknown}];
