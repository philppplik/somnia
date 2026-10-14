/** Pure helpers for the 3D studio. No three.js and no DOM, so they run under tsx --test. */
export const MODEL_EXTENSIONS=['glb','gltf','obj','stl','ply','som3d'] as const;
/** Single-file mesh formats. They carry geometry only and are read by the three examples loaders. */
export const MESH_FORMATS=['obj','stl','ply'] as const;
export const isMeshFormat=(f:string):f is typeof MESH_FORMATS[number]=>(MESH_FORMATS as readonly string[]).includes(f);
/** Text meshes cost far more memory than their size suggests, so they get a lower limit. */
export const MAX_OBJ_BYTES=96*1024*1024;
export const MAX_MESH_ELEMENTS=20_000_000;
export type ModelFormat=typeof MODEL_EXTENSIONS[number];
export const MODEL_ACCEPT=MODEL_EXTENSIONS.map(e=>'.'+e).join(',')+',model/gltf-binary,model/gltf+json,model/obj,model/stl';
/** Hard limit for one opened model. Larger files are refused with a clear message instead of freezing the WebView. */
export const MAX_MODEL_BYTES=256*1024*1024;
const GLB_MAGIC=0x46546c67;// "glTF" little endian
const CHUNK_JSON=0x4e4f534a,CHUNK_BIN=0x004e4942;
export interface ModelHeader{format:ModelFormat;version:number;json:Record<string,unknown>;binOffset:number;binLength:number;/** Mesh formats: true when the file has vertices but no faces. */pointCloud?:boolean}
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
 const isGlbMagic=bytes.byteLength>=12&&view.getUint32(0,true)===GLB_MAGIC;
 const ext=extOf(name);
 if(!isGlbMagic&&isMeshFormat(ext))return readMeshHeader(name,ext,bytes);
 if(!isGlbMagic&&ext==='som3d'){
  const head=new TextDecoder('utf-8').decode(bytes.subarray(0,Math.min(bytes.byteLength,4096)));
  if(!/"format"\s*:\s*"somnia-3d"/.test(head))throw new ModelError(`${name} is not a Somnia 3D scene file.`);
  return{format:'som3d',version:1,json:{},binOffset:0,binLength:0};
 }
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
/** Light, bounded checks of OBJ, STL and PLY before any loader sees the bytes. Throws ModelError. */
function readMeshHeader(name:string,format:typeof MESH_FORMATS[number],bytes:Uint8Array):ModelHeader{
 const head=(format:ModelFormat,extra:Partial<ModelHeader>={}):ModelHeader=>({format,version:0,json:{},binOffset:0,binLength:0,...extra});
 if(format==='stl'){
  if(bytes.byteLength>=84){
   const n=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(80,true);
   if(n>0&&84+n*50===bytes.byteLength){if(n>MAX_MESH_ELEMENTS)throw new ModelError(`${name} has too many triangles.`);return head('stl');}
  }
  const text=new TextDecoder('utf-8').decode(bytes.subarray(0,Math.min(bytes.byteLength,4096)));
  if(/^\s*solid/i.test(text)&&/facet\s+normal/i.test(text))return head('stl');
  throw new ModelError(`${name} is not a valid STL file.`);
 }
 if(format==='ply'){
  const text=new TextDecoder('latin1').decode(bytes.subarray(0,Math.min(bytes.byteLength,65536)));
  if(!/^ply\r?\n/.test(text))throw new ModelError(`${name} is not a PLY file.`);
  const end=text.search(/\bend_header\r?\n/);
  if(end<0)throw new ModelError(`${name} has no complete PLY header.`);
  const header=text.slice(0,end);
  if(!/^format\s+(ascii|binary_little_endian|binary_big_endian)\s+1\.0/m.test(header))throw new ModelError(`${name} has an unsupported PLY format line.`);
  const count=(el:string)=>{const m=new RegExp('^element\\s+'+el+'\\s+(\\d+)','m').exec(header);return m?Number(m[1]):0;};
  const verts=count('vertex'),faces=count('face');
  if(verts<=0)throw new ModelError(`${name} has no vertices.`);
  if(verts>MAX_MESH_ELEMENTS||faces>MAX_MESH_ELEMENTS)throw new ModelError(`${name} is too large to open (more than ${MAX_MESH_ELEMENTS/1_000_000} million elements).`);
  return head('ply',{pointCloud:faces===0});
 }
 if(bytes.byteLength>MAX_OBJ_BYTES)throw new ModelError(`${name} is larger than ${MAX_OBJ_BYTES/1048576} MB. Convert large OBJ files to GLB first.`);
 let text:string;
 try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new ModelError(`${name} is not a text OBJ file.`);}
 if(!/^v\s+\S+\s+\S+\s+\S+/m.test(text)||!/^f\s+\S+/m.test(text))throw new ModelError(`${name} has no vertices and faces, so it is not a usable OBJ.`);
 return head('obj');
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
export interface ModelStats{meshes:number;nodes:number;/** Bones (joints) of skinned meshes. */bones:number;triangles:number;vertices:number;materials:number;textures:number;animations:number;cameras:number;draws:number;/** Estimated decoded size of all textures. */textureBytes:number;/** Estimated size of all geometry buffers (attributes and index). */geometryBytes:number;maxTexture:number;/** Nodes with a zero scale on some axis. */zeroScale:number;/** Meshes that use a texture but have no UV set. */textureNoUv:number}
export const emptyStats=():ModelStats=>({meshes:0,nodes:0,bones:0,triangles:0,vertices:0,materials:0,textures:0,animations:0,cameras:0,draws:0,textureBytes:0,geometryBytes:0,maxTexture:0,zeroScale:0,textureNoUv:0});
export const formatCount=(n:number)=>n>=1e6?(n/1e6).toFixed(n>=1e7?0:1)+' M':n>=1e4?(n/1e3).toFixed(n>=1e5?0:1)+' k':String(n);
export interface OutlineEntry{id:number;name:string;depth:number;kind:'group'|'mesh'|'light'|'camera'|'bone';/** Own visibility flag (a hidden parent hides children too). */hidden:boolean;/** Locked nodes are skipped by viewport picking and marquee selection. */locked:boolean}

