import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {EditError} from './edit';
import {pruneSelection} from './selection';
import {easeCopyEdits} from './keyEaseCopy';
/** Copy the earliest selected key's ease onto the others. Own file so the big command array keeps cheap type inference. */
export const keyEaseCopySpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.keys.easeCopy',title:'Give the selected keys the ease of the earliest selected key',category:'Edit',level:'ui',keywords:['animation','keys','ease','copy','match','same','easing','interpolation'],
 params:{type:'object',properties:{},additionalProperties:false},
 enabled:()=>{const s=animationSession(),d=s.document;return !!d&&pruneSelection(d,s.getState().view.selectedKeys).length>1;},
 run:(()=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)throw Object.assign(new Error('No composition is open.'),{expected:true});
  const edits=easeCopyEdits(c,pruneSelection(d!,s.getState().view.selectedKeys));
  if(!edits.length)throw Object.assign(new Error('The keys already share one ease.'),{expected:true});
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {properties:edits.length};
 }) as (p:unknown)=>unknown}];
