import {findComp,findLayer,MAX_LAYER_TEMPLATES,MAX_LAYER_TEMPLATE_CHARS,type AnimationDocument,type Layer,type LayerTemplate} from './model';
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
/** The template for a layer of the active composition, or an error that says why it cannot be saved. */
export function buildTemplate(doc:AnimationDocument,layerId:string,name:string|undefined,id:string):LayerTemplate{
 const c=findComp(doc),l=c&&findLayer(c,layerId);if(!l)throw Error('Select a layer.');
 if(!['shape','text','solid'].includes(l.kind))throw Error('Only shape, text and solid layers can be saved as templates.');
 if(l.parent)throw Error('Unlink the layer from its parent first.');if(l.matte)throw Error('Remove the track matte first.');
 const items=layerTemplates(doc);if(items.length>=MAX_LAYER_TEMPLATES)throw Error(`At most ${MAX_LAYER_TEMPLATES} saved templates. Delete one first.`);
 const base=Math.max(0,Math.min(l.inT,minKeyTime(l)));
 const nm=(name??l.name).trim().slice(0,40);if(!nm)throw Error('Give the template a name.');
 let unique=nm,n=2;while(items.some(x=>x.name===unique))unique=`${nm.slice(0,36)} ${n++}`;
 const layer:Layer={...shiftTimes(l,-base),id:'template',parent:null,inT:l.inT-base,outT:l.outT-base,locked:false,solo:false};
 if(JSON.stringify(layer).length>MAX_LAYER_TEMPLATE_CHARS)throw Error('This layer is too large to save as a template.');
 return {id,name:unique,layer};
}
/** The layer to add for a saved template placed at `at` (composition ticks), clipped to the composition end. */
export function templateLayer(t:LayerTemplate,id:string,at:number,end:number):Layer{
 const l=shiftTimes(t.layer,at);const inT=t.layer.inT+at;if(inT>=end)throw Error('Move the playhead earlier.');
 return {...l,id,inT,outT:Math.min(end,t.layer.outT+at)};
}
