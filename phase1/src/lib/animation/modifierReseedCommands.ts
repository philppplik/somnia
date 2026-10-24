import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer} from './model';
import {EditError} from './edit';
import {layerSetIds} from './layerSet';
import {reseedPlan} from './modifierReseed';
import {MAX_DUPLICATE_LAYERS} from './layerDuplicate';
/** Give the wiggles of the selected layers new seeds. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const modifierReseedSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.modifiers.reseed',title:'Reseed the wiggles of the selected layers',category:'Edit',level:'ui',keywords:['animation','wiggle','seed','random','noise','reseed','crowd','duplicate'],
 params:{type:'object',properties:{layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_DUPLICATE_LAYERS},seed:{type:'integer',minimum:0,maximum:2147483647}},additionalProperties:false},
 // The Rig menu passes its own ticked layers, so this must not depend on the timeline selection; run() reports an empty set.
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>0;},
 run:((p:{layers?:string[];seed?:number}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const ids=(p.layers??layerSetIds(s.getState().view.selectedLayer)).filter(id=>!!findLayer(c,id));
  if(!ids.length)return expected('Select a layer first.');
  const r=reseedPlan(c,ids,p.seed??Math.floor(Math.random()*2147483647));
  if(!r.edits.length)return expected(r.skippedLocked?'The layers with wiggles are locked.':'The selected layers have no wiggle.');
  try{s.dispatch(r.edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {wiggles:r.edits.length,skippedLocked:r.skippedLocked};
 }) as (p:unknown)=>unknown}];
