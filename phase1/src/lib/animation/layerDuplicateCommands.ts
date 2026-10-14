import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findLayer,findComp,newId} from './model';
import {EditError} from './edit';
import {clearLayerSet,layerSetIds,toggleLayerInSet} from './layerSet';
import {MAX_DUPLICATE_LAYERS} from './layerDuplicate';
/** Duplicate the selected layers. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const layerDuplicateSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.duplicate',title:'Duplicate the selected layers',category:'Edit',level:'ui',keywords:['animation','layer','duplicate','copy','clone','layers'],
 params:{type:'object',properties:{layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_DUPLICATE_LAYERS}},additionalProperties:false},
 enabled:()=>{const s=animationSession(),d=s.document,c=d?findComp(d):undefined;return !!c&&layerSetIds(s.getState().view.selectedLayer).some(id=>!!findLayer(c,id));},
 run:((p:{layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const ids=(p.layers??layerSetIds(s.getState().view.selectedLayer)).filter(id=>!!findLayer(c,id));
  if(!ids.length)return expected('Select a layer first.');
  const order=c.layers.map(l=>l.id).filter(id=>ids.includes(id)),made=order.map(()=>newId('layer'));
  try{s.dispatch({type:'layers.duplicate',layers:order,ids:made});}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  const primary=s.getState().view.selectedLayer,pi=primary?order.indexOf(primary):-1,main=made[pi>=0?pi:0];
  clearLayerSet();made.forEach(id=>{if(id!==main)toggleLayerInSet(id);});
  s.setView({selectedLayer:main,selectedKey:null});return {layers:made.length};
 }) as (p:unknown)=>unknown}];
