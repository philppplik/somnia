import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {keysAroundPlayhead} from './keyPlayheadSelect';
/** Select keys before, after or at the playhead. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const keyPlayheadSelectSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.keys.selectAroundPlayhead',title:'Select the keys before, after or at the playhead',category:'View',level:'ui',keywords:['animation','keys','select','playhead','before','after','earlier','later','at','exact','cursor'],
 params:{type:'object',properties:{side:{type:'string',enum:['before','after','at']},layers:{type:'array',items:{type:'string',minLength:1,maxLength:64},minItems:1,maxItems:64}},required:['side'],additionalProperties:false},
 enabled:()=>!!animationSession().document,
 run:((p:{side:'before'|'after'|'at';layers?:string[]})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  if(p.side!=='before'&&p.side!=='after'&&p.side!=='at')return expected('Side must be before, after or at.');
  const v=s.getState().view,ids=p.layers??(v.selectedLayer?[v.selectedLayer]:expected('Select a layer first.'));
  const refs=keysAroundPlayhead(c,ids,v.playhead,p.side);if(!refs.length)return expected('No keys on that side of the playhead.');
  s.selectKeys(refs);return {keys:refs.length};
 }) as (p:unknown)=>unknown}];
