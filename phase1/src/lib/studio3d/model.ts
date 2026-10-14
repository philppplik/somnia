/** Pure helpers for the 3D studio. No three.js and no DOM, so they run under tsx --test. */
export const MODEL_EXTENSIONS=['glb','gltf'] as const;
export type ModelFormat=typeof MODEL_EXTENSIONS[number];
export const MODEL_ACCEPT=MODEL_EXTENSIONS.map(e=>'.'+e).join(',')+',model/gltf-binary,model/gltf+json';
/** Hard limit for one opened model. Larger files are refused with a clear message instead of freezing the WebView. */
export const MAX_MODEL_BYTES=256*1024*1024;
const GLB_MAGIC=0x46546c67;// "glTF" little endian
const CHUNK_JSON=0x4e4f534a,CHUNK_BIN=0x004e4942;
export interface ModelHeader{format:ModelFormat;version:number;json:Record<string,unknown>;binOffset:number;binLength:number}
export class ModelError extends Error{constructor(message:string){super(message);this.name='ModelError';}}
const extOf=(name:string)=>(name.includes('.')?name.split('.').pop()!:'').toLowerCase();
export function modelFormatFor(name:string):ModelFormat|null{const e=extOf(name);return (MODEL_EXTENSIONS as readonly string[]).includes(e)?e as ModelFormat:null;}
/**
 * Reads the container only: GLB header and chunk table, or the JSON of a .gltf. Content decides, the suffix is a hint.
 * Throws ModelError with a user-readable message for anything that is not glTF 2.0.
 */
export function readModelHeader(name:string,bytes:Uint8Array):ModelHeader{
 if(bytes.byteLength===0)throw new ModelError(`${name} is empty.`);
 if(bytes.byteLength>MAX_MODEL_BYTES)throw new ModelError(`${name} is larger than ${MAX_MODEL_BYTES/1048576} MB and cannot be opened.`);
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(bytes.byteLength>=12&&view.getUint32(0,true)===GLB_MAGIC){
  const version=view.getUint32(4,true),total=view.getUint32(8,true);
  if(version!==2)throw new ModelError(`${name} is glTF version ${version}. Only version 2 is supported.`);
  if(total>bytes.byteLength)throw new ModelError(`${name} is truncated: header says ${total} bytes, file has ${bytes.byteLength}.`);
  let off=12,json:Record<string,unknown>|null=null,binOffset=0,binLength=0;
  while(off+8<=total){
   const len=view.getUint32(off,true),type=view.getUint32(off+4,true),start=off+8;
   if(start+len>total)throw new ModelError(`${name} has a damaged chunk table.`);
   if(type===CHUNK_JSON&&!json){
    try{json=JSON.parse(new TextDecoder('utf-8').decode(bytes.subarray(start,start+len)));}catch{throw new ModelError(`${name} has an unreadable JSON chunk.`);}
   }else if(type===CHUNK_BIN&&!binLength){binOffset=bytes.byteOffset+start;binLength=len;}
   off=start+((len+3)&~3);
  }
  if(!json||typeof json!=='object')throw new ModelError(`${name} has no JSON chunk.`);
  checkAsset(name,json);
  return{format:'glb',version,json,binOffset,binLength};
 }
 let text:string;
 try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new ModelError(`${name} is not a glTF or GLB file.`);}
 let json:unknown;
 try{json=JSON.parse(text);}catch{throw new ModelError(`${name} is not a glTF or GLB file.`);}
 if(!json||typeof json!=='object'||Array.isArray(json))throw new ModelError(`${name} is not a glTF or GLB file.`);
 checkAsset(name,json as Record<string,unknown>);
 return{format:'gltf',version:2,json:json as Record<string,unknown>,binOffset:0,binLength:0};
}
function checkAsset(name:string,json:Record<string,unknown>){
 const asset=json.asset as {version?:unknown}|undefined;
 if(!asset||typeof asset!=='object'||typeof asset.version!=='string')throw new ModelError(`${name} has no glTF asset block.`);
 if(!/^2\./.test(asset.version))throw new ModelError(`${name} is glTF ${asset.version}. Only version 2 is supported.`);
}
/** External buffers or images a .gltf names by relative URI. data: URIs are self-contained and not listed. */
export function externalResources(json:Record<string,unknown>):string[]{
 const out=new Set<string>();
 for(const key of ['buffers','images']){
  const list=json[key];if(!Array.isArray(list))continue;
  for(const item of list){const uri=(item as {uri?:unknown})?.uri;if(typeof uri==='string'&&!uri.startsWith('data:'))out.add(uri);}
 }
 return [...out];
}
export interface Bounds{min:[number,number,number];max:[number,number,number]}
export const emptyBounds=():Bounds=>({min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]});
export const boundsValid=(b:Bounds)=>b.min.every((v,i)=>Number.isFinite(v)&&Number.isFinite(b.max[i])&&v<=b.max[i]);
export const boundsCenter=(b:Bounds):[number,number,number]=>[(b.min[0]+b.max[0])/2,(b.min[1]+b.max[1])/2,(b.min[2]+b.max[2])/2];
export const boundsSize=(b:Bounds):[number,number,number]=>[b.max[0]-b.min[0],b.max[1]-b.min[1],b.max[2]-b.min[2]];
export const boundsRadius=(b:Bounds)=>{const s=boundsSize(b);return Math.hypot(s[0],s[1],s[2])/2;};
/** Distance at which a sphere of `radius` fits the vertical and horizontal field of view with a small margin. */
export function frameDistance(radius:number,fovDeg:number,aspect:number,margin=1.15):number{
 if(!(radius>0)||!(fovDeg>0)||!(aspect>0))return 3;
 const v=(fovDeg*Math.PI)/180,h=2*Math.atan(Math.tan(v/2)*aspect);
 return (radius*margin)/Math.sin(Math.min(v,h)/2);
}
/** Near and far planes derived from the model, so tiny and huge models do not clip or z-fight. */
export function clipPlanes(distance:number,radius:number):{near:number;far:number}{
 const r=Math.max(radius,1e-6);
 return{near:Math.max(distance/1000,r/1000),far:Math.max(distance+r*20,distance*4)};
}
export interface ModelStats{meshes:number;nodes:number;triangles:number;vertices:number;materials:number;textures:number;animations:number;cameras:number;draws:number}
export const emptyStats=():ModelStats=>({meshes:0,nodes:0,triangles:0,vertices:0,materials:0,textures:0,animations:0,cameras:0,draws:0});
export const formatCount=(n:number)=>n>=1e6?(n/1e6).toFixed(n>=1e7?0:1)+' M':n>=1e4?(n/1e3).toFixed(n>=1e5?0:1)+' k':String(n);
export interface OutlineEntry{id:number;name:string;depth:number;kind:'group'|'mesh'|'light'|'camera'}
