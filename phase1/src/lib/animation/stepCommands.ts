import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,TRANSFORM_KEYS,type Layer,type PropValue} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
import {evaluate} from './interpolate';
import {frameToTick,snapToFrame} from './time';
/** Animate on twos (threes, fours): re-key animated transform properties as held poses every N frames inside the work area, sampled from the current motion. The classic stylised, hand-drawn rhythm. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_STEP_LAYERS=30,MAX_STEP_FRAMES=12,MAX_STEP_KEYS=240;
/** Sample times in ticks: the work area start, then every `step` ticks while inside the work area. */
export function stepTimes(a:number,b:number,step:number):number[]{const out:number[]=[];for(let t=a;t<=b;t+=step)out.push(t);return out;}
export const stepSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.stepMotion',title:'Animate the ticked layers on twos, threes or fours',category:'Edit',level:'ui',keywords:['animation','twos','threes','fours','stepped','hold','stop motion','choppy','hand drawn','framerate','posterize','time'],
 params:{type:'object',properties:{frames:{type:'integer',minimum:2,maximum:MAX_STEP_FRAMES},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_STEP_LAYERS}},additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>0;},
 run:((p:{frames?:number;layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const n=p.frames??2;if(!Number.isInteger(n)||n<2||n>MAX_STEP_FRAMES)return expected(`Hold each pose for 2 to ${MAX_STEP_FRAMES} frames.`);
  const ls=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].slice(0,MAX_STEP_LAYERS).map(id=>findLayer(c,id)).filter((l):l is Layer=>!!l&&!l.locked&&l.kind!=='audio');
  if(!ls.length)return expected('Tick at least one unlocked layer.');
  const a=snapToFrame(c.workArea.in,c.fps),b=c.workArea.out,step=frameToTick(n,c.fps);
  if(b<=a)return expected('The work area is empty.');
  const times=stepTimes(a,b,step);if(times.length>MAX_STEP_KEYS)return expected(`That is more than ${MAX_STEP_KEYS} poses per property: narrow the work area or hold poses longer.`);
  const edits:Edit[]=[];let props=0,skipped=0;
  for(const l of ls)for(const prop of TRANSFORM_KEYS){
   const pr=l.transform[prop];if(!pr||pr.keys.length<2)continue;
   if(pr.modifiers?.length){skipped++;continue;}
   const samples=times.map(t=>evaluate(pr,t) as PropValue);
   for(const k of pr.keys)if(k.t>=a&&k.t<=b)edits.push({type:'key.remove',layer:l.id,prop:prop,t:k.t});
   times.forEach((t,i)=>edits.push({type:'key.add',layer:l.id,prop:prop,t},{type:'prop.set',layer:l.id,prop:prop,t,value:samples[i] as never},{type:'key.interp',layer:l.id,prop:prop,t,interp:'hold'}));
   props++;}
  if(!props)return expected(skipped?'The animated properties have modifiers (wiggle, loop, link, spring), which are not baked here.':'None of the ticked layers has an animated property with two or more keys.');
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {properties:props,poses:times.length,skipped,frames:n};
 }) as (p:unknown)=>unknown}];
