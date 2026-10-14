import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {EditError} from './edit';
import {pruneSelection} from './selection';
import {reverseEdits,reversedRefs,layerKeyRefs} from './keyReverse';
/** Play keys backwards: the selected keys, or every key of the picked layers. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const keyReverseSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.keys.reverse',title:'Reverse keys in time',category:'Edit',level:'ui',keywords:['animation','keys','reverse','backwards','mirror','flip','time'],
 params:{type:'object',properties:{layers:{type:'array',items:{type:'string',minLength:1,maxLength:64},minItems:1,maxItems:64}},additionalProperties:false},
 enabled:()=>{const s=animationSession(),d=s.document;return !!d&&pruneSelection(d,s.getState().view.selectedKeys).length>1;},
 run:((p:{layers?:string[]})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const refs=p.layers?layerKeyRefs(c,p.layers):pruneSelection(d!,s.getState().view.selectedKeys);
  const edits=reverseEdits(c,refs,!!p.layers);
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  s.selectKeys(reversedRefs(edits));
  return {layers:edits.filter(e=>e.type==='keys.paste').length};
 }) as (p:unknown)=>unknown}];
