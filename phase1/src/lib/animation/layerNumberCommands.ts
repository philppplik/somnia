import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
import {MAX_DUPLICATE_LAYERS} from './layerDuplicate';
/** Rename the selected layers "Name 1", "Name 2" ... top to bottom. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
/** Strip a trailing " copy" or " 12" so renumbering a duplicated set does not stack suffixes. */
export const numberBase=(name:string):string=>{const b=name.replace(/(\s+(copy|\d+))+$/i,'').trim();return b||name.trim()||'Layer';};
export const layerNumberSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.number',title:'Number the selected layers',category:'Edit',level:'ui',keywords:['animation','layer','rename','number','numbering','copies','duplicate','sequence'],
 params:{type:'object',properties:{layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_DUPLICATE_LAYERS},name:{type:'string',minLength:1,maxLength:80},start:{type:'integer',minimum:0,maximum:9999}},additionalProperties:false},
 enabled:()=>{const s=animationSession(),d=s.document,c=d?findComp(d):undefined;return !!c&&layerSetIds(s.getState().view.selectedLayer).some(id=>!!findLayer(c,id));},
 run:((p:{layers?:string[];name?:string;start?:number}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const want=new Set(p.layers??layerSetIds(s.getState().view.selectedLayer));
  const ls=c.layers.filter(l=>want.has(l.id));
  if(!ls.length)return expected('Select a layer first.');
  const base=(p.name??numberBase(ls[0].name)).trim();if(!base)return expected('Enter a name.');
  let n=p.start??1,skippedLocked=0;const edits:Edit[]=[];
  for(const l of ls){if(l.locked){skippedLocked++;continue;}const name=`${base} ${n++}`.slice(0,80);if(name!==l.name)edits.push({type:'layer.update',layer:l.id,name});}
  if(!edits.length)return expected(skippedLocked?'The selected layers are locked.':'The layers already have those names.');
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {renamed:edits.length,skippedLocked};
 }) as (p:unknown)=>unknown}];
