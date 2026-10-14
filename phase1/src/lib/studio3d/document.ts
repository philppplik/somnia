import {isUnit,envFormatFor,mergeEnv,mergeSnap,defaultEnv,defaultSnap,type EnvSettings,type SnapSettings,type ExportUnit,type NamedView} from './model';
/**
 * The 3D scene document (.som3d). Pure data, no three.js, so reading and writing run under tsx --test.
 * Geometry, materials, hierarchy, transforms, punctual lights and cameras live in a GLB (embedded or a sidecar file).
 * The JSON holds what glTF cannot: units, environment, snapping, saved view and per-node extras.
 * See docs/concepts/3d-studio-document.md.
 */
export const DOC_FORMAT='somnia-3d';
export const DOC_VERSION=1;
export const DOC_EXTENSION='som3d';
export const MAX_DOC_NODES=100_000;
/** Largest environment map (decoded bytes) that may be embedded in a document. Bigger maps stay a separate file. */
/** Largest GLB (with its embedded textures) a document may carry. Bigger scenes must be saved with the geometry as a separate file. */
export const MAX_EMBED_SCENE_BYTES=256*1024*1024;
export const MAX_EMBED_ENV_BYTES=16*1024*1024;
export class DocumentError extends Error{constructor(message:string){super(message);this.name='DocumentError';}}
export interface AreaLightSpec{position:[number,number,number];quaternion:[number,number,number,number];scale:[number,number,number];color:string;intensity:number;width:number;height:number;name:string}
export interface AmbientLightSpec{color:string;intensity:number;name:string}
/** Data for one node, addressed by its depth-first index below the scene root. */
export interface NodeExtra{i:number;shadow?:boolean;area?:AreaLightSpec;ambient?:AmbientLightSpec}
export interface SavedView{position:[number,number,number];target:[number,number,number];fov:number}
export type SceneSource={encoding:'base64';data:string}|{uri:string};
export interface SceneDocument{
 format:typeof DOC_FORMAT;version:number;app:string;unit:ExportUnit;env:EnvSettings;snap:SnapSettings;view:SavedView|null;/** Named viewport views saved in the studio, in addition to the single camera view. */views:NamedView[];extras:NodeExtra[];scene:SceneSource;/** A custom HDR/EXR map stored with the scene, or null. */envMap:EmbeddedEnv|null;
}
export interface EmbeddedEnv{name:string;encoding:'base64';data:string}
const B64=/^[A-Za-z0-9+/]*={0,2}$/;
export function toBase64(bytes:Uint8Array):string{
 let out='';for(let i=0;i<bytes.length;i+=0x8000)out+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(out);
}
export function fromBase64(text:string):Uint8Array{
 if(text.length%4!==0||!B64.test(text))throw new DocumentError('The embedded scene data is damaged.');
 const bin=atob(text);const out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out;
}
const num=(v:unknown,what:string):number=>{if(typeof v!=='number'||!Number.isFinite(v))throw new DocumentError(`${what} must be a finite number.`);return v;};
function vec(v:unknown,n:number,what:string):number[]{
 if(!Array.isArray(v)||v.length!==n)throw new DocumentError(`${what} must have ${n} numbers.`);return v.map((x,i)=>num(x,`${what}[${i}]`));
}
const HEX=/^#[0-9a-fA-F]{6}$/;
/** Migrations take a document of version N and return version N+1. Add one per format change. */
export type Migrations=Record<number,(doc:Record<string,unknown>)=>Record<string,unknown>>;
export const MIGRATIONS:Migrations={};
export function migrate(doc:Record<string,unknown>,migrations:Migrations=MIGRATIONS,current=DOC_VERSION):Record<string,unknown>{
 let v=doc.version;
 if(typeof v!=='number'||!Number.isInteger(v)||v<1)throw new DocumentError('The document has no valid version.');
 if(v>current)throw new DocumentError(`This scene was saved by a newer version of Somnia (format ${v}). Update the app to open it.`);
 let d=doc;
 while(v<current){const step=migrations[v];if(!step)throw new DocumentError(`This scene uses an old format (${v}) that can no longer be opened.`);d={...step(d),version:v+1};v++;}
 return d;
}
/** Parses and validates document text. Unknown top-level fields are ignored. Throws DocumentError with a readable message. */
export function parseDocument(text:string):SceneDocument{
 let raw:unknown;
 try{raw=JSON.parse(text);}catch{throw new DocumentError('This is not a Somnia 3D scene file.');}
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||(raw as {format?:unknown}).format!==DOC_FORMAT)throw new DocumentError('This is not a Somnia 3D scene file.');
 const d=migrate(raw as Record<string,unknown>);
 const unit=d.unit===undefined?'m':d.unit;if(!isUnit(unit))throw new DocumentError('The scene has an unknown unit.');
 let env=defaultEnv(),snap=defaultSnap();
 try{
  if(d.env!==undefined){if(!d.env||typeof d.env!=='object')throw new DocumentError('The environment settings are damaged.');
   const e=d.env as Partial<EnvSettings>;
   // A custom map is not stored in the document. Keep its name so the app can say which file is missing.
   env=mergeEnv(env,{...e,preset:e.preset==='custom'?'studio':e.preset});if(e.preset==='custom')env={...env,preset:'custom',customName:String(e.customName??'').slice(0,200)||'environment'};}
  if(d.snap!==undefined){if(!d.snap||typeof d.snap!=='object')throw new DocumentError('The snapping settings are damaged.');snap=mergeSnap(snap,d.snap as Partial<SnapSettings>);}
 }catch(e){if(e instanceof DocumentError)throw e;throw new DocumentError(`The scene settings are invalid: ${e instanceof Error?e.message:String(e)}`);}
 let view:SavedView|null=null;
 let views:NamedView[]=[];
 if(d.views!==undefined){
  if(!Array.isArray(d.views)||d.views.length>100)throw new DocumentError('The saved views are damaged.');
  const num3=(x:unknown):x is [number,number,number]=>Array.isArray(x)&&x.length===3&&x.every(n=>typeof n==='number'&&Number.isFinite(n));
  const num4=(x:unknown):x is [number,number,number,number]=>Array.isArray(x)&&x.length===4&&x.every(n=>typeof n==='number'&&Number.isFinite(n));
  views=(d.views as unknown[]).map(v=>{
   const o=v as Partial<NamedView>;
   if(!o||typeof o.name!=='string'||!o.name.trim()||o.name.length>60||!num3(o.position)||!num4(o.quaternion)||!num3(o.target))throw new DocumentError('The saved views are damaged.');
   return{name:o.name.slice(0,60),position:[...o.position],quaternion:[...o.quaternion],target:[...o.target]};});
 }
 if(d.view!==undefined&&d.view!==null){
  const v=d.view as Record<string,unknown>;if(typeof v!=='object')throw new DocumentError('The saved view is damaged.');
  const fov=num(v.fov,'view.fov');if(fov<1||fov>120)throw new DocumentError('view.fov must be between 1 and 120.');
  view={position:vec(v.position,3,'view.position') as [number,number,number],target:vec(v.target,3,'view.target') as [number,number,number],fov};
 }
 const extras:NodeExtra[]=[];
 if(d.extras!==undefined){
  if(!Array.isArray(d.extras)||d.extras.length>MAX_DOC_NODES)throw new DocumentError('The node data is damaged or too large.');
  const seen=new Set<number>();
  for(const x of d.extras as Record<string,unknown>[]){
   if(!x||typeof x!=='object')throw new DocumentError('A node entry is damaged.');
   if(typeof x.i!=='number'||!Number.isInteger(x.i)||x.i<0||x.i>=MAX_DOC_NODES||seen.has(x.i))throw new DocumentError('A node entry has an invalid or repeated index.');
   seen.add(x.i);const e:NodeExtra={i:x.i};
   if(x.shadow!==undefined){if(typeof x.shadow!=='boolean')throw new DocumentError('shadow must be true or false.');e.shadow=x.shadow;}
   if(x.area!==undefined){
    const a=x.area as Record<string,unknown>;if(!a||typeof a!=='object')throw new DocumentError('An area light entry is damaged.');
    if(typeof a.color!=='string'||!HEX.test(a.color))throw new DocumentError('An area light has an invalid colour.');
    const w=num(a.width,'area.width'),h=num(a.height,'area.height'),it=num(a.intensity,'area.intensity');
    if(w<=0||h<=0||w>1000||h>1000||it<0||it>100000)throw new DocumentError('An area light has values out of range.');
    e.area={position:vec(a.position,3,'area.position') as [number,number,number],quaternion:vec(a.quaternion,4,'area.quaternion') as [number,number,number,number],scale:vec(a.scale,3,'area.scale') as [number,number,number],color:a.color,intensity:it,width:w,height:h,name:typeof a.name==='string'?a.name.slice(0,120):'Area light'};
   }
   if(x.ambient!==undefined){
    const a=x.ambient as Record<string,unknown>;if(!a||typeof a!=='object')throw new DocumentError('An ambient light entry is damaged.');
    if(typeof a.color!=='string'||!HEX.test(a.color))throw new DocumentError('An ambient light has an invalid colour.');
    const it=num(a.intensity,'ambient.intensity');
    if(it<0||it>100000)throw new DocumentError('An ambient light has values out of range.');
    e.ambient={color:a.color,intensity:it,name:typeof a.name==='string'?a.name.slice(0,120):'Ambient light'};
   }
   extras.push(e);
  }
 }
 const s=d.scene as Record<string,unknown>|undefined;let scene:SceneSource;
 if(s&&typeof s==='object'&&s.encoding==='base64'&&typeof s.data==='string'){if(s.data.length>Math.ceil(MAX_EMBED_SCENE_BYTES/3)*4)throw new DocumentError('The embedded scene is too large to open.');scene={encoding:'base64',data:s.data};}
 else if(s&&typeof s==='object'&&typeof s.uri==='string'){
  const uri=s.uri;if(!uri||/[\\/]/.test(uri)||/^[a-z][a-z0-9+.-]*:/i.test(uri)||uri.includes('..'))throw new DocumentError('The scene file reference must be a plain file name next to the document.');
  scene={uri};
 }else throw new DocumentError('The document has no scene data.');
 let envMap:EmbeddedEnv|null=null;
 if(d.envMap!==undefined&&d.envMap!==null){
  const m=d.envMap as Record<string,unknown>;
  if(typeof m!=='object'||Array.isArray(m)||typeof m.name!=='string'||m.encoding!=='base64'||typeof m.data!=='string')throw new DocumentError('The embedded environment map is damaged.');
  const name=m.name.replace(/^.*[\\/]/,'').slice(0,200);
  if(!envFormatFor(name))throw new DocumentError('The embedded environment map must be an .hdr or .exr file.');
  // base64 length gives the decoded size without allocating it
  if(m.data.length>Math.ceil(MAX_EMBED_ENV_BYTES/3)*4)throw new DocumentError('The embedded environment map is too large.');
  if(m.data.length%4!==0||!B64.test(m.data))throw new DocumentError('The embedded environment map is damaged.');
  envMap={name,encoding:'base64',data:m.data};
  if(env.preset==='custom')env={...env,customName:name};
 }
 return{format:DOC_FORMAT,version:DOC_VERSION,app:typeof d.app==='string'?d.app.slice(0,60):'',unit,env,snap,view,views,extras,scene,envMap};
}
export interface BuildInput{glb:Uint8Array;/** Name of a sidecar GLB. When set, the GLB is not embedded. */sidecar?:string;unit:ExportUnit;env:EnvSettings;snap:SnapSettings;view:SavedView|null;views?:NamedView[];extras:NodeExtra[];/** Custom environment map to embed. Dropped with an error when over MAX_EMBED_ENV_BYTES. */envMap?:{name:string;bytes:Uint8Array}}
export function buildDocument(i:BuildInput):string{
 if(!i.sidecar&&i.glb.length>MAX_EMBED_SCENE_BYTES)throw new DocumentError(`The scene is larger than ${MAX_EMBED_SCENE_BYTES/1024/1024} MB and cannot be embedded. Save it with the geometry as a separate file.`);
 const scene:SceneSource=i.sidecar?{uri:i.sidecar}:{encoding:'base64',data:toBase64(i.glb)};
 let envMap:EmbeddedEnv|null=null;
 if(i.envMap){
  if(!envFormatFor(i.envMap.name))throw new DocumentError('Only .hdr and .exr environment maps can be embedded.');
  if(i.envMap.bytes.length>MAX_EMBED_ENV_BYTES)throw new DocumentError(`The environment map is larger than ${MAX_EMBED_ENV_BYTES/1024/1024} MB and cannot be embedded.`);
  envMap={name:i.envMap.name.replace(/^.*[\\/]/,'').slice(0,200),encoding:'base64',data:toBase64(i.envMap.bytes)};
 }
 const doc:SceneDocument={format:DOC_FORMAT,version:DOC_VERSION,app:'somnia',unit:i.unit,env:i.env,snap:i.snap,view:i.view,views:i.views??[],extras:i.extras,scene,envMap};
 return JSON.stringify(doc);
}
/** The GLB bytes of a parsed document: embedded data, or the sidecar file the user selected with it. */
export async function sceneBytes(doc:SceneDocument,sidecars:readonly {name:string;bytes:()=>Promise<Uint8Array>}[]):Promise<Uint8Array>{
 if('data' in doc.scene)return fromBase64(doc.scene.data);
 const want=doc.scene.uri.toLowerCase();const hit=sidecars.find(f=>f.name.replace(/^.*[\\/]/,'').toLowerCase()===want);
 if(!hit)throw new DocumentError(`This scene keeps its geometry in ${doc.scene.uri}. Select that file together with the scene file.`);
 return hit.bytes();
}
