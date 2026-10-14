import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {EditError} from './edit';
import {keyAllEdits} from './keyAll';
/** Key every animated property at the playhead. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const keyAllSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.keys.keyAll',title:'Add a key at the playhead on every animated property of the layers',category:'Edit',level:'ui',keywords:['animation','keys','key','all','playhead','pose','snapshot','freeze'],
 params:{type:'object',properties:{layers:{type:'array',items:{type:'string',minLength:1,maxLength:64},minItems:1,maxItems:64}},additionalProperties:false},
 enabled:()=>!!animationSession().document,
 run:((p:{layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const v=s.getState().view,ids=p.layers??(v.selectedLayer?[v.selectedLayer]:expected('Select a layer first.'));
  const {edits,refs}=keyAllEdits(c,ids,v.playhead);
  if(!edits.length)return expected('Nothing to key here: every animated property already has a key at the playhead, or the layers are locked.');
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  s.selectKeys(refs);return {keys:edits.length};
 }) as (p:unknown)=>unknown}];
