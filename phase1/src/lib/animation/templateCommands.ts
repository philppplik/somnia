import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {layerTemplates,exportTemplatesJson,parseTemplatesJson,mergeTemplatesEdit} from './layerTemplates';
import {downloadBlob} from './exportFrames';
import {newId} from './model';
/** Rename a saved layer template. Own file so the big command array keeps cheap type inference. */
const expected=(e:unknown):never=>{throw Object.assign(e instanceof Error?e:new Error(String(e)),{expected:true});};
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
 }) as (p:unknown)=>unknown},{
 id:'animation.template.export',title:'Export saved templates as a JSON file',category:'Insert',level:'ui',keywords:['animation','template','export'],
 params:{type:'object',properties:{id:{type:'string',minLength:1,maxLength:64}},required:[],additionalProperties:false},
 enabled:()=>layerTemplates(animationSession().document).length>0,
 run:((p:{id?:string}={})=>{
  const all=layerTemplates(animationSession().document),pick=p.id?all.filter(x=>x.id===p.id):all;
  if(!pick.length)expected(new Error(p.id?'That template no longer exists.':'No saved templates to export.'));
  downloadBlob(new Blob([exportTemplatesJson(pick)],{type:'application/json'}),pick.length===1?'somnia-template.json':'somnia-templates.json');return pick.length;
 }) as (p:unknown)=>unknown},{
 id:'animation.template.import',title:'Import templates from a JSON file',category:'Insert',level:'ui',keywords:['animation','template','import'],
 params:{type:'object',properties:{json:{type:'string',minLength:2,maxLength:300000}},required:['json'],additionalProperties:false},
 enabled:()=>!!animationSession().document,
 run:((p:{json:string})=>{
  const s=animationSession();try{const inc=parseTemplatesJson(p.json);s.dispatch(mergeTemplatesEdit(s.document!,inc,()=>newId('tpl')));return inc.length;}catch(e){return expected(e);}
 }) as (p:unknown)=>unknown}];
