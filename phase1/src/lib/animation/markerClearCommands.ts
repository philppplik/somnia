import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {EditError} from './edit';
/** Remove all timing markers, or only those inside the work area. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const markerClearSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.marker.clear',title:'Clear timing markers',category:'Edit',level:'ui',keywords:['animation','marker','clear','remove','delete','all','cue','work area'],
 params:{type:'object',properties:{scope:{type:'string',enum:['all','workArea']}},additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&(c.markers??[]).length>0;},
 run:((p:{scope?:'all'|'workArea'}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const scope=p.scope??'all';if(scope!=='all'&&scope!=='workArea')return expected('Unknown scope.');
  const ms=c.markers??[],inside=(t:number)=>t>=c.workArea.in&&t<=c.workArea.out;
  const keep=scope==='all'?[]:ms.filter(m=>!inside(m.t));
  if(keep.length===ms.length)return expected(ms.length?'No markers inside the work area.':'There are no markers.');
  try{s.dispatch({type:'markers.set',markers:keep});}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {removed:ms.length-keep.length,left:keep.length};
 }) as (p:unknown)=>unknown}];
