import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,findLayer,newId,type Layer} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
import {cloneEffects} from './effectCopyCommands';
/** Copy look (format painter): fill colour or gradient, stroke and effects of the first ticked layer go onto the other ticked layers. Shape, size, position and timing stay. Colour keys are not copied; a layer with fill colour keys keeps its fill. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const LOOK_PARTS=['fill','stroke','effects'] as const;
export type LookPart=typeof LOOK_PARTS[number];
export const MAX_LOOK_TARGETS=40;
const paintable=(l:Layer)=>l.kind==='solid'||l.kind==='shape'||l.kind==='text';
export const lookSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.layers.look',title:'Copy the look (fill, stroke, effects) of the first ticked layer to the other ticked layers',category:'Edit',level:'ui',keywords:['animation','look','style','format painter','copy','paste','fill','stroke','effects','appearance','same'],
 params:{type:'object',properties:{parts:{type:'array',items:{type:'string',enum:[...LOOK_PARTS]},minItems:1,maxItems:3},layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:2,maxItems:MAX_LOOK_TARGETS+1}},additionalProperties:false},
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.length>1;},
 run:((p:{parts?:string[];layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c)return expected('No composition is open.');
  const parts=new Set((p.parts??[...LOOK_PARTS]) as string[]);if(![...parts].every(x=>(LOOK_PARTS as readonly string[]).includes(x)))return expected('Copy fill, stroke or effects.');
  const ids=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))];
  if(ids.length<2)return expected('Tick the source layer first, then the layers that should get its look.');
  const src=findLayer(c,ids[0]);if(!src)return expected('The source layer no longer exists.');
  const targets=ids.slice(1,MAX_LOOK_TARGETS+1).map(id=>findLayer(c,id)).filter((l):l is Layer=>!!l&&!l.locked&&l.id!==src.id&&l.kind!=='audio'&&l.kind!=='null');
  if(!targets.length)return expected('No unlocked target layer can take a look.');
  const edits:Edit[]=[];let changed=0,skipped=0;
  for(const l of targets){
   const before=edits.length;
   if(parts.has('fill')&&paintable(src)&&paintable(l)&&!l.colorKeys?.fill?.length){
    const src2:Record<string,unknown>={};
    if(src.source.color!==undefined&&src.source.color!==l.source.color)src2.color=src.source.color;
    if(src.kind!=='text'&&l.kind!=='text'&&JSON.stringify(src.source.gradient)!==JSON.stringify(l.source.gradient))src2.gradient=src.source.gradient?structuredClone(src.source.gradient):undefined;
    if(Object.keys(src2).length)edits.push({type:'layer.update',layer:l.id,source:src2} as Edit);
   }
   if(parts.has('stroke')&&src.kind==='shape'&&l.kind==='shape'&&JSON.stringify(src.stroke)!==JSON.stringify(l.stroke)&&!l.colorKeys?.stroke?.length)
    edits.push({type:'layer.stroke',layer:l.id,stroke:src.stroke?structuredClone(src.stroke):null} as Edit);
   if(parts.has('effects')&&JSON.stringify((src.effects??[]).map(({id:_i,...e})=>e))!==JSON.stringify((l.effects??[]).map(({id:_i,...e})=>e)))
    edits.push({type:'layer.effects',layer:l.id,effects:cloneEffects(src.effects??[],()=>newId('effect'))} as Edit);
   if(edits.length>before)changed++;else skipped++;
  }
  if(!edits.length)return expected('The other layers already look like the first one (or cannot take that look).');
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {layers:changed,skipped};
 }) as (p:unknown)=>unknown}];
