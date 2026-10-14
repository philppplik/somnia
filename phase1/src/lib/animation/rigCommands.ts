import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,newId} from './model';
import {EditError} from './edit';
import {chainEdits,groupEdits,releaseEdits,RigError,MAX_RIG_LAYERS} from './rig';
/** Rig helpers as commands. Own file so the big command array keeps cheap type inference. */
const layers={type:'array',items:{type:'string',minLength:1,maxLength:64},minItems:1,maxItems:MAX_RIG_LAYERS};
const params={type:'object',properties:{layers},required:['layers'],additionalProperties:false};
const doc=()=>animationSession().document;
const comp=()=>{const d=doc();const c=d?findComp(d):undefined;if(!c)throw Object.assign(new Error('No composition is open.'),{expected:true});return c;};
const go=(build:(ids:string[],t:number)=>import('./edit').Edit[])=>((p:{layers:string[]})=>{
 try{const s=animationSession();return s.dispatch(build(p.layers,s.getState().view.playhead)).revision;}
 catch(e){if(e instanceof RigError||e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
}) as (p:unknown)=>unknown;
const spec=(id:string,title:string,kw:string,run:(p:unknown)=>unknown):CommandSpec<unknown,unknown>=>({id,title,category:'Edit',level:'ui',keywords:['animation','rig','parent',kw],params,enabled:()=>!!doc(),run});
export const rigSpecs=():CommandSpec<unknown,unknown>[]=>[
 spec('animation.rig.chain','Parent layers as a chain','chain',go((ids,t)=>chainEdits(comp(),ids,t))),
 spec('animation.rig.group','Group layers under a new null','group',go((ids,t)=>groupEdits(comp(),ids,newId('layer'),t))),
 spec('animation.rig.release','Release layers from their parents','release',go((ids,t)=>releaseEdits(comp(),ids,t)))];
