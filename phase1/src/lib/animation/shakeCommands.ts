import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,type Layer,type PropValue} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
import {evaluate} from './interpolate';
import {frameToTick,snapToFrame} from './time';
import {shakeOffsets,MAX_SHAKE_FRAMES} from './shake';
/** Shake: a decaying rattle on the position of the ticked layers, from the playhead, like an impact. Baked as linear keys, one per frame. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_SHAKE_LAYERS=30,MAX_SHAKE_AMOUNT=200;
export const shakeSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.shake',title:'Shake the ticked layers from the playhead like an impact',category:'Edit',level:'ui',keywords:['animation','shake','impact','hit','rumble','rattle','vibrate','earthquake','bump','position'],
 params:{type:'object',properties:{amount:{type:'number',minimum:1,maximum:MAX_SHAKE_AMOUNT},frames:{type:'integer',minimum:2,maximum:MAX_SHAKE_FRAMES},seed:{type:'integer',minimum:0,maximum:99999},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_SHAKE_LAYERS}},additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>0;},
 run:((p:{amount?:number;frames?:number;seed?:number;layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const amount=p.amount??12,frames=p.frames??12,seed=p.seed??1;
  if(!Number.isFinite(amount)||amount<1||amount>MAX_SHAKE_AMOUNT)return expected(`The shake size is 1 to ${MAX_SHAKE_AMOUNT} pixels.`);
  if(!Number.isInteger(frames)||frames<2||frames>MAX_SHAKE_FRAMES)return expected(`The shake lasts 2 to ${MAX_SHAKE_FRAMES} frames.`);
  if(!Number.isInteger(seed)||seed<0||seed>99999)return expected('The seed is a whole number from 0 to 99999.');
  const ls=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].slice(0,MAX_SHAKE_LAYERS).map(id=>findLayer(c,id)).filter((l):l is Layer=>!!l&&!l.locked&&l.kind!=='audio');
  if(!ls.length)return expected('Tick at least one unlocked layer.');
  const t0=snapToFrame(s.getState().view.playhead,c.fps),end=t0+frameToTick(frames,c.fps);
  if(end>c.duration)return expected('Move the playhead earlier: the shake needs room before the end of the composition.');
  const edits:Edit[]=[];let done=0,skipped=0;
  ls.forEach((l,i)=>{
   const pr=l.transform.position;
   if(pr.modifiers?.length||t0<l.inT||end>l.outT){skipped++;return;}
   const offs=shakeOffsets(frames,amount,seed+i*7919),times=offs.map((_,j)=>t0+frameToTick(j,c.fps));
   const base=times.map(t=>evaluate(pr,t) as readonly number[]);
   for(const k of pr.keys)if(k.t>=t0&&k.t<=end)edits.push({type:'key.remove',layer:l.id,prop:'position',t:k.t});
   times.forEach((t,j)=>edits.push({type:'key.add',layer:l.id,prop:'position',t},{type:'prop.set',layer:l.id,prop:'position',t,value:[Math.round((base[j][0]+offs[j][0])*100)/100,Math.round((base[j][1]+offs[j][1])*100)/100] as unknown as PropValue as never},{type:'key.interp',layer:l.id,prop:'position',t,interp:'linear'}));
   done++;
  });
  if(!done)return expected('No ticked layer can shake here (position has modifiers, or the playhead range is outside the layer).');
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {layers:done,skipped,frames};
 }) as (p:unknown)=>unknown}];
