import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {EditError} from './edit';
import {pruneSelection} from './selection';
import {rampEdits} from './keyRamp';
/** Straighten the values of the selected keys. Own file so the big command array keeps cheap type inference. */
export const keyRampSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.keys.ramp',title:'Put the selected keys on a straight line between the first and last selected key',category:'Edit',level:'ui',keywords:['animation','keys','ramp','linear','straight','line','interpolate','even'],
 params:{type:'object',properties:{},additionalProperties:false},
 enabled:()=>{const s=animationSession(),d=s.document;return !!d&&pruneSelection(d,s.getState().view.selectedKeys).length>2;},
 run:(()=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)throw Object.assign(new Error('No composition is open.'),{expected:true});
  const edits=rampEdits(c,pruneSelection(d!,s.getState().view.selectedKeys));
  if(!edits.length)throw Object.assign(new Error('The keys already lie on a straight line.'),{expected:true});
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {keys:edits.length};
 }) as (p:unknown)=>unknown}];
