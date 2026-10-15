import type {CommandSpec} from '../commandSpec';
import {animationSession} from './session';
import {findComp,newId,type Layer} from './model';
import {EditError,type Edit} from './edit';
import {layerSetIds} from './layerSet';
import {unpackBlocker,unpackLayers} from './precompUnpack';
/** Unpack precomposition layers back into the composition. Own file so the big command array keeps cheap type inference. */
const expected=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
export const MAX_UNPACK_PRECOMPS=10;
export const precompUnpackSpecs=():CommandSpec<unknown,unknown>[]=>[{
 id:'animation.precomp.unpack',title:'Unpack precomposition layers into this composition',category:'Edit',level:'ui',keywords:['animation','precomp','precomposition','unpack','ungroup','explode','expand','nested','inline','dissolve'],
 params:{type:'object',properties:{layers:{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:1,maxItems:MAX_UNPACK_PRECOMPS}},additionalProperties:false},
 // The Rig menu passes its own ticked layers, so this must not depend on the timeline selection.
 enabled:()=>{const d=animationSession().document,c=d?findComp(d):undefined;return !!c&&c.layers.some(l=>l.kind==='comp');},
 run:((p:{layers?:string[]}={})=>{
  const s=animationSession(),d=s.document,c=d?findComp(d):undefined;if(!c||!d)return expected('No composition is open.');
  const want=[...new Set(p.layers??layerSetIds(s.getState().view.selectedLayer))].slice(0,MAX_UNPACK_PRECOMPS);
  const picked=c.layers.filter(l=>want.includes(l.id)&&l.kind==='comp');
  if(!picked.length)return expected('Select a precomposition layer first.');
  const edits:Edit[]=[];let order=c.layers.map(l=>l.id),total=0,skipped=0,firstWhy='',dropped=0;const used=new Set(order);
  for(const pl of picked){
   const child=d.compositions.find(x=>x.id===pl.source.compId),why=unpackBlocker(c,pl,child);
   if(why){skipped++;firstWhy=firstWhy||why;continue;}
   const ids=new Map<string,string>();for(const l of child!.layers)if(used.has(l.id)){let n=newId('layer');while(used.has(n))n=newId('layer');ids.set(l.id,n);}
   let nid=newId('layer');while(used.has(nid)||[...ids.values()].includes(nid))nid=newId('layer');
   const r=unpackLayers(c,pl,child!,nid,ids);if(typeof r==='string'){skipped++;firstWhy=firstWhy||r;continue;}
   const at=order.indexOf(pl.id),made=r.layers.map((l:Layer)=>l.id);
   edits.push({type:'layers.import',comp:c.id,layers:r.layers},{type:'layer.remove',layer:pl.id});
   order=[...made,...order.filter(x=>x!==pl.id)];
   const final=[...order.slice(made.length)];final.splice(at,0,...made);
   for(let i=0;i<final.length;i++)if(order[i]!==final[i]){edits.push({type:'layer.reorder',layer:final[i],index:i});order.splice(order.indexOf(final[i]),1);order.splice(i,0,final[i]);}
   made.forEach(m=>used.add(m));used.delete(pl.id);total+=made.length;dropped+=r.dropped;
  }
  if(!edits.length)return expected(firstWhy||'Nothing to unpack.');
  try{s.dispatch(edits);}catch(e){if(e instanceof EditError)throw Object.assign(e,{expected:true});throw e;}
  return {unpacked:picked.length-skipped,layers:total,skipped,dropped};
 }) as (p:unknown)=>unknown}];
