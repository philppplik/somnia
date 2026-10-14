import {findComp,MAX_LAYER_TEMPLATES,MAX_LAYER_TEMPLATE_CHARS,MAX_TEMPLATE_LAYERS,MAX_TEMPLATE_GROUP_CHARS,type AnimationDocument,type Layer,type LayerTemplate} from './model';
/** Saved layer templates: pure helpers. Times inside a template count from the layer's own start, so inserting is one shift. */
const isObj=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const isKey=(x:unknown):x is {t:number}=>isObj(x)&&typeof x.t==='number'&&Number.isInteger(x.t);
/** Deep copy with every keyframe time (an object with an integer `t` inside an array) moved by `delta` ticks. */
export function shiftTimes<T>(v:T,delta:number):T{
 const walk=(x:unknown):unknown=>Array.isArray(x)?x.map(el=>isKey(el)?{...(walk(el) as object),t:el.t+delta}:walk(el)):isObj(x)?Object.fromEntries(Object.entries(x).map(([k,y])=>[k,walk(y)])):x;
 return walk(v) as T;
}
/** Earliest keyframe time in the value, or Infinity. */
export function minKeyTime(v:unknown):number{
 let m=Infinity;const walk=(x:unknown)=>{if(Array.isArray(x))for(const el of x){if(isKey(el))m=Math.min(m,el.t);walk(el);}else if(isObj(x))for(const y of Object.values(x))walk(y);};walk(v);return m;
}
export const layerTemplates=(doc:AnimationDocument|null|undefined):readonly LayerTemplate[]=>doc?.layerTemplates?.items??[];
export const templateLayersOf=(t:LayerTemplate):readonly Layer[]=>[t.layer,...(t.extra??[])];
/** The template for one layer, or for several layers (comp order, parent links kept) of the active composition; or an error that says why it cannot be saved. */
export function buildTemplate(doc:AnimationDocument,layerIds:string|readonly string[],name:string|undefined,id:string):LayerTemplate{
 const c=findComp(doc);const want=typeof layerIds==='string'?[layerIds]:[...new Set(layerIds)];
 const ls=c?c.layers.filter(x=>want.includes(x.id)):[];if(!c||!ls.length||ls.length!==want.length)throw Error('Select a layer.');
 if(ls.length>MAX_TEMPLATE_LAYERS)throw Error(`At most ${MAX_TEMPLATE_LAYERS} layers per template.`);
 for(const l of ls){
  if(!['shape','text','solid'].includes(l.kind))throw Error('Only shape, text and solid layers can be saved as templates.');
  if(l.matte)throw Error('Remove the track matte first.');
  if(l.parent&&!ls.some(x=>x.id===l.parent))throw Error(ls.length>1?'A layer is linked to a parent outside the selection. Select the parent too or unlink it.':'Unlink the layer from its parent first.');
 }
 const items=layerTemplates(doc);if(items.length>=MAX_LAYER_TEMPLATES)throw Error(`At most ${MAX_LAYER_TEMPLATES} saved templates. Delete one first.`);
 const base=Math.max(0,Math.min(...ls.map(l=>Math.min(l.inT,minKeyTime(l)))));
 const nm=(name??ls[0].name).trim().slice(0,40);if(!nm)throw Error('Give the template a name.');
 let unique=nm,n=2;while(items.some(x=>x.name===unique))unique=`${nm.slice(0,36)} ${n++}`;
 const tid=new Map(ls.map((l,i)=>[l.id,i?`template-${i+1}`:'template']));
 const out=ls.map(l=>({...shiftTimes(l,-base),id:tid.get(l.id)!,parent:l.parent?tid.get(l.parent)!:null,inT:l.inT-base,outT:l.outT-base,locked:false,solo:false}) as Layer);
 const t:LayerTemplate={id,name:unique,layer:out[0],...(out.length>1?{extra:out.slice(1)}:{})};
 if(out.length===1&&JSON.stringify(out[0]).length>MAX_LAYER_TEMPLATE_CHARS||JSON.stringify(out).length>MAX_TEMPLATE_GROUP_CHARS)throw Error('This selection is too large to save as a template.');
 return t;
}
/** The layers to add for a saved template placed at `at` (composition ticks), clipped to the composition end. `ids` are fresh ids, one per template layer; parent links are remapped. */
export function templateLayers(t:LayerTemplate,ids:readonly string[],at:number,end:number):Layer[]{
 const src=templateLayersOf(t);if(ids.length!==src.length||new Set(ids).size!==ids.length)throw Error('One new id per template layer is needed.');
 const map=new Map(src.map((l,i)=>[l.id,ids[i]]));
 const out=src.map((l,i)=>{const sh=shiftTimes(l,at);const inT=l.inT+at;return inT>=end?null:{...sh,id:ids[i],parent:l.parent?map.get(l.parent)??null:null,inT,outT:Math.min(end,l.outT+at)} as Layer;});
 if(out[0]===null)throw Error('Move the playhead earlier.');
 return out.filter((x):x is Layer=>x!==null).map(l=>l.parent&&!out.some(o=>o&&o.id===l.parent)?{...l,parent:null}:l);
}
/** Single-layer form kept for callers that insert one layer. */
export const templateLayer=(t:LayerTemplate,id:string,at:number,end:number):Layer=>templateLayers({...t,extra:undefined},[id],at,end)[0];
/** Template files: `{format,version,items:[{name,layer,extra?}]}`. Ids are not exported; importing gives every template a fresh id. */
export const TEMPLATE_FILE_FORMAT='somnia-layer-templates';
export const TEMPLATE_FILE_LIMIT=300000;
export const exportTemplatesJson=(items:readonly LayerTemplate[]):string=>JSON.stringify({format:TEMPLATE_FILE_FORMAT,version:1,items:items.map(t=>({name:t.name,layer:t.layer,...(t.extra?.length?{extra:t.extra}:{})}))},null,1);
/** Reads a template file. Shape checks only; the layers themselves are validated like any layer when they are merged into a document. */
export function parseTemplatesJson(text:string):{name:string;layer:Layer;extra?:Layer[]}[]{
 if(text.length>TEMPLATE_FILE_LIMIT)throw Error('This template file is too large.');
 let v:unknown;try{v=JSON.parse(text);}catch{throw Error('This is not a template file (invalid JSON).');}
 if(!isObj(v)||v.format!==TEMPLATE_FILE_FORMAT||v.version!==1||!Array.isArray(v.items))throw Error('This is not a Somnia template file.');
 if(!v.items.length||v.items.length>MAX_LAYER_TEMPLATES)throw Error(`A template file holds 1 to ${MAX_LAYER_TEMPLATES} templates.`);
 return v.items.map((x:unknown)=>{
  if(!isObj(x)||typeof x.name!=='string'||!x.name.trim()||!isObj(x.layer)||(x.extra!==undefined&&!Array.isArray(x.extra)))throw Error('A template in the file is malformed.');
  if(Array.isArray(x.extra)&&(x.extra.length+1>MAX_TEMPLATE_LAYERS||x.extra.some(e=>!isObj(e))))throw Error('A template in the file is malformed.');
  return {name:x.name.trim().slice(0,40),layer:x.layer as unknown as Layer,...(Array.isArray(x.extra)&&x.extra.length?{extra:x.extra as unknown as Layer[]}:{})};
 });
}
/** The edit that adds imported templates: fresh ids, names made unique with " 2", " 3"... The whole import is refused (nothing added) when it would exceed the cap or any template is invalid. */
export function mergeTemplatesEdit(doc:AnimationDocument,incoming:readonly {name:string;layer:Layer;extra?:readonly Layer[]}[],newId:()=>string):{type:'layerTemplates.set';items:LayerTemplate[]}{
 const have=layerTemplates(doc);if(have.length+incoming.length>MAX_LAYER_TEMPLATES)throw Error(`That would pass the limit of ${MAX_LAYER_TEMPLATES} saved templates (${have.length} saved, ${incoming.length} in the file).`);
 const items=[...have];
 for(const x of incoming){let nm=x.name.slice(0,40),n=2;while(items.some(y=>y.name===nm))nm=`${x.name.slice(0,36)} ${n++}`;items.push({id:newId(),name:nm,layer:x.layer,...(x.extra?.length?{extra:x.extra}:{})});}
 return {type:'layerTemplates.set',items};
}
