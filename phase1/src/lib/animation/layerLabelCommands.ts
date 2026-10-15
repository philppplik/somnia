import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,LAYER_LABELS,type LayerLabel} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
import {MAX_DUPLICATE_LAYERS} from './layerDuplicate';
/** Colour labels for organising layers: set or clear a label on the selected layers, or select every layer with a label. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const LABEL_CHOICES=[...LAYER_LABELS,'none'] as const;
export const layerLabelSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.label',title:'Set a colour label on the selected layers',category:'Edit',level:'ui',keywords:['animation','layer','label','colour','color','tag','organise','organize','group'],
 params:{type:'object',properties:{label:{type:'string',enum:[...LABEL_CHOICES]},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_DUPLICATE_LAYERS}},required:['label'],additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>0;},
 run:((p:{label:LayerLabel|'none';layers?:string[]})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  if(!(LABEL_CHOICES as readonly unknown[]).includes(p?.label))return expected('Unknown label.');
  const label=p.label==='none'?null:p.label;
  const ls=(p.layers??layerSetIds(s.getState().view.selectedLayer)).map(id=>findLayer(c,id)).filter(l=>!!l);
  if(!ls.length)return expected('Select a layer first.');
  const todo=ls.filter(l=>(l!.label??null)!==label);if(!todo.length)return expected('The layers already have that label.');
  try{s.dispatch([{type:'layer.label',layers:todo.map(l=>l!.id),label} as Edit]);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {changed:todo.length,label:p.label};
 }) as (p:unknown)=>unknown}];
