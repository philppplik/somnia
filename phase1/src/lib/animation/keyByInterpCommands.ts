import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {keysByInterp} from './keyByInterp';
/** Select keys by interpolation. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const keyByInterpSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.keys.selectByInterp',title:'Select the keys with one interpolation',category:'View',level:'ui',keywords:['animation','keys','select','interpolation','hold','linear','bezier','smooth','ease','type'],
 params:{type:'object',properties:{interp:{type:'string',enum:['hold','linear','bezier']},layers:{type:'array',items:{type:'string',minLength:1,maxLength:64},minItems:1,maxItems:64}},required:['interp'],additionalProperties:false},
 enabled:()=>!!animationSession().document,
 run:((p:{interp:'hold'|'linear'|'bezier';layers?:string[]})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  if(p.interp!=='hold'&&p.interp!=='linear'&&p.interp!=='bezier')return expected('Interpolation must be hold, linear or bezier.');
  const v=s.getState().view,ids=p.layers??(v.selectedLayer?[v.selectedLayer]:expected('Select a layer first.'));
  const refs=keysByInterp(c,ids,p.interp);if(!refs.length)return expected('No keys with that interpolation.');
  s.selectKeys(refs);return {keys:refs.length};
 }) as (p:unknown)=>unknown}];
