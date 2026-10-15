import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,newId,type Composition,type Layer,type LayerEffect} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
/** Copy effects: the first ticked layer is the source; its whole effect stack (strengths, colors and keys) is cloned onto the other ticked layers, replacing theirs. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_COPY_TARGETS=30;
/** A deep copy of a stack with fresh effect ids, so two layers never share an id. */
export const cloneEffects=(src:readonly LayerEffect[],id:()=>string):LayerEffect[]=>src.map(e=>({...structuredClone(e),id:id()}));
export const effectCopySpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.copyEffects',title:'Copy the first ticked layer\u2019s effects to the other ticked layers',category:'Edit',level:'ui',keywords:['animation','effects','copy','match','glow','blur','shadow','tint','same look','paste'],
 params:{type:'object',properties:{layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:2,maxItems:MAX_COPY_TARGETS+1}},additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>1;},
 run:((p:{layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c:Composition|undefined=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const ids=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))];
  if(ids.length<2)return expected('Tick the source layer first, then the layers that should get its effects.');
  const src=findLayer(c,ids[0]);if(!src)return expected('The source layer no longer exists.');
  const targets=ids.slice(1,MAX_COPY_TARGETS+1).map(id=>findLayer(c,id)).filter((l):l is Layer=>!!l&&!l.locked&&l.kind!=='audio'&&l.kind!=='null'&&l.id!==src.id);
  if(!targets.length)return expected('No unlocked target layer can take effects.');
  const fx=src.effects??[];if(!fx.length&&!targets.some(t=>t.effects?.length))return expected('The source layer has no effects.');
  const edits:Edit[]=targets.map(t=>({type:'layer.effects',layer:t.id,effects:cloneEffects(fx,()=>newId('effect'))}));
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {copiedTo:targets.length,effects:fx.length};
 }) as (p:unknown)=>unknown}];
