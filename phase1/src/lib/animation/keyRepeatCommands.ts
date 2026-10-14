import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {EditError} from './edit';
import {pruneSelection} from './selection';
import {repeatEdits,repeatedRefs,REPEAT_MODES,MAX_REPEATS,type RepeatMode} from './keyRepeat';
/** Repeat the selected keys as cycles or ping-pong. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const keyRepeatSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.keys.repeat',title:'Repeat the selected keys as cycles or ping-pong',category:'Edit',level:'ui',keywords:['animation','keys','repeat','loop','cycle','ping-pong','boomerang'],
 params:{type:'object',properties:{count:{type:'integer',minimum:1,maximum:MAX_REPEATS},mode:{enum:[...REPEAT_MODES]}},required:['count'],additionalProperties:false},
 enabled:()=>{const s=animationSession(),d=s.document;return !!d&&pruneSelection(d,s.getState().view.selectedKeys).length>1;},
 run:((p:{count:number;mode?:RepeatMode})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const keys=pruneSelection(d!,s.getState().view.selectedKeys);
  const edits=repeatEdits(c,keys,p.count,p.mode??'cycle');
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  s.selectKeys([...keys,...repeatedRefs(c,edits)]);
  return {added:edits.length};
 }) as (p:unknown)=>unknown}];
