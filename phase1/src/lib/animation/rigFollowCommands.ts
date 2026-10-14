import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,frameToTick,type TransformKey} from './model';
import {EditError} from './edit';
import {LINK_PROPS} from './modifiers';
import {MAX_RIG_LAYERS} from './rig';
/** Follow the leader: each layer after the first links one property to the layer before it, read N frames late. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_FOLLOW_FRAMES=60;
export const rigFollowSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.rig.follow',title:'Follow the leader (linked lag)',category:'Edit',level:'ui',keywords:['animation','rig','follow','leader','lag','delay','link','drag','overlap'],
 params:{type:'object',properties:{layers:{type:'array',items:{type:'string',minLength:1,maxLength:64},minItems:2,maxItems:MAX_RIG_LAYERS},frames:{type:'integer',minimum:0,maximum:MAX_FOLLOW_FRAMES},prop:{enum:[...LINK_PROPS]}},required:['layers'],additionalProperties:false},
 enabled:()=>!!animationSession().document,
 run:((p:{layers:string[];frames?:number;prop?:TransformKey}={layers:[]})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const ids=p.layers??[];if(ids.length<2)return expected('Pick two or more layers; the first one leads.');
  if(new Set(ids).size!==ids.length)return expected('Pick each layer once.');
  const prop=p.prop??'position',frames=p.frames??3;
  for(const id of ids){const l=findLayer(c,id);if(!l)return expected('A picked layer no longer exists.');if(l.locked)return expected(`"${l.name}" is locked.`);if(id!==ids[0]&&l.transform[prop].modifiers?.some(m=>m.type==='link'))return expected(`"${l.name}" already has a link on that property.`);}
  const delay=frameToTick(frames,c.fps);
  try{s.dispatch(ids.slice(1).map((id,i)=>({type:'modifier.add' as const,layer:id,prop,modifier:{type:'link' as const,layer:ids[i],prop,multiplier:1,offset:0,...(delay?{delay}:{})}})));}
  catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {followers:ids.length-1,frames};
 }) as (p:unknown)=>unknown}];
