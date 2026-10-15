import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,type Layer} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
import {frameToTick,snapToFrame} from './time';
import {flickerKeys,MAX_FLICKER_FRAMES} from './flicker';
/** Flicker: the ticked layers stutter like a failing neon sign from the start of the work area and settle on their opacity. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_FLICKER_LAYERS=30;
export const flickerSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.flicker',title:'Flicker the ticked layers like a failing sign',category:'Edit',level:'ui',keywords:['animation','flicker','neon','blink','strobe','glitch','light','sign','stutter','opacity'],
 params:{type:'object',properties:{frames:{type:'integer',minimum:2,maximum:MAX_FLICKER_FRAMES},seed:{type:'integer',minimum:0,maximum:99999},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_FLICKER_LAYERS}},additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>0;},
 run:((p:{frames?:number;seed?:number;layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const frames=p.frames??24,seed=p.seed??1;
  if(!Number.isInteger(frames)||frames<2||frames>MAX_FLICKER_FRAMES)return expected(`The flicker lasts 2 to ${MAX_FLICKER_FRAMES} frames.`);
  if(!Number.isInteger(seed)||seed<0||seed>99999)return expected('The seed is a whole number from 0 to 99999.');
  const ls=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].slice(0,MAX_FLICKER_LAYERS).map(id=>findLayer(c,id)).filter((l):l is Layer=>!!l&&!l.locked&&l.kind!=='audio');
  if(!ls.length)return expected('Tick at least one unlocked layer.');
  const a=snapToFrame(c.workArea.in,c.fps),one=frameToTick(1,c.fps),edits:Edit[]=[];let done=0,skipped=0;
  ls.forEach((l,i)=>{
   const o=l.transform.opacity,t0=Math.max(a,l.inT),end=t0+frameToTick(frames,c.fps);
   if(o.keys.length||o.modifiers?.length||end>l.outT-one){skipped++;return;}
   // Each layer gets its own pattern so a group does not blink in unison.
   const ks=flickerKeys(frames,o.value as number,seed+i*7919);
   for(const k of ks){const t=t0+frameToTick(k.frame,c.fps);edits.push({type:'key.add',layer:l.id,prop:'opacity',t},{type:'prop.set',layer:l.id,prop:'opacity',t,value:k.value as never},{type:'key.interp',layer:l.id,prop:'opacity',t,interp:'hold'});}
   done++;
  });
  if(!done)return expected('No ticked layer can flicker (opacity already animated, or too short for the work area start).');
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {layers:done,skipped,frames};
 }) as (p:unknown)=>unknown}];
