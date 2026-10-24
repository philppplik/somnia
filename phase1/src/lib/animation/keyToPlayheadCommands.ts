import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {EditError} from './edit';
import {pruneSelection,shiftSelection} from './selection';
import {toPlayheadDelta} from './keyToPlayhead';
/** Move the selected keys so the first lands on the playhead. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const keyToPlayheadSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.keys.toPlayhead',title:'Move the selected keys so the first one lands on the playhead',category:'Edit',level:'ui',keywords:['animation','keys','playhead','move','align','slide','start'],
 params:{type:'object',properties:{},additionalProperties:false},
 enabled:()=>{const s=animationSession(),d=s.document;return !!d&&pruneSelection(d,s.getState().view.selectedKeys).length>0;},
 run:(()=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const sel=pruneSelection(d!,s.getState().view.selectedKeys),delta=toPlayheadDelta(sel,s.getState().view.playhead,c.fps);
  if(!delta)return expected('The first key is already on the playhead.');
  try{s.dispatch({type:'keys.move',keys:sel,delta});}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  s.selectKeys(shiftSelection(sel,delta));return {delta};
 }) as (p:unknown)=>unknown}];
