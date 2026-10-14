import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {endKeys} from './keyEnds';
/** Select the first and last key of each property. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const keyEndsSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.keys.selectEnds',title:'Select the first and last key of each property',category:'View',level:'ui',keywords:['animation','keys','select','first','last','ends','start','end','bookends'],
 params:{type:'object',properties:{layers:{type:'array',items:{type:'string',minLength:1,maxLength:64},minItems:1,maxItems:64}},additionalProperties:false},
 enabled:()=>!!animationSession().document,
 run:((p:{layers?:string[]})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const v=s.getState().view,ids=p.layers??(v.selectedLayer?[v.selectedLayer]:expected('Select a layer first.'));
  const refs=endKeys(c,ids);if(!refs.length)return expected('No keys on the selected layers.');
  s.selectKeys(refs);return {keys:refs.length};
 }) as (p:unknown)=>unknown}];
