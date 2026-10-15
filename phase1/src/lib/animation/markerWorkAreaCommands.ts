import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {EditError} from './edit';
/** Set the work area to the stretch between the markers around the playhead, so preview and export cover one section. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const markerWorkAreaSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.workarea.toMarkers',title:'Set the work area to the section between markers at the playhead',category:'Edit',level:'ui',keywords:['animation','work area','marker','section','segment','range','export','loop','chapter'],
 params:{type:'object',properties:{layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},maxItems:200}},additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c?.markers?.length;},
 run:(()=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const ms=(c.markers??[]).map(m=>m.t).filter(t=>t>=0&&t<=c.duration);if(!ms.length)return expected('Add markers first.');
  const at=s.getState().view.playhead,before=ms.filter(t=>t<=at),after=ms.filter(t=>t>at);
  const a=before.length?Math.max(...before):0,b=after.length?Math.min(...after):c.duration;
  if(b<=a)return expected('There is no section after the last marker.');
  if(a===c.workArea.in&&b===c.workArea.out)return expected('The work area already covers this section.');
  try{s.dispatch({type:'workarea.set',in:a,out:b});}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {in:a,out:b};
 }) as (p:unknown)=>unknown}];
