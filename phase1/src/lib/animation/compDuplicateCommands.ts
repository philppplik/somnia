import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,newId} from './model';
import {EditError} from './edit';
/** Duplicate a composition (default: the active one). Own file so the big command array keeps cheap type inference. */
export const compDuplicateSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.comp.duplicate',title:'Duplicate composition',category:'Edit',level:'ui',keywords:['animation','composition','duplicate','copy','clone'],
 params:{type:'object',properties:{comp:{type:'string',minLength:1,maxLength:64}},additionalProperties:false},
 enabled:()=>{const d=animationSession().document;return !!d&&!!findComp(d);},
 run:((p:{comp?:string}={})=>{
  const s=animationSession(),d=s.document;if(!d)throw Object.assign(new Error('No document is open.'),{expected:true});
  const src=findComp(d,p.comp??d.activeComp);if(!src)throw Object.assign(new Error('Composition does not exist.'),{expected:true});
  const id=newId('comp');
  try{s.dispatch({type:'comp.duplicate',comp:src.id,id});}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  s.setView({selectedLayer:null,selectedKey:null});return {comp:id};
 }) as (p:unknown)=>unknown}];
