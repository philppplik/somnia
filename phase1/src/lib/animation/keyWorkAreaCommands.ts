import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp} from './model';
import {EditError} from './edit';
import {pruneSelection} from './selection';
import {workAreaForKeys} from './keyWorkArea';
/** Set the work area from the selected keys. Own file so the big command array keeps cheap type inference. */
export const keyWorkAreaSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.keys.workAreaToKeys',title:'Set the work area to the selected keys',category:'Edit',level:'ui',keywords:['animation','keys','work area','range','span','in','out','bounds'],
 params:{type:'object',properties:{},additionalProperties:false},
 enabled:()=>{const s=animationSession(),d=s.document;return !!d&&pruneSelection(d,s.getState().view.selectedKeys).length>0;},
 run:(()=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)throw Object.assign(new Error('No composition is open.'),{expected:true});
  const w=workAreaForKeys(c,pruneSelection(d!,s.getState().view.selectedKeys));
  if(!w)throw Object.assign(new Error('Select keys first.'),{expected:true});
  if(w.in===c.workArea.in&&w.out===c.workArea.out)throw Object.assign(new Error('The work area already spans the selected keys.'),{expected:true});
  try{s.dispatch({type:'workarea.set',in:w.in,out:w.out});}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return w;
 }) as (p:unknown)=>unknown}];
