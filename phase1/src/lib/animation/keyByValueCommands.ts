import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {keysByValue,MAX_VALUE_ABS} from './keyByValue';
/** Select keys by value range. Command palette only. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const keyByValueSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.keys.selectByValue',title:'Select the keys with a value in a range',category:'View',level:'ui',keywords:['animation','keys','select','value','range','between','opacity','rotation','min','max'],
 params:{type:'object',properties:{min:{type:'number',minimum:-MAX_VALUE_ABS,maximum:MAX_VALUE_ABS},max:{type:'number',minimum:-MAX_VALUE_ABS,maximum:MAX_VALUE_ABS},layers:{type:'array',items:{type:'string',minLength:1,maxLength:64},minItems:1,maxItems:64}},required:['min','max'],additionalProperties:false},
 enabled:()=>!!animationSession().document,
 run:((p:{min:number;max:number;layers?:string[]})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const v=s.getState().view,ids=p.layers??(v.selectedLayer?[v.selectedLayer]:expected('Select a layer first.'));
  const refs=keysByValue(c,ids,p.min,p.max);if(!refs.length)return expected('No keys with a value in that range.');
  s.selectKeys(refs);return {keys:refs.length};
 }) as (p:unknown)=>unknown}];
