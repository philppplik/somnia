import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {EditError} from './edit';
import {pruneSelection} from './selection';
import {softenEdits} from './keySoften';
/** Soften out jittery keys. Own file so the big command array keeps cheap type inference. */
export const keySoftenSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.keys.soften',title:'Soften the selected keys toward their neighbours',category:'Edit',level:'ui',keywords:['animation','keys','soften','soften','jitter','noise','average','clean','baked'],
 params:{type:'object',properties:{percent:{type:'integer',minimum:5,maximum:100}},additionalProperties:false},
 enabled:()=>{const s=animationSession(),d=s.document;return !!d&&pruneSelection(d,s.getState().view.selectedKeys).length>0;},
 run:((p:{percent?:number}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)throw Object.assign(new Error('No composition is open.'),{expected:true});
  const pc=p.percent??50;if(!Number.isInteger(pc)||pc<5||pc>100)throw Object.assign(new Error('Softening is 5 to 100 percent.'),{expected:true});
  const edits=softenEdits(c,pruneSelection(d!,s.getState().view.selectedKeys),pc/100);
  if(!edits.length)throw Object.assign(new Error('Nothing to soften: the first and last key of a track stay, and flat runs are already soften.'),{expected:true});
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {keys:edits.length,percent:pc};
 }) as (p:unknown)=>unknown}];