export const ENV_PRESETS=['studio','outdoor','sky','dark','neutral','none','custom'] as const;
export type EnvPreset=typeof ENV_PRESETS[number];
export const BG_MODES=['default','env','color','gradient'] as const;
export type BgMode=typeof BG_MODES[number];
export interface EnvSettings{preset:EnvPreset;/** 0 to 3 */intensity:number;/** degrees, -180 to 180 */rotation:number;/** What the viewport shows behind the scene: the flat default, the environment map, a solid colour or a vertical gradient. */bg:BgMode;/** Solid background colour, or the gradient top. */bgColor:string;/** Gradient bottom colour. */bgColor2:string;/** file name of the loaded custom map */customName:string}
export const defaultEnv=():EnvSettings=>({preset:'studio',intensity:1,rotation:0,bg:'default',bgColor:'#e9ebf0',bgColor2:'#9fa4b0',customName:''});
export const ENV_ACCEPT='.hdr,.exr';
export const envFormatFor=(name:string):'hdr'|'exr'|null=>{const e=(name.includes('.')?name.split('.').pop()!:'').toLowerCase();return e==='hdr'||e==='exr'?e:null;};
export class EnvError extends Error{constructor(message:string){super(message);this.name='EnvError';}}
const HEX=/^#[0-9a-fA-F]{6}$/;
/** Validates a partial update and returns the merged settings. The legacy background boolean maps onto bg ('env' when true, 'default' when false) so older documents and commands keep working. */
export function mergeEnv(current:EnvSettings,patch:Partial<EnvSettings>&{background?:boolean}):EnvSettings{
 const next={...current};
 if(patch.preset!==undefined){if(!(ENV_PRESETS as readonly string[]).includes(patch.preset))throw new EnvError(`Unknown environment: ${String(patch.preset)}.`);next.preset=patch.preset;}
 if(patch.intensity!==undefined){if(typeof patch.intensity!=='number'||!Number.isFinite(patch.intensity))throw new EnvError('intensity must be a finite number.');next.intensity=Math.min(3,Math.max(0,patch.intensity));}
 if(patch.rotation!==undefined){if(typeof patch.rotation!=='number'||!Number.isFinite(patch.rotation))throw new EnvError('rotation must be a finite number.');next.rotation=((patch.rotation+180)%360+360)%360-180;}
 if(patch.background!==undefined){if(typeof patch.background!=='boolean')throw new EnvError('background must be true or false.');next.bg=patch.background?'env':'default';}
 if(patch.bg!==undefined){if(!(BG_MODES as readonly string[]).includes(patch.bg))throw new EnvError(`Unknown background: ${String(patch.bg)}.`);next.bg=patch.bg;}
 if(patch.bgColor!==undefined){if(typeof patch.bgColor!=='string'||!HEX.test(patch.bgColor))throw new EnvError('bgColor must look like #rrggbb.');next.bgColor=patch.bgColor;}
 if(patch.bgColor2!==undefined){if(typeof patch.bgColor2!=='string'||!HEX.test(patch.bgColor2))throw new EnvError('bgColor2 must look like #rrggbb.');next.bgColor2=patch.bgColor2;}
 if(patch.customName!==undefined)next.customName=String(patch.customName).slice(0,200);
 if(next.preset==='custom'&&!next.customName)throw new EnvError('Open an .hdr or .exr file first.');
 return next;
}
export type GizmoMode='translate'|'rotate'|'scale';
export const GIZMO_MODES:readonly GizmoMode[]=['translate','rotate','scale'];
/** Keyboard nudge: shift+arrows move on the ground plane, shift+page keys move up and down. Step in scene units. */
export function nudgeFor(key:string,step=0.1):{x?:number;y?:number;z?:number}|null{
 switch(key){case 'ArrowLeft':return{x:-step};case 'ArrowRight':return{x:step};case 'ArrowUp':return{z:-step};case 'ArrowDown':return{z:step};case 'PageUp':return{y:step};case 'PageDown':return{y:-step};default:return null;}
}

