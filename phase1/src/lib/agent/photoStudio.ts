import {parseDocument,serializeDocument,withOperations,assertImageSize} from '../image-editor/document';
import {createOperationRegistry,renderStack,type RasterImage} from '../image-editor/pipeline';
import type {ImageEditDocument,ImageOperation} from '../image-editor/types';
import {adjustHandler,adjustToJson,DEFAULT_ADJUST_PARAMS,SLIDER_KEYS} from '../imageedit/adjust';
import {FILTER_TYPES,newFilterOperation,registerFilterOps,type FilterType} from '../imageedit/filters';
import {TRANSFORM_HANDLERS} from '../imgedit/handlers';
import {AgentToolRegistry,type AgentToolSpec} from './toolRegistry';
import type {DocumentAdapter,DocumentSnapshot} from './documentCore';
export function photoRegistry(){const r=createOperationRegistry();r.register(adjustHandler);registerFilterOps(r);for(const h of TRANSFORM_HANDLERS)r.register(h);return r;}
const types=['adjust',...FILTER_TYPES,'crop','resize','rotate','flip'];
/** No pixel references/URLs in serialized context or provider tool results. */
export function validatePhoto(text:string):ImageEditDocument {
 const doc=parseDocument(text);if(doc.operations.length>100)throw Error('Photo operation limit reached.');
 let size={width:doc.source.width,height:doc.source.height};
 if(size.width*size.height>4*1024*1024)throw Error('Native AI Photo preview is limited to 4 megapixels.');
 for(const op of doc.operations){
  if(op.version!==1||!types.includes(op.type))throw Error('Unsupported native Photo operation.');
  if(op.type==='adjust'){
   const p=op.params;for(const key of SLIDER_KEYS){const n=p[key];const max=key==='hue'?180:1;if(typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>max)throw Error('Invalid adjustment value.');}
   if(!Array.isArray(p.curves)||p.curves.length<2||p.curves.length>32||!p.curves.every((v,i,list)=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&typeof v.x==='number'&&typeof v.y==='number'&&Number.isFinite(v.x)&&Number.isFinite(v.y)&&v.x>=0&&v.x<=1&&v.y>=0&&v.y<=1&&(i===0||Number((list[i-1] as {x:number}).x)<v.x)))throw Error('Invalid Photo curves.');
  }else if(FILTER_TYPES.includes(op.type as FilterType))newFilterOperation(op.id,op.type as FilterType,op.params);
  else {const h=TRANSFORM_HANDLERS.find(h=>h.type===op.type)!;
   if(op.type==='crop'){const p=op.params;if(!['x','y','width','height'].every(k=>typeof p[k]==='number'&&Number.isInteger(p[k]))||Number(p.x)<0||Number(p.y)<0||Number(p.width)<1||Number(p.height)<1||Number(p.x)+Number(p.width)>size.width||Number(p.y)+Number(p.height)>size.height)throw Error('Crop is outside image bounds.');}
   if(op.type==='resize')assertImageSize(Number(op.params.width),Number(op.params.height));
   if(op.type==='flip'&&!['horizontal','vertical'].includes(String(op.params.axis)))throw Error('Invalid flip axis.');
   if(op.enabled)size=h.outputSize(size.width,size.height,op.params);
  }
  assertImageSize(size.width,size.height);if(size.width*size.height>4*1024*1024)throw Error('Native AI Photo preview is limited to 4 megapixels.');
 }
 return doc;
}
export const photoAdapter:DocumentAdapter={id:'photo-stack-v1',kind:'photo',validate(text){validatePhoto(text);}};
export interface PhotoPreview {before:string;after:string;width:number;height:number;beforeWidth:number;beforeHeight:number;operations:readonly ImageOperation[]}
export interface PhotoToolHost {snapshot():DocumentSnapshot;preview(after:string,signal:AbortSignal):Promise<void>}
export function createPhotoStudioRegistry(host:PhotoToolHost):AgentToolRegistry {
 const current=()=>{const s=host.snapshot();return {s,doc:validatePhoto(s.text)};};let serial=0;
 const obj=(properties:Record<string,unknown>,required:string[]=[])=>({type:'object',properties,required,additionalProperties:false});
 const add=(name:string,level:'read'|'propose',description:string,properties:Record<string,unknown>,required:string[],run:AgentToolSpec['run']):AgentToolSpec=>({level,definition:{name,description,parameters:obj(properties,required)},run:async(a,c,s)=>{if(Object.keys(a).some(k=>!Object.hasOwn(properties,k)))throw Error('Unexpected Photo arguments.');return run(a,c,s);}});
 const stage=async(op:ImageOperation,c:Parameters<AgentToolSpec['run']>[1],signal:AbortSignal)=>{const {s,doc}=current();const after=serializeDocument(withOperations(doc,[...doc.operations,op]));validatePhoto(after);await host.preview(after,signal);host.snapshot();await c.propose(s.ref.path,after,signal);return JSON.stringify({state:'review',saved:false,operation:op,width:doc.source.width,height:doc.source.height,pixelsDisclosed:false});};
 const id=()=>`photo-ai-${++serial}-${crypto.randomUUID()}`;
 return new AgentToolRegistry()
 .register(add('raster_inspect','read','Inspect image dimensions and non-destructive operation stack. Never returns pixels or file URLs.',{},[],async()=>{const {s,doc}=current();return JSON.stringify({document:s.ref,source:{name:doc.source.name,mime:doc.source.mime,width:doc.source.width,height:doc.source.height},operations:doc.operations,pixelsDisclosed:false});}))
 .register(add('raster_adjust','propose','Append a non-destructive adjustment. Values -1..1, hue -180..180. Requires a rendered before/after preview.',Object.fromEntries(SLIDER_KEYS.map(k=>[k,{type:'number',minimum:k==='hue'?-180:-1,maximum:k==='hue'?180:1}])),[],async(a,c,signal)=>{if(!Object.keys(a).length)throw Error('Choose at least one adjustment.');for(const [k,v] of Object.entries(a)){const max=k==='hue'?180:1;if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>max)throw Error('Invalid adjustment value.');}return stage({id:id(),type:'adjust',version:1,enabled:true,params:adjustToJson({...DEFAULT_ADJUST_PARAMS,...a})},c,signal);}))
 .register(add('raster_filter','propose','Append one implemented filter to the operation stack. Strength 0..1. Original pixels are preserved.',{filter:{type:'string',enum:FILTER_TYPES},strength:{type:'number',minimum:0,maximum:1}},['filter','strength'],async(a,c,signal)=>{if(typeof a.filter!=='string'||!FILTER_TYPES.includes(a.filter as FilterType)||typeof a.strength!=='number')throw Error('Invalid filter.');return stage(newFilterOperation(id(),a.filter as FilterType,{strength:a.strength}),c,signal);}))
 .register(add('raster_crop','propose','Append a bounded non-destructive crop in integer pixels. Preview shows exact output dimensions.',{x:{type:'integer'},y:{type:'integer'},width:{type:'integer'},height:{type:'integer'}},['x','y','width','height'],async(a,c,signal)=>stage({id:id(),type:'crop',version:1,enabled:true,params:a as ImageOperation['params']},c,signal)));
}
export async function renderPhoto(source:RasterImage,text:string,signal?:AbortSignal){const doc=validatePhoto(text);return renderStack(source,doc,photoRegistry(),{signal});}
