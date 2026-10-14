import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {EditError} from './edit';
import {pruneSelection} from './selection';
import {invertEdits} from './keyInvert';
/** Invert the values of the selected keys. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const keyInvertSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.keys.invert',title:'Invert the values of the selected keys',category:'Edit',level:'ui',keywords:['animation','keys','invert','flip','mirror','values'],
 params:{type:'object',properties:{},additionalProperties:false},
 enabled:()=>{const s=animationSession(),d=s.document;return !!d&&pruneSelection(d,s.getState().view.selectedKeys).length>1;},
 run:((_p:unknown)=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const edits=invertEdits(c,pruneSelection(d!,s.getState().view.selectedKeys));
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {keys:edits.length};
 }) as (p:unknown)=>unknown}];