/** Snapping for the transform gizmo. Steps are in scene units, degrees, and scale factor. */
export interface NamedView{name:string;position:[number,number,number];quaternion:[number,number,number,number];target:[number,number,number];}
export type SnapMode='grid'|'vertex'|'surface';
export interface SnapSettings{on:boolean;move:number;rotate:number;scale:number;/** Translate drags snap to grid increments, to the nearest vertex, or onto the surface of other meshes. */mode:SnapMode}
export const defaultSnap=():SnapSettings=>({on:false,move:0.25,rotate:15,scale:0.1,mode:'grid'});
export class SnapError extends Error{constructor(message:string){super(message);this.name='SnapError';}}
export function mergeSnap(current:SnapSettings,patch:Partial<SnapSettings>):SnapSettings{
 const next={...current};
 if(patch.on!==undefined){if(typeof patch.on!=='boolean')throw new SnapError('on must be true or false.');next.on=patch.on;}
 const num=(k:'move'|'rotate'|'scale',min:number,max:number)=>{const v=patch[k];if(v===undefined)return;
  if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw new SnapError(`${k} must be a number between ${min} and ${max}.`);next[k]=v;};
 num('move',0.001,100);num('rotate',1,180);num('scale',0.001,10);
 if(patch.mode!==undefined){if(patch.mode!=='grid'&&patch.mode!=='vertex'&&patch.mode!=='surface')throw new SnapError("mode must be 'grid', 'vertex' or 'surface'.");next.mode=patch.mode;}
 return next;
}
/** Rounds to the nearest multiple of step. Used by keyboard nudges and numeric snapping. */
export const snapTo=(value:number,step:number)=>step>0?Math.round(value/step)*step:value;
/** STL files carry no unit. Slicers and CAD use millimetres, scenes here use metres: a part larger than 10 units is most likely millimetres. */
export function stlUnitHint(size:readonly [number,number,number]):{unit:'mm';factor:number}|null{
 const m=Math.max(size[0],size[1],size[2]);
 return Number.isFinite(m)&&m>=10&&m<=100000?{unit:'mm',factor:0.001}:null;
}
export const MAX_MTL_BYTES=2*1024*1024;
export const MAX_TEXTURE_BYTES=64*1024*1024;
export const MAX_TEXTURE_FILES=64;
export const TEXTURE_EXTENSIONS=['png','jpg','jpeg','webp'] as const;
const clean=(s:string)=>s.trim().replace(/\\/g,'/').split('/').pop()!;
/** Material libraries named by an OBJ (mtllib lines). Base names only, no paths. */
export function mtlReferences(obj:string):string[]{
 const out=new Set<string>();
 for(const m of obj.matchAll(/^mtllib[ \t]+(.+)$/gm)){const n=clean(m[1]);if(n)out.add(n);}
 return [...out];
}
/** Texture files named by an MTL (map_*, bump, disp, decal lines), options stripped, base names only. data: and URL schemes are never listed. */
export function mtlTextures(mtl:string):string[]{
 const out=new Set<string>();
 for(const m of mtl.matchAll(/^[ \t]*(?:map_[A-Za-z]+|bump|disp|decal|refl)[ \t]+(.+)$/gm)){
  const toks=m[1].trim().split(/[ \t]+/);let name=toks[toks.length-1];
  // Options such as -bm 1.0 come first and the file name is last; names with spaces are rare and unsupported.
  if(/^[a-z][a-z0-9+.-]*:/i.test(name)&&!/^[a-z]:[\\/]/i.test(name))continue;
  name=clean(name);if(name)out.add(name);
 }
 return [...out];
}
/** Output size for a camera render: whole pixels, within the GPU limit, keeping the aspect ratio when scaling down. */
export function clampRenderSize(width:number,height:number,max:number):{width:number;height:number}{
 if(![width,height,max].every(n=>Number.isFinite(n))||width<1||height<1||max<1)throw new SnapError('Render size must be positive numbers.');
 let w=Math.round(width),h=Math.round(height);
 const k=Math.min(1,max/Math.max(w,h));
 w=Math.max(1,Math.floor(w*k));h=Math.max(1,Math.floor(h*k));return{width:w,height:h};
}

