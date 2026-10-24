import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {EditError} from './edit';
import {layerSetIds} from './layerSet';
import {frameToTick} from './time';
import {crossfadePlan,MAX_CROSS_LAYERS,MAX_CROSS_FRAMES,DEFAULT_CROSS_FRAMES} from './crossfade';
/** Crossfade ticked layers one into the next. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const crossfadeSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.crossfade',title:'Crossfade the ticked layers into each other',category:'Edit',level:'ui',keywords:['animation','crossfade','dissolve','transition','overlap','fade','sequence','slideshow'],
 params:{type:'object',properties:{frames:{type:'integer',minimum:1,maximum:MAX_CROSS_FRAMES},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:2,maxItems:MAX_CROSS_LAYERS}},additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>1;},
 run:((p:{frames?:number;layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const frames=p.frames??DEFAULT_CROSS_FRAMES;if(!Number.isInteger(frames)||frames<1||frames>MAX_CROSS_FRAMES)return expected(`Overlap is 1 to ${MAX_CROSS_FRAMES} frames.`);
  const ids=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].slice(0,MAX_CROSS_LAYERS);
  if(ids.length<2)return expected('Tick at least two layers.');
  const plan=crossfadePlan(c,ids,frameToTick(frames,c.fps),frameToTick(1,c.fps));
  if(!plan.edits.length)return expected('Nothing to crossfade: layers need different start times, no animated opacity, and room for the overlap before the composition ends.');
  try{s.dispatch(plan.edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {joins:plan.joins,skipped:plan.skipped,frames};
 }) as (p:unknown)=>unknown}];
