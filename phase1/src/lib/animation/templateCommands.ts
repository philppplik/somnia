import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {layerTemplates} from './layerTemplates';
/** Rename a saved layer template. Own file so the big command array keeps cheap type inference. */
export const templateRenameSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.template.rename',title:'Rename a saved template',category:'Insert',level:'ui',keywords:['animation','template','rename'],
 params:{type:'object',properties:{id:{type:'string',minLength:1,maxLength:64},name:{type:'string',minLength:1,maxLength:40}},required:['id','name'],additionalProperties:false},
 enabled:()=>layerTemplates(animationSession().document).length>0,
 run:((p:{id:string;name:string})=>{
  const items=layerTemplates(animationSession().document),name=p.name.trim().slice(0,40);
  if(!items.some(x=>x.id===p.id))throw Object.assign(Error('That template no longer exists.'),{expected:true});
  if(!name)throw Object.assign(Error('Give the template a name.'),{expected:true});
  if(items.some(x=>x.id!==p.id&&x.name===name))throw Object.assign(Error('Another template already has that name.'),{expected:true});
  animationSession().dispatch({type:'layerTemplates.set',items:items.map(x=>x.id===p.id?{...x,name}:x)});
 }) as (p:unknown)=>unknown}];