/** Export units. The scene is in metres; STL and OBJ carry no unit, so the chosen one only scales the numbers written. */
export const UNITS={m:1,cm:100,mm:1000,in:39.37007874015748} as const;
export type ExportUnit=keyof typeof UNITS;
export const UNIT_IDS=Object.keys(UNITS) as ExportUnit[];
export const isUnit=(u:unknown):u is ExportUnit=>typeof u==='string'&&Object.prototype.hasOwnProperty.call(UNITS,u);
export const unitScale=(u:ExportUnit)=>UNITS[u];
export type ExportFormat='glb'|'stl'|'obj';
/** File name for an export. Units other than metres are part of the name so the file explains itself. */
export const exportFileName=(stem:string,format:ExportFormat,unit:ExportUnit)=>`${stem}${format!=='glb'&&unit!=='m'?'-'+unit:''}.${format}`;
/** Multi-select: shift-click adds or removes an object. The primary selection is the last one added. */
export function toggleSelection(marked:readonly number[],selected:number|null,id:number):{marked:number[];selected:number|null}{
 const set=marked.length?[...marked]:selected!=null?[selected]:[];
 const i=set.indexOf(id);
 if(i>=0){set.splice(i,1);return{marked:set,selected:set.length?set[set.length-1]:null};}
 set.push(id);return{marked:set,selected:id};
}
export interface Rect{x0:number;y0:number;x1:number;y1:number}
export const marqueeRect=(a:{x:number;y:number},b:{x:number;y:number}):Rect=>({x0:Math.min(a.x,b.x),y0:Math.min(a.y,b.y),x1:Math.max(a.x,b.x),y1:Math.max(a.y,b.y)});
export const inRect=(r:Rect,p:{x:number;y:number})=>p.x>=r.x0&&p.x<=r.x1&&p.y>=r.y0&&p.y<=r.y1;
export const MAX_TURNTABLE_FRAMES=360;
export const MAX_TURNTABLE_PIXELS=1_200_000_000;
/** Validates a turntable render and returns the rotation per frame in radians. */
export function turntablePlan(frames:number,width:number,height:number):{frames:number;step:number}{
 if(!Number.isInteger(frames)||frames<2||frames>MAX_TURNTABLE_FRAMES)throw new SnapError(`frames must be a whole number from 2 to ${MAX_TURNTABLE_FRAMES}.`);
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1)throw new SnapError('Render size must be positive numbers.');
 if(frames*width*height>MAX_TURNTABLE_PIXELS)throw new SnapError('This turntable is too large. Use fewer frames or a smaller size.');
 return{frames,step:(Math.PI*2)/frames};
}
export const frameName=(i:number,total:number)=>`frame-${String(i+1).padStart(Math.max(4,String(total).length),'0')}.png`;

/** glTF texture export: embedded as data URIs or written as separate files next to the .gltf. */
export const GLTF_TEXTURE_MODES=['embed','external'] as const;
export type GltfTextureMode=typeof GLTF_TEXTURE_MODES[number];
const IMAGE_EXT:Record<string,string>={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
/** File name for one extracted texture, stable by image index. */
export const gltfTextureName=(i:number,mime:string):string=>`textures/texture_${i}.${IMAGE_EXT[mime]??'png'}`;
/** Decodes a data: URI payload (base64 only, as written by GLTFExporter). Env-agnostic: atob exists in browsers and Node 16+. */
export function dataUriBytes(uri:string):Uint8Array{
 const m=/^data:([^;,]+);base64,(.*)$/s.exec(uri);if(!m)throw new ModelError('A texture is not a base64 data URI.');
 const bin=atob(m[2]);const out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);
 return out;
}
/** Pulls embedded data-URI textures out of an exported glTF JSON and returns them as named files; the JSON is rewritten to reference the files. Non-data URIs are left untouched. */
export function extractGltfTextures(json:{images?:{uri?:string;mimeType?:string}[]}):{files:Map<string,Uint8Array>;count:number}{
 const files=new Map<string,Uint8Array>();
 for(let i=0;i<(json.images?.length??0);i++){
  const img=json.images![i];if(!img.uri||!img.uri.startsWith('data:'))continue;
  const name=gltfTextureName(i,img.mimeType??'image/png');
  files.set(name,dataUriBytes(img.uri));img.uri=name;
 }
 return{files,count:files.size};
}
/** Validates a clip-name selection against the clips in the scene. null or undefined means all clips. */
export function pickClips(all:readonly string[],want?:readonly string[]|null):string[]{
 if(want==null)return [...all];
 const have=new Set(all);
 for(const w of want)if(!have.has(w))throw new ModelError(`There is no animation clip named "${w}". The scene has: ${all.join(', ')||'none'}.`);
 return [...want];
}
