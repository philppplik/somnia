import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {EditError} from './edit';
import {snapToFrame} from './time';
/** Rename a timing marker and/or move it. Without an id it takes the marker at the playhead. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const markerUpdateSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.marker.update',title:'Rename or move a timing marker',category:'Edit',level:'ui',keywords:['animation','marker','rename','label','move','cue','timing'],
 params:{type:'object',properties:{id:{type:'string',minLength:1,maxLength:200},label:{type:'string',minLength:1,maxLength:100},t:{type:'integer'}},additionalProperties:false},
 enabled:()=>{const s=animationSession(),d=s.document,c=d?findComp(d):undefined;return !!c&&(c.markers??[]).length>0;},
 run:((p:{id?:string;label?:string;t?:number}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const ms=c.markers??[];const at=s.getState().view.playhead;
  const m=p.id?ms.find(x=>x.id===p.id):ms.find(x=>x.t===at||x.t===snapToFrame(at,c.fps));
  if(!m)return expected(p.id?'That marker does not exist.':'There is no marker at the playhead.');
  const label=p.label===undefined?m.label:p.label.trim(),t=p.t===undefined?m.t:snapToFrame(p.t,c.fps);
  if(!label)return expected('Enter a marker name.');
  if(t<c.start||t>=c.start+c.duration)return expected('The marker must stay inside the composition.');
  if(label===m.label&&t===m.t)return expected('The marker is unchanged.');
  try{s.dispatch({type:'markers.set',markers:ms.map(x=>x.id===m.id?{...x,label,t}:x)});}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {id:m.id,label,t};
 }) as (p:unknown)=>unknown}];
