import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {EditError} from './edit';
import {pruneSelection} from './selection';
import {tameEdits} from './keyTame';
/** Remove ease overshoot. Own file so the big command array keeps cheap type inference. */
export const keyTameSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.keys.tame',title:'Remove overshoot and anticipation from the ease of the selected keys',category:'Edit',level:'ui',keywords:['animation','keys','ease','tame','overshoot','anticipation','clamp','bounce','back'],
 params:{type:'object',properties:{},additionalProperties:false},
 enabled:()=>{const s=animationSession(),d=s.document;return !!d&&pruneSelection(d,s.getState().view.selectedKeys).length>0;},
 run:(()=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)throw Object.assign(new Error('No composition is open.'),{expected:true});
  const edits=tameEdits(c,pruneSelection(d!,s.getState().view.selectedKeys));
  if(!edits.length)throw Object.assign(new Error('No selected key overshoots.'),{expected:true});
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {keys:edits.length};
 }) as (p:unknown)=>unknown}];
