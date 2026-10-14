import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {EditError} from './edit';
import {pruneSelection} from './selection';
import {flattenEdits} from './keyFlatten';
/** Hold one pose across the selected keys. Own file so the big command array keeps cheap type inference. */
export const keyFlattenSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.keys.flatten',title:'Give the selected keys the value of the earliest selected key',category:'Edit',level:'ui',keywords:['animation','keys','flatten','same','value','hold','pose','equal'],
 params:{type:'object',properties:{},additionalProperties:false},
 enabled:()=>{const s=animationSession(),d=s.document;return !!d&&pruneSelection(d,s.getState().view.selectedKeys).length>1;},
 run:(()=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)throw Object.assign(new Error('No composition is open.'),{expected:true});
  const edits=flattenEdits(c,pruneSelection(d!,s.getState().view.selectedKeys));
  if(!edits.length)throw Object.assign(new Error('The keys already share one value.'),{expected:true});
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {keys:edits.length};
 }) as (p:unknown)=>unknown}];
