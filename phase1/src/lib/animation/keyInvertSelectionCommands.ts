import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {pruneSelection} from './selection';
import {invertSelection} from './keyInvertSelection';
/** Invert the key selection. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const keyInvertSelectionSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.keys.invertSelection',title:'Invert the key selection',category:'View',level:'ui',keywords:['animation','keys','select','invert','inverse','opposite','others'],
 params:{type:'object',properties:{layers:{type:'array',items:{type:'string',minLength:1,maxLength:64},minItems:1,maxItems:64}},additionalProperties:false},
 enabled:()=>!!animationSession().document,
 run:((p:{layers?:string[]})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const v=s.getState().view,ids=p.layers??(v.selectedLayer?[v.selectedLayer]:expected('Select a layer first.'));
  const refs=invertSelection(c,ids,pruneSelection(d!,v.selectedKeys));if(!refs.length)return expected('Every key is already selected.');
  s.selectKeys(refs);return {keys:refs.length};
 }) as (p:unknown)=>unknown}];
