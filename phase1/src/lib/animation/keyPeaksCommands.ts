import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {peakKeys} from './keyPeaks';
/** Select local peaks and dips. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const keyPeaksSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.keys.selectPeaks',title:'Select the keys that are peaks or dips',category:'View',level:'ui',keywords:['animation','keys','select','peaks','dips','extremes','maxima','minima'],
 params:{type:'object',properties:{layers:{type:'array',items:{type:'string',minLength:1,maxLength:64},minItems:1,maxItems:64}},additionalProperties:false},
 enabled:()=>!!animationSession().document,
 run:((p:{layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const v=s.getState().view,ids=p.layers??(v.selectedLayer?[v.selectedLayer]:expected('Select a layer first.'));
  const refs=peakKeys(c,ids);if(!refs.length)return expected('No peaks or dips found.');
  s.selectKeys(refs);return {keys:refs.length};
 }) as (p:unknown)=>unknown}];
