import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,type Layer,type PropValue} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
import {evaluate} from './interpolate';
import {frameToTick,snapToFrame} from './time';
/** Swing: a damped pendulum on the rotation of the ticked layers, released from the playhead at an angle and settling back to the rest angle. The anchor is the pivot. Baked as linear keys, one per frame. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_SWING_LAYERS=30,MAX_SWING_FRAMES=120,MAX_SWING_ANGLE=180;
/** Extra angle (degrees) per frame 0..frames: starts at `amp`, swings through zero every half period, fades out and ends exactly on 0. */
export function swingAngles(frames:number,amp:number,period:number):number[]{
 const out:number[]=[];for(let j=0;j<=frames;j++)out.push(j===frames?0:Math.round(amp*Math.exp(-4*j/frames)*Math.cos((2*Math.PI*j)/period)*100)/100);return out;
}
export const swingSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.swing',title:'Swing the ticked layers like a pendulum from the playhead',category:'Edit',level:'ui',keywords:['animation','swing','pendulum','sway','dangle','hang','sign','antenna','rotation','settle','damped'],
 params:{type:'object',properties:{angle:{type:'number',minimum:1,maximum:MAX_SWING_ANGLE},frames:{type:'integer',minimum:4,maximum:MAX_SWING_FRAMES},period:{type:'integer',minimum:4,maximum:MAX_SWING_FRAMES},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_SWING_LAYERS}},additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>0;},
 run:((p:{angle?:number;frames?:number;period?:number;layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const angle=p.angle??25,frames=p.frames??60,period=p.period??24;
  if(!Number.isFinite(angle)||angle<1||angle>MAX_SWING_ANGLE)return expected(`The swing angle is 1 to ${MAX_SWING_ANGLE} degrees.`);
  if(!Number.isInteger(frames)||frames<4||frames>MAX_SWING_FRAMES)return expected(`The swing lasts 4 to ${MAX_SWING_FRAMES} frames.`);
  if(!Number.isInteger(period)||period<4||period>MAX_SWING_FRAMES)return expected(`One swing back and forth takes 4 to ${MAX_SWING_FRAMES} frames.`);
  const ls=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].slice(0,MAX_SWING_LAYERS).map(id=>findLayer(c,id)).filter((l):l is Layer=>!!l&&!l.locked&&l.kind!=='audio');
  if(!ls.length)return expected('Tick at least one unlocked layer.');
  const t0=snapToFrame(s.getState().view.playhead,c.fps),end=t0+frameToTick(frames,c.fps);
  if(end>c.duration)return expected('Move the playhead earlier: the swing needs room before the end of the composition.');
  const ex=swingAngles(frames,angle,period),times=ex.map((_,j)=>t0+frameToTick(j,c.fps)),edits:Edit[]=[];let done=0,skipped=0;
  for(const l of ls){
   const r=l.transform.rotation;
   if(r.modifiers?.length||t0<l.inT||end>l.outT){skipped++;continue;}
   const base=times.map(t=>evaluate(r,t) as number);
   for(const k of r.keys)if(k.t>=t0&&k.t<=end)edits.push({type:'key.remove',layer:l.id,prop:'rotation',t:k.t});
   times.forEach((t,j)=>edits.push({type:'key.add',layer:l.id,prop:'rotation',t},{type:'prop.set',layer:l.id,prop:'rotation',t,value:(Math.round((base[j]+ex[j])*100)/100) as unknown as PropValue as never},{type:'key.interp',layer:l.id,prop:'rotation',t,interp:'linear'}));
   done++;
  }
  if(!done)return expected('No ticked layer can swing here (rotation has modifiers, or the playhead range is outside the layer).');
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {layers:done,skipped,frames};
 }) as (p:unknown)=>unknown}];
