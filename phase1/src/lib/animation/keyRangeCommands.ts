import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {keysAround,KEY_RANGE_SIDES,type KeyRangeSide} from './keyRange';
/** Select the keys before or after the playhead. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const keyRangeSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.keys.selectRange',title:'Select the keys before or after the playhead',category:'View',level:'ui',keywords:['animation','keys','select','playhead','before','after','range'],
 params:{type:'object',properties:{side:{enum:[...KEY_RANGE_SIDES]},layers:{type:'array',items:{type:'string',minLength:1,maxLength:64},minItems:1,maxItems:64}},required:['side'],additionalProperties:false},
 enabled:()=>!!animationSession().document,
 run:((p:{side:KeyRangeSide;layers?:string[]})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const v=s.getState().view,ids=p.layers??(v.selectedLayer?[v.selectedLayer]:expected('Select a layer first.'));
  const refs=keysAround(c,ids,v.playhead,p.side);if(!refs.length)return expected(p.side==='after'?'No keys at or after the playhead.':'No keys at or before the playhead.');
  s.selectKeys(refs);return {keys:refs.length};
 }) as (p:unknown)=>unknown}];
