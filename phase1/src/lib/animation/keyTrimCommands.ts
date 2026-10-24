import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {EditError} from './edit';
import {trimKeys} from './keyTrim';
/** Remove keys outside the work area. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const keyTrimSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.keys.trimToWorkArea',title:'Remove the keys outside the work area',category:'Edit',level:'ui',keywords:['animation','keys','trim','work area','outside','remove','clean','delete'],
 params:{type:'object',properties:{layers:{type:'array',items:{type:'string',minLength:1,maxLength:64},minItems:1,maxItems:64}},additionalProperties:false},
 enabled:()=>!!animationSession().document,
 run:((p:{layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const v=s.getState().view,ids=p.layers??(v.selectedLayer?[v.selectedLayer]:expected('Select a layer first.'));
  const gone=trimKeys(c,ids);if(!gone.length)return expected('No keys outside the work area.');
  try{s.dispatch({type:'keys.remove',keys:gone});}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  s.selectKeys([]);return {removed:gone.length};
 }) as (p:unknown)=>unknown}];
