import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {EditError} from './edit';
import {timingPlan,TIMING_MODES,MAX_TIMING_LAYERS,MAX_STAGGER_FRAMES,type TimingMode} from './layerTiming';
/** Layer timing tools as one command. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const layerTimingSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.timing.apply',title:'Set layer in and out points on several layers',category:'Edit',level:'ui',keywords:['animation','timing','trim','stagger','markers','in','out'],
 params:{type:'object',properties:{layers:{type:'array',items:{type:'string',minLength:1,maxLength:64},minItems:1,maxItems:MAX_TIMING_LAYERS},mode:{enum:[...TIMING_MODES]},frames:{type:'integer',minimum:-MAX_STAGGER_FRAMES,maximum:MAX_STAGGER_FRAMES}},required:['layers','mode'],additionalProperties:false},
 enabled:()=>!!animationSession().document,
 run:((p:{layers:string[];mode:TimingMode;frames?:number})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const r=timingPlan(c,p.layers,p.mode,{playhead:s.getState().view.playhead,frames:p.frames});
  if(!r.edits.length)return expected(r.skipped?'No layer can take that timing.':'The layers already have that timing.');
  try{s.dispatch(r.edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {changed:r.changed,skipped:r.skipped};
 }) as (p:unknown)=>unknown}];
