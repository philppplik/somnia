import {readPin,pinText} from './pins';
import {PRIMITIVE_KINDS,PrimitiveError,defaultParams,patchParams,readPrimitive,resolveMaterial,MATERIAL_PRESETS,type PrimitiveKind,type PrimitiveData,type PrimitiveParams,type MaterialRequest} from './primitives';
import * as THREE from 'three';
import {Brush,Evaluator,ADDITION,SUBTRACTION,INTERSECTION} from 'three-bvh-csg';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {SimplifyModifier} from 'three/examples/jsm/modifiers/SimplifyModifier.js';
import {clone as skeletonClone} from 'three/examples/jsm/utils/SkeletonUtils.js';
import {checkPbr,alphaState,alphaModeOf,MaterialError,SLOT_CONFIG,TEXTURE_SLOTS,type PbrExtras,type AlphaMode,type TextureSlot} from './materials';
import type {NodeExtra} from './document';
import {EASES,isEase,bakeTrack,type Ease} from './ease';
import {buildExtras,type ClipMeta,type MetaTrack} from './clipMeta';
import {groupRefs,keyIndices,copyTrackKeys,shiftTrackKeys,pasteTrackKeys,type KeyRef,type KeyData,type TrackData} from './keyEdit';
import {extrudeFaces,insetFaces,bevelVertices,deleteElements,weldSelected,subdivideFaces,pokeFaces,duplicateFaces,loopCut,bevelEdges,slideEdges,mirrorCombine,symmetrizeMesh,subdivideLoop,cleanupMesh,flipMesh,outsideMesh,smoothMesh,separateMesh,solidifyMesh,fillHolesMesh,relaxMesh,fattenMesh,bisectMesh,twistMesh,taperMesh,spinMesh,bridgeMesh,remeshMesh,EditError,MAX_EDIT_VERTICES,MAX_EDIT_TRIANGLES,type MeshData,type CleanupResult,type NormalsOp} from './editMesh';
import {sculptDab,paintMask,SculptError,type SculptOpts} from './sculpt';
import {KEY_PATHS,KEY_STRIDE,ClipError,MAX_CLIPS,MAX_KEYS_PER_TRACK,DEFAULT_CLIP_SECONDS,insertKey,removeKey as removeKeyData,findKey,isPlainTrack,trackName,parseTrackName,checkKeyTime,checkDuration,checkClipName,lastKeyTime,type KeyPath} from './clips';
import {mergeTransform,DEFAULT_TRANSFORM,UvError,type TextureTransform} from './uv';
import {uvIslands,unwrapBox,unfoldAngles,planarProject,seamsAround,remapSeams,type UvResult,type UvLayoutOpts} from './uvUnwrap';
import {textureBytes} from './validate';
import {smoothWeights,rigidWeights,paintWeights,SkinError,type BoneSegment,type SkinWeights,type BrushSettings} from './skinning';
import {checkPoseName,mirrorPose,blendPoses,PoseError,MAX_POSES} from './poses';import type {Pose,PoseBone} from './poses';
import {solveTwoBone,clampEuler,checkLimits,hasLimits,IkError,MAX_IK_CHAINS,fabrikSolve,aimBasis,MIN_FABRIK_SEGMENTS,MAX_FABRIK_SEGMENTS} from './ik';import type {AxisLimits} from './ik';
import {RetargetError,mapBoneNames,retargetClipName,MAX_RETARGET_SAMPLES} from './retarget';
import {emptyStats,boundsValid,boundsCenter,boundsRadius,unitScale,type ModelStats,type OutlineEntry,type Bounds,type ExportUnit} from './model';
/**
 * Scene operations for the 3D studio (P1 staging). Pure three.js core, no renderer and no DOM, so the logic runs under tsx --test.
 * Every user-visible change is one undo entry. Objects are addressed by Object3D.id.
 * Imported only by the lazy viewport chunk.
 */
export type {PrimitiveKind}from './primitives';
export type LightKind='directional'|'point'|'spot'|'area'|'ambient';
/** One-click light rig presets. */
export type LightRigPreset='three-point'|'studio'|'sunset'|'outdoor';
export const PRIMITIVES:readonly PrimitiveKind[]=PRIMITIVE_KINDS;
export const LIGHTS:readonly LightKind[]=['directional','point','spot','area','ambient'];
export interface Vec3{x:number;y:number;z:number}
export interface TransformPatch{position?:Partial<Vec3>;/** degrees */rotation?:Partial<Vec3>;scale?:Partial<Vec3>}
export interface MaterialPatch extends MaterialRequest,PbrExtras{}
export const MAX_MERGE_VERTICES=3_000_000;
export type MirrorAxis='x'|'y'|'z';
export type CameraKind='perspective'|'orthographic';
/** One material instance and the meshes that share it, for the material list. */
export interface MaterialUsage{/** Stable per material instance. */key:string;name:string;/** '#rrggbb' display colour. */color:string;count:number;ids:number[]}
export interface ObjectInfo{
 camera:{kind:'perspective';fov:number}|{kind:'orthographic';zoom:number}|null;
 /** Label text when the object is an annotation pin, else null. */pin?:string|null;
 /** Kind and parameters when the mesh is an editable primitive. */primitive?:PrimitiveData|null;
 id:number;name:string;kind:OutlineEntry['kind'];position:Vec3;rotation:Vec3;scale:Vec3;
 /** True for a skinned mesh (bound to a skeleton). */skinned:boolean;
 /** Non-destructive mirror modifier state, if on. */mirror:{axis:'x'|'y'|'z';merge:number;bisect?:boolean}|null;
 /** UV state of a mesh: whether a uv attribute exists, the island count (0 when unreadable) and the marked seam count; null for non-meshes. */uv:{hasUv:boolean;islands:number;seams:number}|null;
 material:{color:string;metalness:number;roughness:number;emissive?:string;emissiveIntensity?:number;opacity?:number;alphaMode?:AlphaMode;alphaCutoff?:number;doubleSided?:boolean;/** Name of the image in each slot, or null */textures?:Record<TextureSlot,string|null>;/** UV transform per slot, null where the slot is empty */transforms?:Record<TextureSlot,TextureTransform|null>}|null;light:LightInfo|null;
}
export interface LightInfo{intensity:number;color:string;/** shadow casting; absent for area lights, which cannot cast shadows */shadow?:boolean;/** shadow softness (light.shadow.radius); present on shadow-capable lights */radius?:number;/** spot cone, degrees */angle?:number;penumbra?:number;width?:number;height?:number}
export interface LightPatch{intensity?:number;color?:string;shadow?:boolean;/** shadow softness, 0 to 50 */radius?:number;angle?:number;penumbra?:number;width?:number;height?:number}
export type AlignAxis='x'|'y'|'z';
export type AlignTo='min'|'center'|'max';
export type PivotAt='center'|'base';
export const GROUP_MS=1000;
export interface TransformSnapshot{id:number;p:THREE.Vector3;r:THREE.Euler;s:THREE.Vector3}
export interface GroupDragMember{o:THREE.Object3D;world0:THREE.Matrix4}
/** Captures the world matrices of the dragged objects at the start of a group drag. */
export function beginGroupDrag(objs:THREE.Object3D[]):GroupDragMember[]{return objs.map(o=>{o.updateWorldMatrix(true,false);return{o,world0:o.matrixWorld.clone()};});}
/** Applies the movement of a group pivot (from `pivot0` to `pivotNow`, both world matrices) to every member. Translation, rotation and scale all act about the pivot. */
export function applyGroupDrag(members:GroupDragMember[],pivot0:THREE.Matrix4,pivotNow:THREE.Matrix4){
 const delta=pivotNow.clone().multiply(pivot0.clone().invert());
 for(const m of members){
  const world=delta.clone().multiply(m.world0);
  m.o.parent?.updateWorldMatrix(true,false);
  const local=(m.o.parent?m.o.parent.matrixWorld.clone().invert():new THREE.Matrix4()).multiply(world);
  local.decompose(m.o.position,m.o.quaternion,m.o.scale);m.o.updateMatrix();
 }
}
/** Depth-first (pre-order) list of every node below root. The index in this list addresses a node in a saved document. */
export function nodesOf(root:THREE.Object3D):THREE.Object3D[]{const out:THREE.Object3D[]=[];const walk=(o:THREE.Object3D)=>{for(const c of o.children){out.push(c);walk(c);}};walk(root);return out;}
/** Data glTF cannot hold: shadow flags, area lights and ambient lights (glTF punctual lights have neither). */
export function collectNodeExtras(root:THREE.Object3D):NodeExtra[]{
 const out:NodeExtra[]=[];
 nodesOf(root).forEach((o,i)=>{
  let e:NodeExtra|null=null;
  const l=o as THREE.Light;const ra=o as THREE.RectAreaLight,am=o as THREE.AmbientLight;
  if(ra.isRectAreaLight){
   e={i,area:{position:o.position.toArray() as [number,number,number],quaternion:o.quaternion.toArray().slice(0,4) as [number,number,number,number],scale:o.scale.toArray() as [number,number,number],color:'#'+ra.color.getHexString(),intensity:ra.intensity,width:ra.width,height:ra.height,name:o.name}};
  }else if(am.isAmbientLight){
   e={i,ambient:{color:'#'+am.color.getHexString(),intensity:am.intensity,name:o.name}};
  }else if(l.isLight&&l.castShadow)e={i,shadow:true,radius:(l as THREE.DirectionalLight).shadow?.radius??1};
  if(!o.visible){e=e??{i};e.hidden=true;}
  if(o.userData.somniaLocked===true){e=e??{i};e.locked=true;}
  if(e)out.push(e);
 });
 return out;
}
/** Re-applies extras to a freshly loaded tree. Area and ambient lights replace the empty node the exporter wrote. Entries that no longer fit are skipped and counted. */
export function applyNodeExtras(root:THREE.Object3D,extras:readonly NodeExtra[]):{skipped:number}{
 const nodes=nodesOf(root);let skipped=0;
 for(const e of extras){
  const o=nodes[e.i];if(!o){skipped++;continue;}
  let target=o;
  if(e.ambient){
   if(!o.parent||o.children.length>0||(o as THREE.Mesh).isMesh||(o as THREE.Light).isLight){skipped++;continue;}
   const a=e.ambient;const light=new THREE.AmbientLight(new THREE.Color(a.color),a.intensity);
   light.name=a.name||o.name;
   const parent=o.parent;const at=parent.children.indexOf(o);parent.remove(o);parent.add(light);parent.children.splice(parent.children.indexOf(light),1);parent.children.splice(at,0,light);
   target=light;
  }else if(e.area){
   if(!o.parent||o.children.length>0||(o as THREE.Mesh).isMesh||(o as THREE.Light).isLight){skipped++;continue;}
   const a=e.area;const light=new THREE.RectAreaLight(new THREE.Color(a.color),a.intensity,a.width,a.height);
   light.name=a.name||o.name;light.position.fromArray(a.position);light.quaternion.fromArray(a.quaternion);light.scale.fromArray(a.scale);
   const parent=o.parent;const at=parent.children.indexOf(o);parent.remove(o);parent.add(light);parent.children.splice(parent.children.indexOf(light),1);parent.children.splice(at,0,light);
   target=light;
  }else if(e.shadow){const l=o as THREE.Light;if(l.isLight&&!(l as THREE.RectAreaLight).isRectAreaLight){l.castShadow=true;if(e.radius!==undefined)(l as THREE.DirectionalLight).shadow.radius=e.radius;}else skipped++;}
  if(e.hidden)target.visible=false;
  if(e.locked)target.userData.somniaLocked=true;
 }
 return{skipped};
}
interface ClipState{tracks:THREE.KeyframeTrack[];duration:number;ease:Record<string,Ease[]>}
const readTransform=(t:THREE.Texture):TextureTransform=>({offsetX:t.offset.x,offsetY:t.offset.y,scaleX:t.repeat.x,scaleY:t.repeat.y,rotation:t.rotation/DEG});
const writeTransform=(t:THREE.Texture,v:TextureTransform)=>{t.offset.set(v.offsetX,v.offsetY);t.repeat.set(v.scaleX,v.scaleY);t.rotation=v.rotation*DEG;t.center.set(0,0);t.matrixAutoUpdate=true;t.updateMatrix();};
/** Procedural wood grain as a data texture: vertical rings with a slow wobble. Deterministic, no image file, so it also runs in node tests. */
export function woodTexture(size=256):THREE.DataTexture{
 const data=new Uint8Array(size*size*4);
 const dark=[0x5f,0x3d,0x22],light=[0xa9,0x7a,0x4e];
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const wobble=6*Math.sin(y*0.045)+3*Math.sin(y*0.013+1.7);
  const ring=Math.sin((x+wobble)*0.22+2.4*Math.sin(y*0.008+x*0.004));
  const t=0.5+0.5*Math.sin(ring*2.2);
  const i=(y*size+x)*4;
  data[i]=Math.round(dark[0]+(light[0]-dark[0])*t);data[i+1]=Math.round(dark[1]+(light[1]-dark[1])*t);data[i+2]=Math.round(dark[2]+(light[2]-dark[2])*t);data[i+3]=255;
 }
 const tex=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
 tex.colorSpace=THREE.SRGBColorSpace;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.name='wood';tex.userData.somniaGenerated=true;tex.needsUpdate=true;
 return tex;
}
/** Everything copy/paste carries between meshes: the PBR fields, the texture in each slot and its mapping. */
export interface MaterialSnapshot{color:string;metalness:number;roughness:number;emissive:string;emissiveIntensity:number;opacity:number;alphaMode:AlphaMode;alphaCutoff:number;doubleSided:boolean;textures:Record<TextureSlot,THREE.Texture|null>;transforms:Record<TextureSlot,TextureTransform|null>}
const disposeGenerated=(t:THREE.Texture|null)=>{if(t?.userData.somniaGenerated)t.dispose();};
/** Builds a throwaway subtree with clones of the chosen objects (including their sub-hierarchies), placed at the scene root with their world transforms. Selection-only export uses this; geometry and materials stay shared with the scene, so nothing here is disposed. */
export function exportClone(root:THREE.Object3D,ids:number[]):THREE.Group{
 const picked:THREE.Object3D[]=[];
 for(const id of ids){const o=root.getObjectById(id);if(o&&o!==root)picked.push(o);}
 const inSet=new Set(picked);
 const top=picked.filter(o=>{for(let p=o.parent;p;p=p.parent)if(inSet.has(p))return false;return true;});
 if(!top.length)throw new StageError('Select an object to export first.');
 const g=new THREE.Group();g.name='Selection';
 root.updateMatrixWorld(true);const inv=root.matrixWorld.clone().invert();
 for(const o of top){const c=skeletonClone(o);inv.clone().multiply(o.matrixWorld).decompose(c.position,c.quaternion,c.scale);g.add(c);}
 return g;
}
/** Scales and reorients a freshly imported mesh scene (OBJ, STL, PLY) for the chosen file units and up axis. UNITS is the metres-to-file factor used on export, so import multiplies by its inverse. glTF always carries metres and Y-up and is never passed here. */
export function applyImportOptions(scene:THREE.Object3D,opts:{unit:ExportUnit;upAxis:'y'|'z'}){
 const f=1/unitScale(opts.unit);if(f!==1)scene.scale.multiplyScalar(f);
 if(opts.upAxis==='z')scene.rotation.x=-Math.PI/2;
 scene.updateMatrixWorld(true);
}
export class StageError extends Error{constructor(message:string){super(message);this.name='StageError';}}
const clamp01=(n:number)=>Math.min(1,Math.max(0,n));
const finite=(n:unknown,what:string):number=>{if(typeof n!=='number'||!Number.isFinite(n))throw new StageError(`${what} must be a finite number.`);return n;};
const DEG=Math.PI/180;
const HEX=/^#[0-9a-fA-F]{6}$/;
function geometryFor(kind:PrimitiveKind,p:PrimitiveParams):THREE.BufferGeometry{
 switch(kind){
  case 'cube':return new THREE.BoxGeometry(p.width,p.height,p.depth,p.segments,p.segments,p.segments);
  case 'sphere':return new THREE.SphereGeometry(p.radius,p.widthSegments,p.heightSegments);
  case 'plane':return new THREE.PlaneGeometry(p.width,p.depth,p.segments,p.segments).rotateX(-Math.PI/2);
  case 'cylinder':return new THREE.CylinderGeometry(p.radius,p.radius,p.height,p.radialSegments);
  case 'cone':return new THREE.ConeGeometry(p.radius,p.height,p.radialSegments);
  case 'torus':return new THREE.TorusGeometry(p.radius,p.tube,p.radialSegments,p.tubularSegments);
 }
}
function lightInfo(l:THREE.Light):LightInfo{
 const info:LightInfo={intensity:l.intensity,color:'#'+l.color.getHexString()};
 const sp=l as THREE.SpotLight,ra=l as THREE.RectAreaLight;
 if(l.castShadow!==undefined&&!(l as THREE.RectAreaLight).isRectAreaLight&&!(l as THREE.AmbientLight).isAmbientLight){info.shadow=l.castShadow;info.radius=(l as THREE.DirectionalLight).shadow?.radius??1;}
 if(sp.isSpotLight){info.angle=sp.angle/DEG;info.penumbra=sp.penumbra;}
 if(ra.isRectAreaLight){info.width=ra.width;info.height=ra.height;}
 return info;
}
/** Reverses the triangle order of a geometry whose transform mirrored it, so faces keep pointing outward. */
function flipWinding(g:THREE.BufferGeometry){
 const idx=g.index;
 if(idx){const a=idx.array as Uint32Array|Uint16Array;for(let i=0;i+2<a.length;i+=3){const t=a[i+1];a[i+1]=a[i+2];a[i+2]=t;}idx.needsUpdate=true;return;}
 for(const attr of Object.values(g.attributes)){const a=attr as THREE.BufferAttribute;const n=a.itemSize;const arr=a.array as unknown as {[i:number]:number};
  for(let v=0;v+2<a.count;v+=3)for(let k=0;k<n;k++){const i1=(v+1)*n+k,i2=(v+2)*n+k;const t=arr[i1];arr[i1]=arr[i2];arr[i2]=t;}a.needsUpdate=true;}
}
const label=(s:string)=>s.charAt(0).toUpperCase()+s.slice(1);
function disposeObject(root:THREE.Object3D){
 root.traverse(o=>{
  const m=o as THREE.Mesh;m.geometry?.dispose?.();
  for(const mat of Array.isArray(m.material)?m.material:m.material?[m.material]:[]){for(const v of Object.values(mat as unknown as Record<string,unknown>))if(v instanceof THREE.Texture)v.dispose();mat.dispose();}
 });
}
/** Undo/redo history label as an i18n key plus interpolation params; the UI translates at display time so the history list follows the locale. */
export interface HistoryLabel{key:string;params?:Record<string,string|number>}
interface Entry{label:HistoryLabel;undo():void;redo():void;/** Edits with the same group id and object within GROUP_MS merge into one undo step (gizmo drags, key nudges). */group?:string;at?:number;merge?(redo:()=>void):void;/** Called when the entry falls off the history; frees objects only the redo side still owned. */release?():void}
type TrackWithInterpolant=THREE.KeyframeTrack&{createInterpolant(result?:number[]):{evaluate(t:number):ArrayLike<number>}};
const trackInterpolant=(tr:THREE.KeyframeTrack)=>(tr as TrackWithInterpolant).createInterpolant();
export class Stage{
 readonly root=new THREE.Group();
 private entries:Entry[]=[];private cursor=0;private saved=0;private listeners=new Set<()=>void>();private revision=0;
 /** Pose libraries, keyed by the id of the rig's root bone. */private poseLibs=new Map<number,Pose[]>();
 /** IK chains keyed by the chain's root bone id. */private ikChains=new Map<number,{on:boolean;target:THREE.Vector3;pole:THREE.Vector3}>();
 /** FABRIK chains (3+ segments) keyed by the chain's root bone id. */private fabrikChains=new Map<number,{on:boolean;target:THREE.Vector3;look:{on:boolean;target:THREE.Vector3}}>();
 /** Joint limits keyed by bone uuid (uuid survives reloads; Object3D.id does not). */private boneLimits=new Map<string,AxisLimits>();
 constructor(){this.root.name='model';}
 onChange(l:()=>void){this.listeners.add(l);return()=>{this.listeners.delete(l);};}
 private emit(){this.revision++;this.listeners.forEach(l=>l());}
 /** Number of history entries applied. Equal to the saved mark means clean. */
 get dirty(){return this.cursor!==this.saved;}
 markSaved(){this.saved=this.cursor;this.emit();}
 get canUndo(){return this.cursor>0;}
 get canRedo(){return this.cursor<this.entries.length;}
 get undoLabel():HistoryLabel|null{return this.canUndo?this.entries[this.cursor-1].label:null;}
 /** Read-only history labels for the history list: undo newest first (top row undoes one step), redo next-up first. */
 historyLabels():{undo:HistoryLabel[];redo:HistoryLabel[]}{
  return {undo:this.entries.slice(0,this.cursor).map(e=>e.label).reverse(),redo:this.entries.slice(this.cursor).map(e=>e.label)};
 }
 private push(e:Entry){
  // The saved state may live on the redo side that this entry discards: then no state is clean any more.
  if(this.saved>this.cursor)this.saved=-1;
  for(const dropped of this.entries.splice(this.cursor))dropped.release?.();
  this.entries.push(e);this.cursor=this.entries.length;this.emit();
 }
 undo(){if(!this.canUndo)return false;this.entries[--this.cursor].undo();this.emit();return true;}
 redo(){if(!this.canRedo)return false;this.entries[this.cursor++].redo();this.emit();return true;}
 /** Scene content a file open replaces: children, clips and the rig helper maps. */
 private sceneState(){return {children:[...this.root.children],clips:this.clipList,poses:this.poseLibs,ik:this.ikChains,fabrik:this.fabrikChains,limits:this.boneLimits,baked:this.bakedCache};}
 private swapState(s:ReturnType<Stage['sceneState']>){
  for(const c of [...this.root.children])this.root.remove(c);
  this.clipList=s.clips;this.poseLibs=s.poses;this.ikChains=s.ik;this.fabrikChains=s.fabrik;this.boneLimits=s.limits;this.bakedCache=s.baked;
  for(const c of s.children)this.root.add(c);
  this.clipRevision++;
 }
 /** Replaces the content with a freshly loaded model as ONE undo step: undo brings the previous scene back exactly, and the content nobody shows any more is disposed when the entry falls off the history. The scene is clean right after the load. The optional hook (clip import) runs while the new scene is active and joins the same step. */
 loadUndoable(nodes:THREE.Object3D[],label:HistoryLabel,after?:()=>void|Promise<void>):void|Promise<void>{
  const before=this.sceneState();
  for(const c of [...this.root.children])this.root.remove(c);
  this.bakedCache=new Map();this.clipList=[];this.poseLibs=new Map();this.ikChains=new Map();this.fabrikChains=new Map();this.boneLimits=new Map();this.clipRevision++;
  for(const n of nodes)this.root.add(n);
  const done=()=>{
   const next=this.sceneState();let live:'before'|'next'='next';
   this.push({label,undo:()=>{this.swapState(before);live='before';},redo:()=>{this.swapState(next);live='next';},
    release:()=>{for(const c of (live==='next'?before:next).children)disposeObject(c);}});
   this.saved=this.cursor;this.emit();
  };
  const r=after?.();
  if(r instanceof Promise)return r.then(done);
  done();
 }
 /** Replaces the content with a freshly loaded model as one undo step. The scene is clean right after the load. */
 load(model:THREE.Object3D|null,after?:()=>void|Promise<void>):void|Promise<void>{return this.loadUndoable(model?[model]:[],{key:'studio3d.hist.open',params:{name:model?.name||'model'}},after);}
 clear(){
  this.bakedCache.clear();this.clipList=[];this.clipRevision++;this.poseLibs.clear();this.ikChains.clear();this.fabrikChains.clear();this.boneLimits.clear();
  for(const c of [...this.root.children]){this.root.remove(c);disposeObject(c);}
  for(const e of this.entries)e.release?.();this.entries=[];this.cursor=0;this.saved=0;this.emit();
 }
 /** Replaces the content with several loaded top-level nodes (no wrapper group) as one undo step. The scene is clean right after the load. */
 loadMany(nodes:THREE.Object3D[],after?:()=>void|Promise<void>):void|Promise<void>{return this.loadUndoable(nodes,{key:'studio3d.hist.openScene'},after);}
 find(id:number):THREE.Object3D|undefined{return this.root.getObjectById(id);}
 private need(id:number):THREE.Object3D{const o=this.find(id);if(!o)throw new StageError(`No object with id ${id}.`);return o;}
 private uniqueName(base:string){
  const names=new Set<string>();this.root.traverse(o=>names.add(o.name));
  if(!names.has(base))return base;let i=2;while(names.has(`${base} ${i}`))i++;return `${base} ${i}`;
 }
 private attach(obj:THREE.Object3D,parent:THREE.Object3D,index:number,text:HistoryLabel){
  this.attach0(obj,parent,index);let owned=true;
  this.push({label:text,undo:()=>{parent.remove(obj);owned=false;},redo:()=>{this.attach0(obj,parent,index);owned=true;},release:()=>{if(!owned)disposeObject(obj);}});
 }
 private attach0(obj:THREE.Object3D,parent:THREE.Object3D,at:number){parent.add(obj);const i=parent.children.indexOf(obj);if(i!==at&&at<parent.children.length){parent.children.splice(i,1);parent.children.splice(at,0,obj);}}
 addPrimitive(kind:PrimitiveKind,at?:{x:number;z:number}):THREE.Mesh{
  if(!PRIMITIVES.includes(kind))throw new StageError(`Unknown primitive: ${String(kind)}.`);
  const params=defaultParams(kind);
  const mesh=new THREE.Mesh(geometryFor(kind,params),new THREE.MeshStandardMaterial({color:0xb8bcc8,metalness:0,roughness:0.6}));
  mesh.name=this.uniqueName(label(kind));mesh.userData.somniaPrimitive={kind,params};
  if(kind!=='plane')mesh.position.y=kind==='cube'||kind==='cylinder'||kind==='cone'?0.5:kind==='sphere'?0.5:0.68;
  if(at&&Number.isFinite(at.x)&&Number.isFinite(at.z)){mesh.position.x=at.x;mesh.position.z=at.z;}
  this.attach(mesh,this.root,this.root.children.length,{key:'studio3d.hist.add',params:{name:mesh.name}});return mesh;
 }
 /** Adds an annotation pin marker. The label lives in the node's userData and travels with the scene. One undo step. */
 addPin(at?:Vec3):THREE.Mesh{
  const b=this.measure().bounds;const r=b&&boundsValid(b)?boundsRadius(b):1;
  const size=Math.min(0.5,Math.max(0.03,r*0.05));
  const mesh=new THREE.Mesh(new THREE.OctahedronGeometry(size,0),new THREE.MeshStandardMaterial({color:0xe8a33d,emissive:0x3a2708,roughness:0.4,metalness:0}));
  mesh.name=this.uniqueName('Pin');mesh.userData.somniaPin={text:''};
  if(at&&[at.x,at.y,at.z].every(Number.isFinite))mesh.position.set(at.x,at.y,at.z);
  else{const c=b&&boundsValid(b)?boundsCenter(b):[0,1,0] as [number,number,number];mesh.position.set(c[0],c[1]+r*0.5,c[2]);}
  this.attach(mesh,this.root,this.root.children.length,{key:'studio3d.hist.add',params:{name:mesh.name}});return mesh;
 }
 /** Sets the label of an annotation pin. One undo step. */
 setPinText(id:number,text:string){
  const o=this.need(id);
  const before=readPin(o.userData);if(before===null)throw new StageError('That object is not a pin.');
  const next=pinText(text);if(next===before)return;
  const apply=(v:string)=>{o.userData.somniaPin={text:v};};
  apply(next);this.push({label:{key:'studio3d.hist.editPin',params:{name:o.name||'pin'}},undo:()=>apply(before),redo:()=>apply(next)});
 }
 /** Pins with a non-empty label plus their world position, for viewport overlay labels. Hidden pins are skipped. */
 pins():{id:number;text:string;position:Vec3}[]{
  const out:{id:number;text:string;position:Vec3}[]=[];const v=new THREE.Vector3();
  this.root.traverse(o=>{if(!o.visible)return;const text=readPin(o.userData);if(text===null||text==='')return;o.getWorldPosition(v);out.push({id:o.id,text,position:{x:v.x,y:v.y,z:v.z}});});
  return out;
 }
 /** Assigns a material already used in the scene to a single-material mesh. One undo step. */
 assignMaterial(id:number,key:string){
  const o=this.need(id) as THREE.Mesh;
  if(!o.isMesh)throw new StageError('Materials can only be assigned to meshes.');
  if(Array.isArray(o.material))throw new StageError('That mesh uses several materials: edit the slots instead.');
  let mat:THREE.Material|null=null;
  this.root.traverse(x=>{const m=x as THREE.Mesh;if(!m.isMesh||mat)return;for(const cand of Array.isArray(m.material)?m.material:[m.material])if(cand&&cand.uuid===key)mat=cand;});
  if(!mat)throw new StageError('That material is no longer in the scene.');
  const next=mat as THREE.Material;if(o.material===next)return;
  const before=o.material;const apply=(m:THREE.Material)=>{o.material=m;};
  apply(next);this.push({label:{key:'studio3d.hist.assignMaterial',params:{mat:next.name||'material',mesh:o.name||'mesh'}},undo:()=>apply(before),redo:()=>apply(next)});
 }
 addLight(kind:LightKind):THREE.Light{
  if(!LIGHTS.includes(kind))throw new StageError(`Unknown light: ${String(kind)}.`);
  const light:THREE.Light=kind==='directional'?new THREE.DirectionalLight(0xffffff,2):kind==='point'?new THREE.PointLight(0xffffff,40,0,2)
   :kind==='spot'?new THREE.SpotLight(0xffffff,120,0,Math.PI/6,0.3,2):kind==='ambient'?new THREE.AmbientLight(0xffffff,0.6):new THREE.RectAreaLight(0xffffff,6,2,2);
  light.name=this.uniqueName({directional:'Directional light',point:'Point light',spot:'Spot light',area:'Area light',ambient:'Ambient light'}[kind]);light.position.set(3,4,2);
  if(kind==='area')light.lookAt(0,0,0);
  this.attach(light,this.root,this.root.children.length,{key:'studio3d.hist.add',params:{name:light.name}});return light;
 }
 /** Adds a one-click light rig aimed at the scene bounds centre. One undo step. */
 addLightRig(preset?:'three-point'):THREE.DirectionalLight[];
 addLightRig(preset?:LightRigPreset):THREE.Light[];
 addLightRig(preset:LightRigPreset='three-point'):THREE.Light[]{
  const b=this.measure().bounds;const ok=b&&boundsValid(b);
  const c=ok?boundsCenter(b):[0,0.5,0] as [number,number,number];
  const r=ok?Math.max(boundsRadius(b),0.25):1;
  const added:THREE.Object3D[]=[];const lights:THREE.Light[]=[];
  const aim=(l:THREE.DirectionalLight)=>{l.target.name=`${l.name} target`;l.target.position.set(c[0],c[1],c[2]);this.root.add(l.target);added.push(l.target);};
  const put=<L extends THREE.Light>(l:L,pos:[number,number,number]):L=>{l.position.set(...pos);this.root.add(l);added.push(l);lights.push(l);return l;};
  let label:HistoryLabel={key:'studio3d.hist.lightRigThree'};
  if(preset==='studio'){
   // Product-shot softboxes: a large key from the left, a gentler fill from the right and a small shadow-casting top light.
   const key=put(new THREE.RectAreaLight(0xffffff,4,5*r,4*r),[c[0]-2.5*r,c[1]+2*r,c[2]+2*r]);key.name=this.uniqueName('Studio key');
   const fill=put(new THREE.RectAreaLight(0xffffff,1.6,3*r,3*r),[c[0]+2.5*r,c[1]+1.2*r,c[2]+1.6*r]);fill.name=this.uniqueName('Studio fill');
   const top=put(new THREE.DirectionalLight(0xffffff,1.4),[c[0],c[1]+3.5*r,c[2]+0.5*r]);top.name=this.uniqueName('Studio top');top.castShadow=true;aim(top);
   key.lookAt(c[0],c[1],c[2]);fill.lookAt(c[0],c[1],c[2]);
   label={key:'studio3d.hist.lightRigStudio'};
  }else if(preset==='outdoor'){
   // Midday daylight: a bright, slightly warm high sun with shadows plus a cool sky bounce.
   const sun=put(new THREE.DirectionalLight(0xfff2dd,3),[c[0]+1.5*r,c[1]+4*r,c[2]+2*r]);sun.name=this.uniqueName('Outdoor sun');sun.castShadow=true;aim(sun);
   put(new THREE.AmbientLight(0x9db8d9,0.9),[0,0,0]).name=this.uniqueName('Outdoor sky');
   label={key:'studio3d.hist.lightRigOutdoor'};
  }else if(preset==='sunset'){
   // Low warm sun with long shadows plus a cool sky bounce.
   const sun=put(new THREE.DirectionalLight(0xffb36b,2.5),[c[0]+3*r,c[1]+0.7*r,c[2]-1.5*r]);sun.name=this.uniqueName('Sunset sun');sun.castShadow=true;aim(sun);
   put(new THREE.AmbientLight(0x5a6b8c,0.6),[0,0,0]).name=this.uniqueName('Sunset sky');
   label={key:'studio3d.hist.lightRigSunset'};
  }else{
   const defs:{name:string;i:number;off:[number,number,number];shadow:boolean}[]=[
    {name:'Key light',i:3,off:[1.5,2,1.2],shadow:true},
    {name:'Fill light',i:1.1,off:[-1.8,0.9,1.4],shadow:false},
    {name:'Rim light',i:2.4,off:[-0.4,1.8,-2],shadow:false}];
   for(const d of defs){
    const l=put(new THREE.DirectionalLight(0xffffff,d.i),[c[0]+d.off[0]*r,c[1]+d.off[1]*r,c[2]+d.off[2]*r]);
    l.name=this.uniqueName(d.name);l.castShadow=d.shadow;aim(l);
   }
  }
  let owned=true;
  this.push({label,
   undo:()=>{for(const o of added)this.root.remove(o);owned=false;},
   redo:()=>{for(const o of added)this.root.add(o);owned=true;},
   release:()=>{if(!owned)for(const l of lights)disposeObject(l);}});
  return lights;
 }
 addCamera(pose?:{position:Vec3;quaternion:[number,number,number,number]},fov=40,kind:CameraKind='perspective'):THREE.PerspectiveCamera|THREE.OrthographicCamera{
  const f=finite(fov,'fov');if(f<1||f>120)throw new StageError('fov must be between 1 and 120 degrees.');
  const cam:THREE.PerspectiveCamera|THREE.OrthographicCamera=kind==='orthographic'?new THREE.OrthographicCamera(-2,2,2,-2,0.1,100):new THREE.PerspectiveCamera(f,1.5,0.1,100);
  cam.name=this.uniqueName(kind==='orthographic'?'Ortho camera':'Camera');
  if(pose){cam.position.set(pose.position.x,pose.position.y,pose.position.z);cam.quaternion.set(...pose.quaternion);}else{cam.position.set(4,3,5);cam.lookAt(0,0.5,0);}
  this.attach(cam,this.root,this.root.children.length,{key:'studio3d.hist.add',params:{name:cam.name}});return cam;
 }
 setCamera(id:number,patch:{fov?:number;zoom?:number}){
  const o=this.need(id) as THREE.PerspectiveCamera|THREE.OrthographicCamera;
  if((o as THREE.PerspectiveCamera).isPerspectiveCamera){
   if(patch.fov===undefined)throw new StageError(`${o.name} is a perspective camera: set fov, not zoom.`);
   const f=finite(patch.fov,'fov');if(f<1||f>120)throw new StageError('fov must be between 1 and 120 degrees.');
   const before=(o as THREE.PerspectiveCamera).fov;if(before===f)return;const set=(v:number)=>{(o as THREE.PerspectiveCamera).fov=v;o.updateProjectionMatrix();};
   set(f);this.push({label:{key:'studio3d.hist.camera',params:{name:o.name}},undo:()=>set(before),redo:()=>set(f)});return;
  }
  if((o as THREE.OrthographicCamera).isOrthographicCamera){
   if(patch.zoom===undefined)throw new StageError(`${o.name} is an orthographic camera: set zoom, not fov.`);
   const z=finite(patch.zoom,'zoom');if(z<0.01||z>100)throw new StageError('zoom must be between 0.01 and 100.');
   const before=(o as THREE.OrthographicCamera).zoom;if(before===z)return;const set=(v:number)=>{(o as THREE.OrthographicCamera).zoom=v;o.updateProjectionMatrix();};
   set(z);this.push({label:{key:'studio3d.hist.camera',params:{name:o.name}},undo:()=>set(before),redo:()=>set(z)});return;
  }
  throw new StageError(`${o.name} is not a camera.`);
 }
 setTransform(id:number,patch:TransformPatch,opts:{group?:string;now?:number}={}){
  const o=this.need(id);const before={p:o.position.clone(),r:o.rotation.clone(),s:o.scale.clone()};
  const next={p:o.position.clone(),r:o.rotation.clone(),s:o.scale.clone()};
  const apply=(target:THREE.Vector3|THREE.Euler,p:Partial<Vec3>|undefined,k:number,what:string,min?:number)=>{
   if(!p)return;for(const axis of ['x','y','z'] as const){if(p[axis]===undefined)continue;
    const v=finite(p[axis],`${what}.${axis}`)*k;if(min!==undefined&&Math.abs(v)<min)throw new StageError(`${what}.${axis} must not be zero.`);(target as unknown as Record<string,number>)[axis]=v;}
  };
  apply(next.p,patch.position,1,'position');apply(next.r,patch.rotation,DEG,'rotation');apply(next.s,patch.scale,1,'scale',1e-6);
  if(before.p.equals(next.p)&&before.r.equals(next.r)&&before.s.equals(next.s))return;
  this.applyTransform(o,before,next,opts);
 }
 /** Records a transform that already happened (a gizmo drag changed the object live). One undo step for the whole drag. */
 commitTransform(id:number,before:{p:THREE.Vector3;r:THREE.Euler;s:THREE.Vector3}){
  const o=this.need(id);if((o as THREE.Bone).isBone)this.clampBone(o as THREE.Bone);
  const next={p:o.position.clone(),r:o.rotation.clone(),s:o.scale.clone()};
  if(before.p.equals(next.p)&&before.r.equals(next.r)&&before.s.equals(next.s))return;
  this.applyTransform(o,before,next,{},true);
 }
 private applyTransform(o:THREE.Object3D,before:{p:THREE.Vector3;r:THREE.Euler;s:THREE.Vector3},next:{p:THREE.Vector3;r:THREE.Euler;s:THREE.Vector3},opts:{group?:string;now?:number},already=false){
  const set=(s:typeof before)=>{o.position.copy(s.p);o.rotation.copy(s.r);o.scale.copy(s.s);};
  if(!already)set(next);
  const now=opts.now??Date.now();const key=opts.group?`${opts.group}:${o.id}`:undefined;
  // With auto-key on, the keys written for this change belong to the same undo step.
  const ak=this.autoKeyStates(o,before,next);if(ak){this.restoreClip(ak.clip,ak.after);}
  const last=this.entries[this.cursor-1];
  if(key&&last&&this.cursor===this.entries.length&&this.saved!==this.cursor&&last.group===key&&last.at!==undefined&&now-last.at<=GROUP_MS&&last.merge){
   last.merge(()=>{set(next);if(ak)this.restoreClip(ak.clip,ak.after);});last.at=now;this.emit();return;
  }
  let redo=()=>{set(next);if(ak)this.restoreClip(ak.clip,ak.after);};
  this.push({label:{key:'studio3d.hist.transform',params:{name:o.name}},undo:()=>{set(before);if(ak)this.restoreClip(ak.clip,ak.before);},redo:()=>redo(),group:key,at:now,merge:r=>{redo=r;}});
 }
 setLight(id:number,patch:LightPatch){
  const o=this.need(id) as THREE.Light;if(!o.isLight)throw new StageError(`${o.name} is not a light.`);
  const sp=o as THREE.SpotLight,ra=o as THREE.RectAreaLight;
  if(patch.color!==undefined&&!HEX.test(patch.color))throw new StageError('color must look like #rrggbb.');
  if(patch.shadow!==undefined){if(typeof patch.shadow!=='boolean')throw new StageError('shadow must be true or false.');if(ra.isRectAreaLight)throw new StageError('Area lights cannot cast shadows.');if((o as THREE.AmbientLight).isAmbientLight)throw new StageError('Ambient lights cannot cast shadows.');}
  if(patch.angle!==undefined&&!sp.isSpotLight)throw new StageError('Only spot lights have a cone angle.');
  if(patch.penumbra!==undefined&&!sp.isSpotLight)throw new StageError('Only spot lights have a penumbra.');
  if((patch.width!==undefined||patch.height!==undefined)&&!ra.isRectAreaLight)throw new StageError('Only area lights have a width and height.');
  if(patch.radius!==undefined&&(ra.isRectAreaLight||(o as THREE.AmbientLight).isAmbientLight))throw new StageError('Only directional, point and spot lights have shadow softness.');
  const num=(v:number|undefined,what:string,min:number,max:number)=>{if(v===undefined)return undefined;const n=finite(v,what);if(n<min||n>max)throw new StageError(`${what} must be between ${min} and ${max}.`);return n;};
  const next={i:num(patch.intensity,'intensity',0,100000),c:patch.color,sh:patch.shadow,r:num(patch.radius,'radius',0,50),a:num(patch.angle,'angle',1,90),p:num(patch.penumbra,'penumbra',0,1),w:num(patch.width,'width',0.01,1000),h:num(patch.height,'height',0.01,1000)};
  const read=()=>({i:o.intensity,c:'#'+o.color.getHexString(),sh:o.castShadow,r:(o as THREE.DirectionalLight).shadow?.radius??1,a:sp.isSpotLight?sp.angle/DEG:undefined,p:sp.isSpotLight?sp.penumbra:undefined,w:ra.isRectAreaLight?ra.width:undefined,h:ra.isRectAreaLight?ra.height:undefined});
  const before=read();
  const write=(v:ReturnType<typeof read>)=>{o.intensity=v.i;o.castShadow=v.sh;o.color.set(v.c);const sh=(o as THREE.DirectionalLight).shadow;if(sh)sh.radius=v.r;if(sp.isSpotLight){sp.angle=v.a!*DEG;sp.penumbra=v.p!;}if(ra.isRectAreaLight){ra.width=v.w!;ra.height=v.h!;}};
  const after={i:next.i??before.i,c:next.c??before.c,sh:next.sh??before.sh,r:next.r??before.r,a:next.a??before.a,p:next.p??before.p,w:next.w??before.w,h:next.h??before.h};
  if(JSON.stringify(after)===JSON.stringify(before))return;
  write(after);this.push({label:{key:'studio3d.hist.light',params:{name:o.name}},undo:()=>write(before),redo:()=>write(after)});
 }
 /**
  * Moves the origin of a mesh to the centre of its bounds or to the middle of its base, without moving what you see.
  * The geometry is cloned first, so copies that shared it are not changed.
  */
 setPivot(id:number,at:PivotAt){
  const o=this.need(id) as THREE.Mesh;if(!o.isMesh)throw new StageError(`${o.name} is not a mesh, so it has no editable pivot.`);
  if(at!=='center'&&at!=='base')throw new StageError(`Unknown pivot: ${String(at)}.`);
  const old=o.geometry;old.computeBoundingBox();const box=old.boundingBox!;
  const c=box.getCenter(new THREE.Vector3());if(at==='base')c.y=box.min.y;
  if(c.lengthSq()<1e-18)return;
  const geo=old.clone().translate(-c.x,-c.y,-c.z);
  o.updateMatrix();const shift=c.clone().multiply(o.scale).applyQuaternion(o.quaternion);
  const p0=o.position.clone(),p1=o.position.clone().add(shift);
  const set=(g:THREE.BufferGeometry,p:THREE.Vector3)=>{o.geometry=g;o.position.copy(p);};
  set(geo,p1);this.push({label:{key:'studio3d.hist.pivot',params:{name:o.name}},undo:()=>set(old,p0),redo:()=>set(geo,p1)});
 }
 private worldBox(o:THREE.Object3D){o.updateWorldMatrix(true,true);return new THREE.Box3().setFromObject(o);}
 private needMany(ids:number[],min:number){
  if(!Array.isArray(ids)||new Set(ids).size!==ids.length)throw new StageError('Choose each object only once.');
  if(ids.length<min)throw new StageError(`Select at least ${min} objects.`);
  return ids.map(id=>{const o=this.need(id);if(o===this.root)throw new StageError('The scene root cannot be moved.');return o;});
 }
 /** One undo step for moving several objects in world space. */
 private moveMany(text:HistoryLabel,moves:{o:THREE.Object3D;delta:THREE.Vector3}[]){
  const list=moves.filter(m=>m.delta.lengthSq()>1e-18).map(m=>{
   const before=m.o.position.clone();const w=m.o.getWorldPosition(new THREE.Vector3()).add(m.delta);
   const after=m.o.parent?m.o.parent.worldToLocal(w):w;return{o:m.o,before,after};});
  if(!list.length)return;
  const set=(k:'before'|'after')=>{for(const l of list)l.o.position.copy(l[k]);};
  set('after');this.push({label:text,undo:()=>set('before'),redo:()=>set('after')});
 }
 /** Aligns the world bounds of the objects to the lowest, middle or highest edge of their combined bounds along one axis. */
 align(ids:number[],axis:AlignAxis,to:AlignTo){
  if(!['x','y','z'].includes(axis))throw new StageError(`Unknown axis: ${String(axis)}.`);
  if(!['min','center','max'].includes(to))throw new StageError(`Unknown alignment: ${String(to)}.`);
  const objs=this.needMany(ids,2);const boxes=objs.map(o=>this.worldBox(o));
  if(boxes.some(b=>b.isEmpty()))throw new StageError('Only objects with geometry can be aligned.');
  const all=new THREE.Box3();boxes.forEach(b=>all.union(b));
  const target=to==='min'?all.min[axis]:to==='max'?all.max[axis]:(all.min[axis]+all.max[axis])/2;
  this.moveMany({key:'studio3d.hist.align',params:{axis:axis.toUpperCase()}},objs.map((o,i)=>{const b=boxes[i];const cur=to==='min'?b.min[axis]:to==='max'?b.max[axis]:(b.min[axis]+b.max[axis])/2;
   return{o,delta:new THREE.Vector3()[`set${axis.toUpperCase()}` as 'setX'](target-cur)};}));
 }
 /** Spreads three or more objects so the gaps between their bounds are equal. The outermost two stay where they are. */
 distribute(ids:number[],axis:AlignAxis){
  if(!['x','y','z'].includes(axis))throw new StageError(`Unknown axis: ${String(axis)}.`);
  const objs=this.needMany(ids,3);
  const items=objs.map(o=>({o,b:this.worldBox(o)}));if(items.some(i=>i.b.isEmpty()))throw new StageError('Only objects with geometry can be distributed.');
  items.sort((a,b)=>(a.b.min[axis]+a.b.max[axis])-(b.b.min[axis]+b.b.max[axis]));
  const first=items[0].b,last=items[items.length-1].b;
  const span=Math.max(last.max[axis],...items.map(i=>i.b.max[axis]))-Math.min(first.min[axis],...items.map(i=>i.b.min[axis]));
  const sizes=items.reduce((n,i)=>n+(i.b.max[axis]-i.b.min[axis]),0);
  const gap=(span-sizes)/(items.length-1);
  let cursor=Math.min(first.min[axis],...items.map(i=>i.b.min[axis]));const moves:{o:THREE.Object3D;delta:THREE.Vector3}[]=[];
  for(const i of items){const d=new THREE.Vector3();d[axis]=cursor-i.b.min[axis];moves.push({o:i.o,delta:d});cursor+=(i.b.max[axis]-i.b.min[axis])+gap;}
  this.moveMany({key:'studio3d.hist.distribute',params:{axis:axis.toUpperCase()}},moves);
 }
 /** Objects of a multi-selection without any whose ancestor is also selected. */
 private topLevel(objs:THREE.Object3D[]){const set=new Set(objs);return objs.filter(o=>{for(let p=o.parent;p;p=p.parent)if(set.has(p))return false;return true;});}
 snapshot(ids:number[]):TransformSnapshot[]{return ids.map(id=>{const o=this.need(id);return{id,p:o.position.clone(),r:o.rotation.clone(),s:o.scale.clone()};});}
 /** Records a group transform that already happened (a group gizmo drag). One undo step for all objects. */
 commitMany(before:TransformSnapshot[],text:HistoryLabel={key:'studio3d.hist.transformSelection'}){
  const list=before.map(b=>{const o=this.need(b.id);return{o,b,a:{p:o.position.clone(),r:o.rotation.clone(),s:o.scale.clone()}};})
   .filter(x=>!(x.b.p.equals(x.a.p)&&x.b.r.equals(x.a.r)&&x.b.s.equals(x.a.s)));
  if(!list.length)return;
  const set=(k:'b'|'a')=>{for(const x of list){x.o.position.copy(x[k].p);x.o.rotation.copy(x[k].r);x.o.scale.copy(x[k].s);}};
  this.push({label:text,undo:()=>set('b'),redo:()=>set('a')});
 }
 /** Moves several objects by the same world offset in one undo step. */
 translateMany(ids:number[],delta:Partial<Vec3>){
  const objs=this.topLevel(this.needMany(ids,1));const d=new THREE.Vector3(finite(delta.x??0,'x'),finite(delta.y??0,'y'),finite(delta.z??0,'z'));
  this.moveMany({key:'studio3d.hist.moveObjects',params:{count:objs.length}},objs.map(o=>({o,delta:d.clone()})));
 }
 /** Deletes several objects in one undo step. */
 removeMany(ids:number[]){
  const objs=this.topLevel(this.needMany(ids,1));
  const items=objs.map(o=>({o,parent:o.parent!,at:o.parent!.children.indexOf(o)})).sort((a,b)=>a.parent.id-b.parent.id||a.at-b.at);
  for(const i of [...items].reverse())i.parent.remove(i.o);
  let owned=false;
  this.push({label:{key:'studio3d.hist.deleteObjects',params:{count:items.length}},undo:()=>{for(const i of items)this.attach0(i.o,i.parent,i.at);owned=true;},redo:()=>{for(const i of items)i.parent.remove(i.o);owned=false;},release:()=>{if(!owned)for(const i of items)disposeObject(i.o);}});
 }
 /** Duplicates several objects in one undo step. Copies get their own materials and a small offset. */
 /** Wraps two or more objects sharing a parent in a new group placed at their combined centre. One undo step. */
 group(ids:number[]):THREE.Group{
  const objs=this.topLevel(this.needMany(ids,2));
  const parent=objs[0].parent;
  if(!parent)throw new StageError('These objects cannot be grouped.');
  if(objs.some(o=>o.parent!==parent))throw new StageError('Group objects that sit under the same parent.');
  const before=objs.map(o=>({o,at:parent.children.indexOf(o),p:o.position.clone(),q:o.quaternion.clone(),s:o.scale.clone()}));
  this.root.updateMatrixWorld(true);
  const box=new THREE.Box3();for(const o of objs)box.expandByObject(o);
  const center=box.getCenter(new THREE.Vector3());
  const g=new THREE.Group();g.name=this.uniqueName('Group');
  const gAt=Math.min(...before.map(b=>b.at));
  parent.add(g);g.position.copy(parent.worldToLocal(center.clone()));g.updateMatrixWorld(true);
  for(const o of objs)g.attach(o);
  const moveBack=()=>{for(const b of before){parent.add(b.o);b.o.position.copy(b.p);b.o.quaternion.copy(b.q);b.o.scale.copy(b.s);
   const ch=parent.children;ch.splice(ch.indexOf(b.o),1);ch.splice(Math.min(b.at,ch.length),0,b.o);}parent.remove(g);};
  const moveIn=()=>{parent.add(g);const ch=parent.children;ch.splice(ch.indexOf(g),1);ch.splice(Math.min(gAt,ch.length),0,g);
   g.updateMatrixWorld(true);for(const b of before)g.attach(b.o);};
  this.push({label:{key:'studio3d.hist.groupObjects',params:{count:objs.length}},undo:moveBack,redo:moveIn});
  return g;
 }
 /** Dissolves a group: its children move back to the group's parent, keeping their world transforms. One undo step. */
 ungroup(id:number){
  const g=this.need(id);
  if(g===this.root)throw new StageError('The scene root cannot be ungrouped.');
  if(!(g as THREE.Group).isGroup)throw new StageError(`${g.name} is not a group.`);
  const parent=g.parent!;const at=parent.children.indexOf(g);const kids=[...g.children];
  const split=()=>{for(const k of kids)parent.attach(k);parent.remove(g);};
  const join=()=>{parent.add(g);const ch=parent.children;ch.splice(ch.indexOf(g),1);ch.splice(Math.min(at,ch.length),0,g);
   g.updateMatrixWorld(true);for(const k of kids)g.attach(k);};
  split();this.push({label:{key:'studio3d.hist.ungroup',params:{name:g.name}},undo:join,redo:split});
 }
 /** Duplicates objects as a linear or radial array. count is the total including the source; one undo step. */
 arrayDuplicate(ids:number[],spec:{mode:'linear'|'radial';count:number;offset?:Vec3;axis?:'x'|'y'|'z';angle?:number;center?:Vec3}):THREE.Object3D[]{
  const objs=this.topLevel(this.needMany(ids,1));
  const count=Math.floor(Number(spec.count));
  if(!Number.isFinite(count)||count<2||count>100)throw new StageError('count must be a whole number between 2 and 100.');
  const mats:THREE.Matrix4[]=[];
  for(let i=1;i<count;i++){
   if(spec.mode==='linear'){
    if(!spec.offset)throw new StageError('A linear array needs an offset.');
    const off={x:finite(spec.offset.x,'offset x'),y:finite(spec.offset.y,'offset y'),z:finite(spec.offset.z,'offset z')};
    if(off.x===0&&off.y===0&&off.z===0)throw new StageError('The offset cannot be zero.');
    mats.push(new THREE.Matrix4().makeTranslation(off.x*i,off.y*i,off.z*i));
   }else if(spec.mode==='radial'){
    const ang=finite(spec.angle,'angle');if(ang===0||ang<-360||ang>360)throw new StageError('angle must be between -360 and 360 degrees, and not zero.');
    if(!spec.center)throw new StageError('A radial array needs a centre.');
    const c={x:finite(spec.center.x,'center x'),y:finite(spec.center.y,'center y'),z:finite(spec.center.z,'center z')};
    const ax=spec.axis==='x'?new THREE.Vector3(1,0,0):spec.axis==='z'?new THREE.Vector3(0,0,1):new THREE.Vector3(0,1,0);
    mats.push(new THREE.Matrix4().makeTranslation(c.x,c.y,c.z).multiply(new THREE.Matrix4().makeRotationAxis(ax,THREE.MathUtils.degToRad(ang*i))).multiply(new THREE.Matrix4().makeTranslation(-c.x,-c.y,-c.z)));
   }else throw new StageError("mode must be 'linear' or 'radial'.");
  }
  this.root.updateMatrixWorld(true);
  const items:{o:THREE.Object3D;parent:THREE.Object3D;at:number}[]=[];
  for(const src of objs)for(const m of mats){
   const copy=src.clone(true);copy.traverse(c=>{const me=c as THREE.Mesh;if(me.isMesh&&!Array.isArray(me.material))me.material=(me.material as THREE.Material).clone();});
   copy.name=this.uniqueName(src.name+' copy');
   const parent=src.parent??this.root;
   const world=new THREE.Matrix4().multiplyMatrices(m,src.matrixWorld);
   const local=new THREE.Matrix4().copy(parent.matrixWorld).invert().multiply(world);
   local.decompose(copy.position,copy.quaternion,copy.scale);
   items.push({o:copy,parent,at:parent.children.length});this.attach0(copy,parent,parent.children.length);
  }
  let owned=true;
  this.push({label:{key:'studio3d.hist.arrayCopies',params:{count:objs.length*(count-1)}},undo:()=>{for(const i of items)i.parent.remove(i.o);owned=false;},redo:()=>{for(const i of items)this.attach0(i.o,i.parent,i.at);owned=true;},release:()=>{if(!owned)for(const i of items)disposeObject(i.o);}});
  return items.map(i=>i.o);
 }
 /** Nearest snap target for a world-space point: another mesh's vertex, or a point on another mesh's surface, within radius. */
 snapPoint(p:Vec3,mode:'vertex'|'surface'|'midpoint',exclude:number[],radius:number):Vec3|null{
  const skip=new Set<number>();
  for(const id of exclude){const o=this.find(id);if(o)o.traverse(c=>skip.add(c.id));}
  this.root.updateMatrixWorld(true);
  const v=new THREE.Vector3(finite(p.x,'x'),finite(p.y,'y'),finite(p.z,'z'));
  const r=Math.max(0.01,finite(radius,'radius'));
  const meshes:THREE.Mesh[]=[];
  this.root.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh&&!skip.has(m.id))meshes.push(m);});
  let best:THREE.Vector3|null=null;let bd=r;
  if(mode==='vertex'||mode==='midpoint'){
   const w=new THREE.Vector3();
   for(const m of meshes){
    const geo=m.geometry as THREE.BufferGeometry;
    const pos=geo.getAttribute('position');
    if(!pos||pos.count>100000)continue;
    if(mode==='vertex'){
     for(let i=0;i<pos.count;i++){w.fromBufferAttribute(pos as THREE.BufferAttribute,i);m.localToWorld(w);const d=w.distanceTo(v);if(d<bd){bd=d;best=w.clone();}}
    }else{
     const idx=geo.getIndex();
     const tris=idx?idx.count/3:pos.count/3;
     const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
     const at=(k:number)=>idx?idx.getX(k):k;
     for(let t=0;t<tris;t++){
      a.fromBufferAttribute(pos as THREE.BufferAttribute,at(t*3));b.fromBufferAttribute(pos as THREE.BufferAttribute,at(t*3+1));c.fromBufferAttribute(pos as THREE.BufferAttribute,at(t*3+2));
      for(const[u,w2]of[[a,b],[b,c],[c,a]]as const){
       w.copy(u).add(w2).multiplyScalar(0.5);m.localToWorld(w);const d=w.distanceTo(v);if(d<bd){bd=d;best=w.clone();}
      }
     }
    }
   }
  }else{
   const ray=new THREE.Raycaster();const dirs=[[0,1,0],[0,-1,0],[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]];
   for(const[dx,dy,dz]of dirs){
    const dir=new THREE.Vector3(dx,dy,dz);
    ray.set(v.clone().addScaledVector(dir,r),dir.clone().negate());ray.far=2*r;
    const hits=ray.intersectObjects(meshes,false);
    if(hits.length&&hits[0].distance<=2*r){const d=hits[0].point.distanceTo(v);if(d<bd){bd=d;best=hits[0].point.clone();}}
   }
  }
  return best?{x:best.x,y:best.y,z:best.z}:null;
 }
 duplicateMany(ids:number[]):THREE.Object3D[]{
  const objs=this.topLevel(this.needMany(ids,1));const items:{o:THREE.Object3D;parent:THREE.Object3D;at:number}[]=[];
  for(const src of objs){
   const copy=src.clone(true);copy.traverse(c=>{const m=c as THREE.Mesh;if(m.isMesh&&!Array.isArray(m.material))m.material=(m.material as THREE.Material).clone();});
   copy.name=this.uniqueName(src.name+' copy');copy.position.x+=0.5;
   const parent=src.parent??this.root;items.push({o:copy,parent,at:parent.children.length});this.attach0(copy,parent,parent.children.length);
  }
  let owned=true;
  this.push({label:{key:'studio3d.hist.duplicateObjects',params:{count:items.length}},undo:()=>{for(const i of items)i.parent.remove(i.o);owned=false;},redo:()=>{for(const i of items)this.attach0(i.o,i.parent,i.at);owned=true;},release:()=>{if(!owned)for(const i of items)disposeObject(i.o);}});
  return items.map(i=>i.o);
 }
 /** Edit mode: one mesh edited at a time, selection lives here so undo of ops stays coherent. */
 private editId:number|null=null;
 private editSel={verts:new Set<number>(),edges:new Map<string,[number,number]>(),faces:new Set<number>()};
 private sculptShot:{id:number;positions:Float32Array;mask:Float32Array|null}|null=null;
 private editableMesh(id:number):THREE.Mesh{
  const o=this.need(id);const m=o as THREE.Mesh;
  if(!m.isMesh)throw new StageError(`${o.name} is not a mesh.`);
  if((m as THREE.SkinnedMesh).isSkinnedMesh)throw new StageError(`${o.name} is skinned: mesh editing would break the skin. Unbind it first.`);
  if(o.userData?.somniaMirror)throw new StageError(`${o.name} has a mirror modifier. Turn it off before editing or sculpting.`);
  const verts=(m.geometry.getAttribute('position')?.count??0);
  if(verts>MAX_EDIT_VERTICES||m.geometry.getIndex()&&m.geometry.getIndex()!.count/3>MAX_EDIT_TRIANGLES)throw new StageError(`${o.name} is too large to edit (${verts.toLocaleString('en-US')} vertices).`);
  return m;
 }
 private meshDataFromGeometry(g:THREE.BufferGeometry,what='The mesh'):MeshData{
  const pos=g.getAttribute('position');
  if(!pos||!pos.count)throw new StageError(`${what} has no vertices.`);
  const positions=Array.from((pos.array as ArrayLike<number>)).slice(0,pos.count*3) as number[];
  const idx=g.getIndex();
  const index=idx?Array.from(idx.array as ArrayLike<number>) as number[]:Array.from({length:pos.count},(_,i)=>i);
  const uv=g.getAttribute('uv');
  const uvs=uv&&uv.count===pos.count?Array.from(uv.array as ArrayLike<number>).slice(0,pos.count*2) as number[]:undefined;
  const no=g.getAttribute('normal');
  const normals=no&&no.count===pos.count?Array.from(no.array as ArrayLike<number>).slice(0,pos.count*3) as number[]:undefined;
  return{positions,index,...(uvs?{uvs}:{}),...(normals?{normals}:{})};
 }
 /** Geometry from mesh data: positions and index always, UVs when the op carried them through, normals recomputed. */
 private buildGeometry(d:MeshData):THREE.BufferGeometry{
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(d.positions,3));
  if(d.uvs)g.setAttribute('uv',new THREE.Float32BufferAttribute(d.uvs,2));
  g.setIndex(d.index);
  if(d.normals)g.setAttribute('normal',new THREE.Float32BufferAttribute(d.normals,3));
  else g.computeVertexNormals();
  return g;
 }
 private meshDataOf(m:THREE.Mesh):MeshData{
  const data=this.meshDataFromGeometry(m.geometry,m.name);
  const ma=m.geometry.getAttribute('somniaMask');
  const mask=ma?Array.from(ma.array as ArrayLike<number>).slice(0,data.positions.length/3) as number[]:undefined;
  return{...data,...(mask?{mask}:{})};
 }
 private applyMeshData(m:THREE.Mesh,data:MeshData,label:HistoryLabel){
  const before=m.geometry,beforeData=m.userData.somniaPrimitive;
  const make=(d:MeshData)=>this.buildGeometry(d);
  const after=make(data);
  // Vertex indices change with the rebuild: re-find seams geometrically so surviving edges keep their mark.
  const seams0=this.seamsOf(m);let seams1:[number,number][]=[];
  if(seams0.length){try{seams1=remapSeams(this.meshDataOf(m),seams0,data);}catch{seams1=[];}}
  let owned=true;
  const set=(g:THREE.BufferGeometry,param:unknown,seams:[number,number][])=>{m.geometry=g;if(param===undefined)delete m.userData.somniaPrimitive;else m.userData.somniaPrimitive=param;this.setSeams(m,seams);};
  set(after,undefined,seams1);
  this.push({label,undo:()=>{set(before,beforeData,seams0);owned=false;},redo:()=>{set(after,undefined,seams1);owned=true;},release:()=>{(owned?before:after).dispose();}});
 }
 /** Enters mesh edit mode on a mesh. Returns the vertex and triangle counts. */
 editStart(id:number):{vertices:number;triangles:number}{
  const m=this.editableMesh(id);this.editId=id;this.editSel={verts:new Set(),edges:new Map(),faces:new Set()};
  return{vertices:m.geometry.getAttribute('position').count,triangles:m.geometry.getIndex()?m.geometry.getIndex()!.count/3:m.geometry.getAttribute('position').count/3};
 }
 editEnd(){this.editId=null;this.editSel={verts:new Set(),edges:new Map(),faces:new Set()};}
 private editMesh():THREE.Mesh{
  if(this.editId==null)throw new StageError('No mesh is being edited. Choose Edit mesh first.');
  return this.editableMesh(this.editId);
 }
 editSelect(kind:'vertex'|'edge'|'face',ids:(number|[number,number])[],toggle=false){
  const m=this.editMesh();const verts=m.geometry.getAttribute('position').count,idx=m.geometry.getIndex();const tris=(idx?idx.count:verts)/3;
  if(kind==='vertex')for(const id of ids as number[]){if(!Number.isInteger(id)||id<0||id>=verts)throw new StageError(`Vertex ${id} does not exist.`);
   if(toggle&&this.editSel.verts.has(id))this.editSel.verts.delete(id);else this.editSel.verts.add(id);}
  if(kind==='face')for(const id of ids as number[]){if(!Number.isInteger(id)||id<0||id>=tris)throw new StageError(`Face ${id} does not exist.`);
   if(toggle&&this.editSel.faces.has(id))this.editSel.faces.delete(id);else this.editSel.faces.add(id);}
  if(kind==='edge')for(const e of ids as [number,number][]){
   if(!Array.isArray(e)||e.length!==2||!e.every(x=>Number.isInteger(x)&&x>=0&&x<verts)||e[0]===e[1])throw new StageError('A selected edge does not exist.');
   const k=e[0]<e[1]?`${e[0]}_${e[1]}`:`${e[1]}_${e[0]}`;
   if(toggle&&this.editSel.edges.has(k))this.editSel.edges.delete(k);else this.editSel.edges.set(k,[Math.min(e[0],e[1]),Math.max(e[0],e[1])]);}
 }
 editSelection():{verts:number[];edges:[number,number][];faces:number[]}{
  return{verts:[...this.editSel.verts].sort((a,b)=>a-b),edges:[...this.editSel.edges.values()],faces:[...this.editSel.faces].sort((a,b)=>a-b)};
 }
 /** Every unique edge of the edited mesh as index pairs (low index first). */
 private allEdges(m:THREE.Mesh):[number,number][]{
  const idx=m.geometry.getIndex();const pos=m.geometry.getAttribute('position');
  const n=idx?idx.count:pos.count;const at=(i:number)=>idx?idx.getX(i):i;
  const seen=new Set<string>();const out:[number,number][]=[];
  for(let t=0;t+2<n;t+=3){const v=[at(t),at(t+1),at(t+2)];
   for(let e=0;e<3;e++){const a=v[e]<v[(e+1)%3]?v[e]:v[(e+1)%3],b=v[e]<v[(e+1)%3]?v[(e+1)%3]:v[e];const k=`${a}_${b}`;
    if(!seen.has(k)){seen.add(k);out.push([a,b]);}}}
  return out;
 }
 /** Selects every element of one kind, clears that kind or inverts it. Works on the current selection mode's kind; selection changes are not undo steps. */
 editSelectAll(op:'all'|'none'|'invert',kind:'vertex'|'edge'|'face'){
  const m=this.editMesh();
  const verts=m.geometry.getAttribute('position').count,idx=m.geometry.getIndex();
  const tris=(idx?idx.count:verts)/3;
  const fill=(n:number,have:(i:number)=>boolean,add:(i:number)=>void,clear:()=>void,swap:(next:Set<number>)=>void)=>{
   if(op==='none')clear();
   else if(op==='all'){clear();for(let i=0;i<n;i++)add(i);}
   else{const next=new Set<number>();for(let i=0;i<n;i++)if(!have(i))next.add(i);swap(next);}
  };
  if(kind==='vertex')fill(verts,i=>this.editSel.verts.has(i),i=>this.editSel.verts.add(i),()=>this.editSel.verts.clear(),s=>{this.editSel.verts=s;});
  else if(kind==='face')fill(tris,i=>this.editSel.faces.has(i),i=>this.editSel.faces.add(i),()=>this.editSel.faces.clear(),s=>{this.editSel.faces=s;});
  else{
   const all=this.allEdges(m);
   if(op==='none')this.editSel.edges.clear();
   else if(op==='all'){this.editSel.edges.clear();for(const [a,b]of all)this.editSel.edges.set(`${a}_${b}`,[a,b]);}
   else{const next=new Map<string,[number,number]>();for(const [a,b]of all){const k=`${a}_${b}`;if(!this.editSel.edges.has(k))next.set(k,[a,b]);}this.editSel.edges=next;}
  }
 }
 /** Grows the current selection to neighbouring elements, or shrinks it by peeling the layer that touches unselected elements. Vertices grow over edges, edges over shared vertices, faces over shared edges. One step per count; selection changes are not undo steps. */
 editSelectGrow(steps:number,shrink:boolean,kind:'vertex'|'edge'|'face'){
  const m=this.editMesh();
  const edges=this.allEdges(m);
  const empty=kind==='vertex'?!this.editSel.verts.size:kind==='face'?!this.editSel.faces.size:!this.editSel.edges.size;
  if(empty)throw new StageError('Select something first.');
  if(kind==='vertex'){
   const nbr=new Map<number,number[]>();
   for(const [a,b]of edges){(nbr.get(a)??nbr.set(a,[]).get(a)!).push(b);(nbr.get(b)??nbr.set(b,[]).get(b)!).push(a);}
   for(let s=0;s<steps;s++){
    if(shrink){const del:number[]=[];for(const v of this.editSel.verts)if((nbr.get(v)??[]).some(w=>!this.editSel.verts.has(w)))del.push(v);
     if(!del.length)break;for(const v of del)this.editSel.verts.delete(v);}
    else{const before=this.editSel.verts.size;for(const v of [...this.editSel.verts])for(const w of nbr.get(v)??[])this.editSel.verts.add(w);
     if(this.editSel.verts.size===before)break;}
   }
  }else if(kind==='edge'){
   const key=([a,b]:[number,number])=>`${a}_${b}`;
   const byVert=new Map<number,string[]>();
   for(const e of edges){const k=key(e);(byVert.get(e[0])??byVert.set(e[0],[]).get(e[0])!).push(k);(byVert.get(e[1])??byVert.set(e[1],[]).get(e[1])!).push(k);}
   const edgeByKey=new Map(edges.map(e=>[key(e),e]as const));
   for(let s=0;s<steps;s++){
    if(shrink){const del:string[]=[];for(const [k,[a,b]]of this.editSel.edges){const touch=(byVert.get(a)??[]).concat(byVert.get(b)??[]);if(touch.some(t=>t!==k&&!this.editSel.edges.has(t)))del.push(k);}
     if(!del.length)break;for(const k of del)this.editSel.edges.delete(k);}
    else{const before=this.editSel.edges.size;for(const [a,b]of [...this.editSel.edges.values()])for(const t of (byVert.get(a)??[]).concat(byVert.get(b)??[]))if(!this.editSel.edges.has(t))this.editSel.edges.set(t,edgeByKey.get(t)!);
     if(this.editSel.edges.size===before)break;}
   }
  }else{
   const idx=m.geometry.getIndex();const pos=m.geometry.getAttribute('position');
   const n=idx?idx.count:pos.count;const at=(i:number)=>idx?idx.getX(i):i;
   const faceNbr=new Map<number,Set<number>>();const edgeFace=new Map<string,number>();
   for(let t=0,f=0;t+2<n;t+=3,f++){const v=[at(t),at(t+1),at(t+2)];
    for(let e=0;e<3;e++){const a=Math.min(v[e],v[(e+1)%3]),b=Math.max(v[e],v[(e+1)%3]);const k=`${a}_${b}`;
     if(edgeFace.has(k)){const g=edgeFace.get(k)!;(faceNbr.get(g)??faceNbr.set(g,new Set()).get(g)!).add(f);(faceNbr.get(f)??faceNbr.set(f,new Set()).get(f)!).add(g);}else edgeFace.set(k,f);}}
   for(let s=0;s<steps;s++){
    if(shrink){const del:number[]=[];for(const f of this.editSel.faces)if([...(faceNbr.get(f)??[])].some(g=>!this.editSel.faces.has(g)))del.push(f);
     if(!del.length)break;for(const f of del)this.editSel.faces.delete(f);}
    else{const before=this.editSel.faces.size;for(const f of [...this.editSel.faces])for(const g of faceNbr.get(f)??[])this.editSel.faces.add(g);
     if(this.editSel.faces.size===before)break;}
   }
  }
 }
 private editOp(label:HistoryLabel,run:(m:MeshData)=>MeshData){
  const mesh=this.editMesh();
  let out:MeshData;
  try{out=run(this.meshDataOf(mesh));}catch(e){throw e instanceof EditError?new StageError(e.message):e;}
  this.applyMeshData(mesh,out,label);
 }
 editExtrude(offset:number){this.editOp({key:'studio3d.hist.extrude'},m=>extrudeFaces(m,[...this.editSel.faces],offset));}
 editInset(amount:number){this.editOp({key:'studio3d.hist.inset'},m=>insetFaces(m,[...this.editSel.faces],amount));}
 editBevel(width:number){this.editOp({key:'studio3d.hist.bevelVerts'},m=>bevelVertices(m,[...this.editSel.verts],width));}
 editLoopCut(){
  const edges=[...this.editSel.edges.values()];
  if(edges.length!==1)throw new StageError('Select exactly one edge for a loop cut.');
  this.editOp({key:'studio3d.hist.loopCut'},m=>loopCut(m,edges[0]));
 }
 editBevelEdge(width:number,segments=1){this.editOp({key:'studio3d.hist.bevelEdges'},m=>bevelEdges(m,[...this.editSel.edges.values()],width,segments));}
 editLoopSlide(factor:number){this.editOp({key:'studio3d.hist.loopSlide'},m=>slideEdges(m,[...this.editSel.edges.values()],factor));}
 /** Deletes the selected edit-mode elements (faces, or triangles touching selected edges or vertices) with one undo step. The selection is cleared afterwards because triangle ordinals shift. */
 editDelete(kind:'vertex'|'edge'|'face'){
  this.editOp({key:'studio3d.hist.editDelete'},m=>deleteElements(m,kind,kind==='face'?{faces:[...this.editSel.faces]}:kind==='edge'?{edges:[...this.editSel.edges.values()]}:{verts:[...this.editSel.verts]}));
  this.editSel={verts:new Set(),edges:new Map(),faces:new Set()};
 }
 /** Merges the selected edit-mode vertices into one at their centroid with one undo step. The selection is cleared afterwards. */
 editWeld(){
  this.editOp({key:'studio3d.hist.editWeld'},m=>weldSelected(m,[...this.editSel.verts]));
  this.editSel={verts:new Set(),edges:new Map(),faces:new Set()};
 }
 /** Splits each selected edit-mode triangle into four by edge midpoints (planar, no smoothing) with one undo step. The selection is cleared afterwards because face ordinals shift. */
 editSubdivide(){
  this.editOp({key:'studio3d.hist.editSubdivide'},m=>subdivideFaces(m,[...this.editSel.faces]));
  this.editSel={verts:new Set(),edges:new Map(),faces:new Set()};
 }
 /** Pokes each selected edit-mode triangle: inserts its centroid and splits it into three, one undo step. The selection is cleared afterwards because face ordinals shift. */
 editPoke(){
  this.editOp({key:'studio3d.hist.editPoke'},m=>pokeFaces(m,[...this.editSel.faces]));
  this.editSel={verts:new Set(),edges:new Map(),faces:new Set()};
 }
 /** Duplicates the selected edit-mode triangles as a detached shell with fresh vertices, one undo step. The selection is cleared afterwards because face ordinals shift. */
 editDuplicate(){
  this.editOp({key:'studio3d.hist.editDuplicate'},m=>duplicateFaces(m,[...this.editSel.faces]));
  this.editSel={verts:new Set(),edges:new Map(),faces:new Set()};
 }
 /** Seam edges marked on a mesh (vertex-index pairs). */
 seamsOf(o:THREE.Object3D):[number,number][]{
  return (o.userData.somniaSeams as [number,number][]|undefined)??[];
 }
 private setSeams(o:THREE.Object3D,seams:[number,number][]){
  if(seams.length)o.userData.somniaSeams=seams;else delete o.userData.somniaSeams;
 }
 /** Marks or clears the selected edit-mode edges as UV seams; coincident copies on unwelded meshes come along. One undo step. */
 uvSeamMark(mark:boolean){
  const m=this.editMesh();
  const sel=[...this.editSel.edges.values()];
  if(!sel.length)throw new StageError(mark?'Select edges to mark as seams.':'Select seams to clear.');
  const data=this.meshDataOf(m);
  let hit:[number,number][];
  try{hit=seamsAround(data,sel);}catch(e){throw e instanceof UvError?new StageError(e.message):e;}
  if(!hit.length)throw new StageError('The selected edges are not part of this mesh.');
  const before=this.seamsOf(m);
  const key=([a,b]:[number,number])=>a<b?`${a}_${b}`:`${b}_${a}`;
  let after:[number,number][];
  if(mark){
   const have=new Set(before.map(key));after=[...before];
   for(const e of hit){const k=key(e);if(!have.has(k)){have.add(k);after.push(e);}}
   if(after.length===before.length)throw new StageError('The selected edges are already seams.');
  }else{
   const drop=new Set(hit.map(key));after=before.filter(e=>!drop.has(key(e)));
   if(after.length===before.length)throw new StageError('None of the selected edges are seams.');
  }
  this.setSeams(m,after);
  this.push({label:{key:mark?'studio3d.hist.markSeams':'studio3d.hist.clearSeams'},undo:()=>this.setSeams(m,before),redo:()=>this.setSeams(m,after)});
 }
 private uvTarget(id:number):THREE.Mesh{
  const o=this.need(id);const m=o as THREE.Mesh;
  if(!m.isMesh)throw new StageError(`${o.name} is not a mesh.`);
  if(this.editId!=null)throw new StageError('Leave edit mode before changing UVs.');
  return m;
 }
 /** Applies a UV layout: vertices split along seams (one copy per UV slot) and every attribute follows. One undo step. */
 private applyUv(m:THREE.Mesh,r:UvResult,label:HistoryLabel){
  const data=this.meshDataOf(m);
  if(r.uvIndex.length!==data.index.length||r.uvIndex.some(i=>i<0||i>=r.uv.length))throw new StageError('The UV layout is damaged.');
  const slotVert=new Array<number>(r.uv.length).fill(-1);
  for(let k=0;k<r.uvIndex.length;k++)slotVert[r.uvIndex[k]]=data.index[k];
  if(slotVert.some(v=>v<0))throw new StageError('The UV layout is damaged.');
  const g=new THREE.BufferGeometry();
  for(const name of Object.keys(m.geometry.attributes)){
   if(name==='uv')continue;
   const a=m.geometry.getAttribute(name) as THREE.BufferAttribute;
   const src=a.array as Float32Array;
   const out=new (src.constructor as new(len:number)=>Float32Array)(slotVert.length*a.itemSize);
   for(let i=0;i<slotVert.length;i++)for(let c=0;c<a.itemSize;c++)out[i*a.itemSize+c]=src[slotVert[i]*a.itemSize+c];
   g.setAttribute(name,new THREE.BufferAttribute(out,a.itemSize,a.normalized));
  }
  g.setAttribute('uv',new THREE.Float32BufferAttribute(r.uv.flat(),2));
  g.setIndex(r.uvIndex.slice());
  const before=m.geometry,beforeData=m.userData.somniaPrimitive,beforeSeams=this.seamsOf(m);
  const np:number[]=[];for(const v of slotVert)np.push(data.positions[v*3],data.positions[v*3+1],data.positions[v*3+2]);
  let afterSeams:[number,number][]=[];
  if(beforeSeams.length){try{afterSeams=remapSeams(data,beforeSeams,{positions:np,index:r.uvIndex});}catch{afterSeams=[];}}
  let owned=true;
  const set=(geo:THREE.BufferGeometry,prim:unknown,seams:[number,number][])=>{m.geometry=geo;if(prim===undefined)delete m.userData.somniaPrimitive;else m.userData.somniaPrimitive=prim;this.setSeams(m,seams);};
  set(g,undefined,afterSeams);
  this.push({label,undo:()=>{set(before,beforeData,beforeSeams);owned=false;},redo:()=>{set(g,undefined,afterSeams);owned=true;},release:()=>{(owned?before:g).dispose();}});
 }
 /** Unwrap: box projection per island or angle-based unfolding, packed with padding by default (grid layout when pack is off). One undo step. */
 uvUnwrap(id:number,opts?:{method?:'box'|'angle'}&UvLayoutOpts){
  const m=this.uvTarget(id);
  const data=this.meshDataOf(m);const seams=this.seamsOf(m);
  const lo:UvLayoutOpts={pack:opts?.pack??true,padding:opts?.padding??0.02};
  let r:UvResult;
  try{r=(opts?.method??'box')==='angle'?unfoldAngles(data,seams,lo):unwrapBox(data,seams,lo);}catch(e){throw e instanceof UvError?new StageError(e.message):e;}
  this.applyUv(m,r,{key:'studio3d.hist.unwrap'});
 }
 /** Planar UV projection of the whole mesh along one axis, normalized to 0..1. One undo step. */
 uvPlanar(id:number,axis:'x'|'y'|'z'){
  const m=this.uvTarget(id);
  let r:UvResult;try{r=planarProject(this.meshDataOf(m),axis);}catch(e){throw e instanceof UvError?new StageError(e.message):e;}
  this.applyUv(m,r,{key:'studio3d.hist.planarUv'});
 }
 /** Read-only UV layout for the island view: one uv pair per face corner (index order) and the island id per face; null when the mesh has no uvs or too many faces. */
 uvLayout(id:number):{uv:[number,number][];islands:number[]}|null{
  const o=this.find(id);if(!o)return null;
  const m=o as THREE.Mesh;
  if(!m.isMesh)return null;
  const attr=m.geometry.getAttribute('uv') as THREE.BufferAttribute|undefined;
  if(!attr)return null;
  let data:MeshData;try{data=this.meshDataOf(m);}catch{return null;}
  if(data.index.length/3>4000)return null;
  const uv:[number,number][]=[];
  for(let k=0;k<data.index.length;k++)uv.push([attr.getX(data.index[k]),attr.getY(data.index[k])]);
  let islands:number[];
  try{islands=uvIslands(data,this.seamsOf(m));}catch{return null;}
  return{uv,islands};
 }
 /** Toggles the non-destructive mirror modifier: while on, the mesh shows base + mirrored half (exports include both); the base geometry stays in userData and editing is refused. One undo step per toggle. */
 mirrorMod(id:number,axis:MirrorAxis,merge:number,on:boolean,bisect=false){
  const o=this.need(id);const m=o as THREE.Mesh;
  if(!m.isMesh)throw new StageError(`${o.name} is not a mesh.`);
  if((m as THREE.SkinnedMesh).isSkinnedMesh)throw new StageError(`${o.name} is skinned: mirror it after binding is removed.`);
  const cur=o.userData.somniaMirror as {axis:MirrorAxis;merge:number;bisect?:boolean}|undefined;
  if(on&&cur)throw new StageError(`${o.name} already has a mirror modifier. Turn it off first.`);
  if(!on&&!cur)throw new StageError(`${o.name} has no mirror modifier.`);
  if(on){
   const base=m.geometry;
   const baseData=this.meshDataOf(m);
   let data:MeshData;try{data=mirrorCombine(baseData,axis,merge,bisect);}catch(e){throw e instanceof EditError?new StageError(e.message):e;}
   const combined=this.buildGeometry(data);
   const seams0=this.seamsOf(m);let seams1:[number,number][]=[];
   if(seams0.length){try{seams1=remapSeams(baseData,seams0,data);}catch{seams1=[];}}
   let owned=true;
   const apply=(g:THREE.BufferGeometry,mark:boolean)=>{m.geometry=g;this.setSeams(m,mark?seams1:seams0);if(mark){o.userData.somniaMirror={axis,merge,bisect};o.userData.somniaMirrorBase=base;}else{delete o.userData.somniaMirror;delete o.userData.somniaMirrorBase;}};
   apply(combined,true);
   this.push({label:{key:'studio3d.hist.mirror',params:{name:o.name}},undo:()=>{apply(base,false);owned=false;},redo:()=>{apply(combined,true);owned=true;},release:()=>{(owned?base:combined).dispose();}});
  }else{
   const combined=m.geometry;const base=o.userData.somniaMirrorBase as THREE.BufferGeometry;
   if(!base)throw new StageError(`${o.name} has no stored base mesh.`);
   const seamsC=this.seamsOf(m);let seamsB:[number,number][]=[];
   if(seamsC.length){try{seamsB=remapSeams(this.meshDataFromGeometry(combined),seamsC,this.meshDataFromGeometry(base));}catch{seamsB=[];}}
   let owned=false;
   const apply=(g:THREE.BufferGeometry,mark:boolean)=>{m.geometry=g;this.setSeams(m,mark?seamsC:seamsB);if(mark){o.userData.somniaMirror={axis:cur!.axis,merge:cur!.merge,bisect:cur!.bisect};o.userData.somniaMirrorBase=base;}else{delete o.userData.somniaMirror;delete o.userData.somniaMirrorBase;}};
   apply(base,false);
   this.push({label:{key:'studio3d.hist.mirrorOff',params:{name:o.name}},undo:()=>{apply(combined,true);owned=true;},redo:()=>{apply(base,false);owned=false;},release:()=>{(owned?base:combined).dispose();}});
  }
 }
 /** Starts a sculpt stroke: the positions snapshot becomes one undo step when the stroke ends. */
 sculptBegin(id:number){
  const m=this.editableMesh(id);
  if(this.sculptShot)this.sculptEnd();
  const ma=m.geometry.getAttribute('somniaMask');
  this.sculptShot={id,positions:new Float32Array((m.geometry.getAttribute('position').array as ArrayLike<number>) as number[]),mask:ma?new Float32Array(ma.array as ArrayLike<number> as number[]):null};
 }
 sculptDabAt(id:number,center:[number,number,number],opts:Omit<SculptOpts,'brush'>&{brush:string},erase=false):number{
  const m=this.editableMesh(id);
  if(!this.sculptShot||this.sculptShot.id!==id)this.sculptBegin(id);
  if(opts.brush==='mask'){
   let mask:number[];
   try{mask=paintMask(this.meshDataOf(m),center,{radius:opts.radius,strength:opts.strength,falloff:opts.falloff,erase});}catch(e){throw e instanceof SculptError?new StageError(e.message):e;}
   const g=m.geometry;let attr=g.getAttribute('somniaMask') as THREE.BufferAttribute|undefined;
   if(!attr){attr=new THREE.BufferAttribute(new Float32Array(mask),1);g.setAttribute('somniaMask',attr);}
   else{(attr.array as Float32Array).set(mask);attr.needsUpdate=true;}
   return mask.length;
  }
  let out:MeshData;
  try{out=sculptDab(this.meshDataOf(m),center,opts as SculptOpts);}catch(e){throw e instanceof SculptError?new StageError(e.message):e;}
  const g=m.geometry;const pos=g.getAttribute('position') as THREE.BufferAttribute;
  (pos.array as Float32Array).set(out.positions);pos.needsUpdate=true;g.computeVertexNormals();
  return out.positions.length/3;
 }
 /** Clears the sculpt mask of a mesh. One undo step. */
 sculptMaskClear(id:number){
  const m=this.editableMesh(id);const g=m.geometry;const attr=g.getAttribute('somniaMask') as THREE.BufferAttribute|undefined;
  if(!attr)throw new StageError(`${m.name} has no sculpt mask.`);
  const before=new Float32Array(attr.array as ArrayLike<number> as number[]);
  const after=new Float32Array(before.length);
  const set=(arr:Float32Array)=>{(g.getAttribute('somniaMask') as THREE.BufferAttribute).set(arr);(g.getAttribute('somniaMask') as THREE.BufferAttribute).needsUpdate=true;};
  set(after);
  this.push({label:{key:'studio3d.hist.clearMask',params:{name:m.name}},undo:()=>set(before),redo:()=>set(after)});
 }
 sculptEnd(){
  const shot=this.sculptShot;this.sculptShot=null;if(!shot)return;
  const m=this.find(shot.id) as THREE.Mesh|undefined;if(!m||!(m as THREE.Mesh).isMesh)return;
  const before=shot.positions;const pos=m.geometry.getAttribute('position') as THREE.BufferAttribute;
  const after=new Float32Array(pos.array as ArrayLike<number> as number[]);
  const maskAttr=m.geometry.getAttribute('somniaMask') as THREE.BufferAttribute|undefined;
  const maskBefore=shot.mask;const maskAfter=maskAttr?new Float32Array(maskAttr.array as ArrayLike<number> as number[]):null;
  let changed=false;
  for(let i=0;i<after.length;i++)if(after[i]!==before[i]){changed=true;break;}
  if(!changed&&maskBefore&&maskAfter)for(let i=0;i<maskAfter.length;i++)if(maskAfter[i]!==maskBefore[i]){changed=true;break;}
  if(!changed&&((maskBefore==null)!==(maskAfter==null)))changed=true;
  if(!changed)return;
  const set=(arr:Float32Array,msk:Float32Array|null)=>{
   (m.geometry.getAttribute('position') as THREE.BufferAttribute).set(arr);(m.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate=true;
   if(msk){let a=m.geometry.getAttribute('somniaMask') as THREE.BufferAttribute|undefined;if(!a){a=new THREE.BufferAttribute(new Float32Array(msk),1);m.geometry.setAttribute('somniaMask',a);}else{a.set(msk);a.needsUpdate=true;}}
   else if(m.geometry.getAttribute('somniaMask'))m.geometry.deleteAttribute('somniaMask');
   m.geometry.computeVertexNormals();
  };
  this.push({label:{key:'studio3d.hist.sculpt',params:{name:m.name}},undo:()=>set(before,maskBefore),redo:()=>set(after,maskAfter)});
 }
 /** Changes the parameters of a primitive (radius, size, segments). The mesh keeps its place and material; one undo step. */
 primitiveOf(o:THREE.Object3D):PrimitiveData|null{return (o as THREE.Mesh).isMesh?readPrimitive(o.userData?.somniaPrimitive):null;}
 setPrimitive(id:number,patch:Record<string,unknown>){
  const o=this.need(id);const mesh=o as THREE.Mesh;const cur=this.primitiveOf(o);
  if(!cur)throw new StageError(`${o.name} is not a parametric primitive.`);
  let params:PrimitiveParams;try{params=patchParams(cur.kind,cur.params,patch);}catch(e){throw e instanceof PrimitiveError?new StageError(e.message):e;}
  if(Object.keys(params).every(k=>params[k]===cur.params[k]))return;
  const before=mesh.geometry,beforeData=o.userData.somniaPrimitive;const after=geometryFor(cur.kind,params);const afterData={kind:cur.kind,params};
  let owned=true;const apply=(g:THREE.BufferGeometry,d:unknown)=>{mesh.geometry=g;o.userData.somniaPrimitive=d;};
  apply(after,afterData);
  this.push({label:{key:'studio3d.hist.shape',params:{name:o.name}},undo:()=>{apply(before,beforeData);owned=false;},redo:()=>{apply(after,afterData);owned=true;},release:()=>{(owned?before:after).dispose();}});
 }
 setMaterial(id:number,request:MaterialPatch){
  const o=this.need(id);const mesh=o as THREE.Mesh;let patch:{color?:string;metalness?:number;roughness?:number};
  try{patch=resolveMaterial(request);checkPbr(request);}catch(e){throw e instanceof PrimitiveError||e instanceof MaterialError?new StageError(e.message):e;}
  if(!mesh.isMesh||Array.isArray(mesh.material)||!(mesh.material as THREE.MeshStandardMaterial).isMeshStandardMaterial)throw new StageError(`${o.name} has no editable PBR material.`);
  if(patch.color!==undefined&&!HEX.test(patch.color))throw new StageError('color must look like #rrggbb.');
  // A preset can carry PBR extras (glass) and a procedural texture (wood); request fields win over the preset, field by field.
  const preset=request.preset!==undefined?MATERIAL_PRESETS.find(x=>x.id===request.preset):undefined;
  const ex:PbrExtras={};
  for(const k of['emissive','emissiveIntensity','opacity','alphaMode','alphaCutoff','doubleSided'] as const){const v=request[k]!==undefined?request[k]:preset?.extras?.[k];if(v!==undefined)(ex as Record<string,unknown>)[k]=v;}
  const wood=preset?.procedural==='wood';
  const mat=mesh.material as THREE.MeshStandardMaterial;
  const take=()=>({c:mat.color.clone(),m:mat.metalness,r:mat.roughness,e:mat.emissive.clone(),ei:mat.emissiveIntensity,op:mat.opacity,tr:mat.transparent,at:mat.alphaTest,dw:mat.depthWrite,side:mat.side,map:wood?mat.map:null});
  const before=take();const next=take();
  if(patch.color)next.c=new THREE.Color(patch.color);
  if(patch.metalness!==undefined)next.m=clamp01(finite(patch.metalness,'metalness'));
  if(patch.roughness!==undefined)next.r=clamp01(finite(patch.roughness,'roughness'));
  if(ex.emissive!==undefined)next.e=new THREE.Color(ex.emissive);
  if(ex.emissiveIntensity!==undefined)next.ei=ex.emissiveIntensity;
  if(ex.doubleSided!==undefined)next.side=ex.doubleSided?THREE.DoubleSide:THREE.FrontSide;
  if(ex.opacity!==undefined||ex.alphaMode!==undefined||ex.alphaCutoff!==undefined){
   const cur=alphaModeOf(before.tr,before.at);
   // Lowering opacity on an opaque material means the user wants it see-through.
   const mode=ex.alphaMode??(cur==='opaque'&&ex.opacity!==undefined&&ex.opacity<1?'blend':cur);
   const a=alphaState(mode,ex.opacity??(before.tr||before.at>0?before.op:1),ex.alphaCutoff??(before.at>0?before.at:0.5));
   next.tr=a.transparent;next.op=a.opacity;next.at=a.alphaTest;next.dw=a.depthWrite;
  }
  if(wood)next.map=woodTexture();
  const same=(x:ReturnType<typeof take>,y:ReturnType<typeof take>)=>x.c.equals(y.c)&&x.e.equals(y.e)&&x.m===y.m&&x.r===y.r&&x.ei===y.ei&&x.op===y.op&&x.tr===y.tr&&x.at===y.at&&x.dw===y.dw&&x.side===y.side&&x.map===y.map;
  if(same(before,next)){if(wood&&next.map)disposeGenerated(next.map);return;}
  const set=(sn:typeof before)=>{mat.color.copy(sn.c);mat.metalness=sn.m;mat.roughness=sn.r;mat.emissive.copy(sn.e);mat.emissiveIntensity=sn.ei;mat.opacity=sn.op;mat.transparent=sn.tr;mat.alphaTest=sn.at;mat.depthWrite=sn.dw;mat.side=sn.side;if(wood)mat.map=sn.map;mat.needsUpdate=true;};
  let owned=true;set(next);
  if(wood&&before.map!==next.map)disposeGenerated(before.map);
  this.push({label:{key:'studio3d.hist.material',params:{name:o.name}},
   undo:()=>{set(before);owned=false;},
   redo:()=>{set(next);owned=true;},
   release:()=>{if(wood)disposeGenerated(owned?before.map:next.map);}});
 }
 /** Reads the full material of a mesh for copy/paste. Throws when the object has no editable PBR material. */
 copyMaterial(id:number):MaterialSnapshot{
  const o=this.need(id);const mesh=o as THREE.Mesh;
  if(!mesh.isMesh||Array.isArray(mesh.material)||!(mesh.material as THREE.MeshStandardMaterial).isMeshStandardMaterial)throw new StageError(`${o.name} has no editable PBR material.`);
  const mat=mesh.material as THREE.MeshStandardMaterial;
  const textures=Object.fromEntries(TEXTURE_SLOTS.map(k=>[k,mat[SLOT_CONFIG[k].prop] as THREE.Texture|null])) as Record<TextureSlot,THREE.Texture|null>;
  const transforms=Object.fromEntries(TEXTURE_SLOTS.map(k=>{const t=mat[SLOT_CONFIG[k].prop] as THREE.Texture|null;return[k,t?readTransform(t):null];})) as Record<TextureSlot,TextureTransform|null>;
  return{color:'#'+mat.color.getHexString(),metalness:mat.metalness,roughness:mat.roughness,emissive:'#'+mat.emissive.getHexString(),emissiveIntensity:mat.emissiveIntensity,
   opacity:mat.transparent||mat.alphaTest>0?mat.opacity:1,alphaMode:alphaModeOf(mat.transparent,mat.alphaTest),alphaCutoff:mat.alphaTest>0?mat.alphaTest:0.5,doubleSided:mat.side===THREE.DoubleSide,textures,transforms};
 }
 /** Pastes a copied material onto a mesh: PBR fields, textures and their mapping in one undo step. Textures are cloned so later tiling edits stay per object. */
 pasteMaterial(id:number,snap:MaterialSnapshot){
  const o=this.need(id);const mesh=o as THREE.Mesh;
  if(!mesh.isMesh||Array.isArray(mesh.material)||!(mesh.material as THREE.MeshStandardMaterial).isMeshStandardMaterial)throw new StageError(`${o.name} has no editable PBR material.`);
  const mat=mesh.material as THREE.MeshStandardMaterial;
  const maps=Object.fromEntries(TEXTURE_SLOTS.map(k=>{
   const src=snap.textures[k];if(!src)return[k,null];
   // Re-pasting the same material keeps the existing texture instead of stacking clones: a paste that changes nothing makes no undo entry.
   const cur=mat[SLOT_CONFIG[k].prop] as THREE.Texture|null;
   if(cur&&(cur===src||cur.userData.somniaCloneOf===src.uuid)&&JSON.stringify(readTransform(cur))===JSON.stringify(snap.transforms[k]))return[k,cur];
   const t=src.clone();t.userData={...src.userData,somniaClone:true,somniaCloneOf:src.uuid};delete t.userData.somniaGenerated;t.needsUpdate=true;
   if(snap.transforms[k])writeTransform(t,snap.transforms[k]!);
   return[k,t];
  })) as Record<TextureSlot,THREE.Texture|null>;
  const a=alphaState(snap.alphaMode,snap.opacity,snap.alphaCutoff);
  const take=()=>({c:mat.color.clone(),m:mat.metalness,r:mat.roughness,e:mat.emissive.clone(),ei:mat.emissiveIntensity,op:mat.opacity,tr:mat.transparent,at:mat.alphaTest,dw:mat.depthWrite,side:mat.side,
   maps:Object.fromEntries(TEXTURE_SLOTS.map(k=>[k,mat[SLOT_CONFIG[k].prop] as THREE.Texture|null])) as Record<TextureSlot,THREE.Texture|null>,
   trs:Object.fromEntries(TEXTURE_SLOTS.map(k=>{const t=mat[SLOT_CONFIG[k].prop] as THREE.Texture|null;return[k,t?readTransform(t):null];})) as Record<TextureSlot,TextureTransform|null>});
  const before=take();
  const next:ReturnType<typeof take>={c:new THREE.Color(snap.color),m:snap.metalness,r:snap.roughness,e:new THREE.Color(snap.emissive),ei:snap.emissiveIntensity,op:a.opacity,tr:a.transparent,at:a.alphaTest,dw:a.depthWrite,side:snap.doubleSided?THREE.DoubleSide:THREE.FrontSide,
   maps,trs:Object.fromEntries(TEXTURE_SLOTS.map(k=>[k,maps[k]?readTransform(maps[k]!):null])) as Record<TextureSlot,TextureTransform|null>};
  const same=(x:ReturnType<typeof take>,y:ReturnType<typeof take>)=>x.c.equals(y.c)&&x.e.equals(y.e)&&x.m===y.m&&x.r===y.r&&x.ei===y.ei&&x.op===y.op&&x.tr===y.tr&&x.at===y.at&&x.dw===y.dw&&x.side===y.side
   &&TEXTURE_SLOTS.every(k=>x.maps[k]===y.maps[k])&&JSON.stringify(x.trs)===JSON.stringify(y.trs);
  if(same(before,next)){for(const k of TEXTURE_SLOTS){const t=maps[k];if(t?.userData.somniaClone)t.dispose();}return;}
  const set=(sn:typeof before)=>{mat.color.copy(sn.c);mat.metalness=sn.m;mat.roughness=sn.r;mat.emissive.copy(sn.e);mat.emissiveIntensity=sn.ei;mat.opacity=sn.op;mat.transparent=sn.tr;mat.alphaTest=sn.at;mat.depthWrite=sn.dw;mat.side=sn.side;
   for(const k of TEXTURE_SLOTS){(mat as unknown as Record<string,unknown>)[SLOT_CONFIG[k].prop]=sn.maps[k];const t=sn.maps[k];if(t&&sn.trs[k])writeTransform(t,sn.trs[k]!);}
   mat.needsUpdate=true;};
  let owned=true;set(next);
  this.push({label:{key:'studio3d.hist.materialPaste',params:{name:o.name}},undo:()=>{set(before);owned=false;},redo:()=>{set(next);owned=true;},
   release:()=>{const drop=owned?before:next;for(const k of TEXTURE_SLOTS){const t=drop.maps[k];if(t?.userData.somniaClone)t.dispose();}}});
 }
 /** Puts a decoded image into a texture slot, or clears the slot with null. The caller has already checked the file; this sets colour space and keeps one undo step. */
 setTexture(id:number,slot:TextureSlot,texture:THREE.Texture|null){
  const o=this.need(id);const mesh=o as THREE.Mesh;
  if(!mesh.isMesh||Array.isArray(mesh.material)||!(mesh.material as THREE.MeshStandardMaterial).isMeshStandardMaterial)throw new StageError(`${o.name} has no editable PBR material.`);
  const cfg=SLOT_CONFIG[slot];if(!cfg)throw new StageError(`Unknown texture slot: ${String(slot)}.`);
  const mat=mesh.material as THREE.MeshStandardMaterial;const before=mat[cfg.prop] as THREE.Texture|null;
  if(texture){texture.colorSpace=cfg.srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.needsUpdate=true;}
  if(before===texture||(!before&&!texture))return;
  const set=(t:THREE.Texture|null)=>{(mat as unknown as Record<string,unknown>)[cfg.prop]=t;mat.needsUpdate=true;};
  let owned=true;set(texture);
  this.push({label:{key:'studio3d.hist.texture',params:{slot,name:o.name}},undo:()=>{set(before);owned=false;},redo:()=>{set(texture);owned=true;},release:()=>{(owned?before:texture)?.dispose();}});
 }
 /** Changes offset, scale or rotation of the image in one slot. One undo step. Several texture slots of one material share nothing, so each is set on its own. */
 setTextureTransform(id:number,slot:TextureSlot,patch:Partial<TextureTransform>|'reset'){
  const o=this.need(id);const mesh=o as THREE.Mesh;const cfg=SLOT_CONFIG[slot];if(!cfg)throw new StageError(`Unknown texture slot: ${String(slot)}.`);
  if(!mesh.isMesh||Array.isArray(mesh.material))throw new StageError(`${o.name} has no editable PBR material.`);
  const tex=(mesh.material as unknown as Record<string,unknown>)[cfg.prop] as THREE.Texture|null;if(!tex)throw new StageError(`The ${slot} slot of ${o.name} has no image.`);
  let next:TextureTransform;try{next=patch==='reset'?{...DEFAULT_TRANSFORM}:mergeTransform(readTransform(tex),patch);}catch(e){if(e instanceof UvError)throw new StageError(e.message);throw e;}
  const before=readTransform(tex);if(JSON.stringify(before)===JSON.stringify(next))return;
  const set=(t:TextureTransform)=>{writeTransform(tex,t);};set(next);
  this.push({label:{key:'studio3d.hist.textureMapping',params:{slot,name:o.name}},undo:()=>set(before),redo:()=>set(next)});
 }
 // ---- Animation clips: keyframe tracks of node transforms. Tracks address nodes by uuid, so any node name works. ----
 // Easing of the authoring keys lives in clip.userData.ease (track name to one easing per key). Playing and exporting use baked copies of the tracks.
 private clipList:THREE.AnimationClip[]=[];
 /** Bumped whenever clips change, so playback knows to rebuild its mixer. */
 clipRevision=0;
 /** Auto-key: where a transform change is recorded. Set by the viewport, null when off. */
 autoKeySource:(()=>{clip:number;time:number}|null)|null=null;
 get clips():readonly THREE.AnimationClip[]{return this.clipList;}
 private easeOf(c:THREE.AnimationClip):Record<string,Ease[]>{return((c.userData as {ease?:Record<string,Ease[]>}).ease??={});}
 private snapClip(c:THREE.AnimationClip):ClipState{const e=this.easeOf(c);return{tracks:c.tracks.slice(),duration:c.duration,ease:Object.fromEntries(Object.entries(e).map(([k,v])=>[k,v.slice()]))};}
 private restoreClip(c:THREE.AnimationClip,v:ClipState){c.tracks=v.tracks;c.duration=v.duration;(c.userData as {ease?:unknown}).ease=Object.fromEntries(Object.entries(v.ease).map(([k,x])=>[k,x.slice()]));this.clipRevision++;}
 /** Replaces the clips with imported ones (no history). Track targets that name a node in the scene are rewritten to its uuid. Metas (from the file's extras) restore the clip length and the easing of the original keys. */
 setClips(list:readonly THREE.AnimationClip[],metas?:readonly (ClipMeta|undefined)[],resolve?:(nodeIndex:number)=>THREE.Object3D|undefined){
  const kept:THREE.AnimationClip[]=[];
  list.forEach((c,idx)=>{
   if(c.duration<=0&&c.tracks.length===0)return;
   for(const t of c.tracks){const b=THREE.PropertyBinding.parseTrackName(t.name);
    if(!b.nodeName||b.objectName||b.propertyIndex!==undefined)continue;const n=THREE.PropertyBinding.findNode(this.root,b.nodeName) as THREE.Object3D|undefined;if(n&&n!==this.root)t.name=`${n.uuid}.${b.propertyName}`;}
   if(c.duration<=0)c.resetDuration();
   const m=metas?.[idx];if(m&&resolve)this.applyMeta(c,m,resolve);
   kept.push(c);
  });
  this.clipList=kept.slice(0,MAX_CLIPS);this.clipRevision++;this.emit();
 }
 /** The baked tracks of a file hold extra samples inside eased segments. Keep only the authoring keys again and restore their easing. A track that does not match its record is left as it is. */
 private applyMeta(c:THREE.AnimationClip,m:ClipMeta,resolve:(i:number)=>THREE.Object3D|undefined){
  const ease=this.easeOf(c);
  for(const mt of m.tracks){
   const node=resolve(mt.node);if(!node)continue;const name=trackName(node.uuid,mt.path);const k=c.tracks.findIndex(t=>t.name===name);if(k<0)continue;
   const t=c.tracks[k];if(!isPlainTrack(t.times,t.values,mt.path))continue;
   const idx=mt.times.map(x=>findKey(t.times,x));if(idx.some(i=>i<0))continue;
   const sz=KEY_STRIDE[mt.path];const times=idx.map(i=>t.times[i]);const values=idx.flatMap(i=>Array.from(t.values.slice(i*sz,i*sz+sz)));
   c.tracks[k]=mt.path==='rotation'?new THREE.QuaternionKeyframeTrack(name,times,values):new THREE.VectorKeyframeTrack(name,times,values);ease[name]=mt.ease.slice();
  }
  if(m.duration!==undefined){const last=Math.max(0,...c.tracks.map(t=>lastKeyTime(t.times)));if(m.duration>=last)c.duration=m.duration;}
 }
 private needClip(i:number):THREE.AnimationClip{const c=Number.isInteger(i)?this.clipList[i]:undefined;if(!c)throw new ClipError(`There is no animation clip ${String(i)}.`);return c;}
 private editClip(i:number,label:HistoryLabel,make:(clip:THREE.AnimationClip)=>ClipState){
  const clip=this.needClip(i);const before=this.snapClip(clip);const next=make(clip);
  this.restoreClip(clip,next);this.push({label,undo:()=>this.restoreClip(clip,before),redo:()=>this.restoreClip(clip,next)});
 }
 private uniqueClipName(base:string){const names=new Set(this.clipList.map(c=>c.name));if(!names.has(base))return base;let n=2;while(names.has(`${base} ${n}`))n++;return `${base} ${n}`;}
 addClip(name?:string,duration=DEFAULT_CLIP_SECONDS):number{
  if(this.clipList.length>=MAX_CLIPS)throw new ClipError(`A scene can have at most ${MAX_CLIPS} clips.`);
  const clip=new THREE.AnimationClip(this.uniqueClipName(name===undefined?'Clip':checkClipName(name)),checkDuration(duration),[]);
  const at=this.clipList.length;const add=()=>{this.clipList.splice(at,0,clip);this.clipRevision++;};add();
  this.push({label:{key:'studio3d.hist.clipAdd',params:{name:clip.name}},undo:()=>{this.clipList.splice(at,1);this.clipRevision++;},redo:add});return at;
 }
 /** Duplicates a clip with all tracks and their easing, right after the original. One undo step. */
 duplicateClip(i:number):number{
  if(this.clipList.length>=MAX_CLIPS)throw new ClipError(`A scene can have at most ${MAX_CLIPS} clips.`);
  const src=this.needClip(i);
  const copy=new THREE.AnimationClip(this.uniqueClipName(`${src.name} copy`),src.duration,src.tracks.map(t=>t.clone()));
  (copy.userData as {ease?:unknown}).ease=Object.fromEntries(Object.entries(this.easeOf(src)).map(([k,v])=>[k,v.slice()]));
  const at=i+1;const add=()=>{this.clipList.splice(at,0,copy);this.clipRevision++;};add();
  this.push({label:{key:'studio3d.hist.clipDuplicate',params:{name:src.name}},undo:()=>{this.clipList.splice(at,1);this.clipRevision++;},redo:add});
  return at;
 }
 removeClip(i:number){
  const clip=this.needClip(i);const del=()=>{this.clipList.splice(i,1);this.clipRevision++;};del();
  this.push({label:{key:'studio3d.hist.clipDelete',params:{name:clip.name}},undo:()=>{this.clipList.splice(i,0,clip);this.clipRevision++;},redo:del});
 }
 renameClip(i:number,name:string){
  const clip=this.needClip(i);const next=checkClipName(name);const before=clip.name;if(next===before)return;
  const set=(n:string)=>{clip.name=n;this.clipRevision++;};set(next);this.push({label:{key:'studio3d.hist.clipRename',params:{name:before}},undo:()=>set(before),redo:()=>set(next)});
 }
 /** Sets the length of a clip. It cannot end before its last key. */
 setClipDuration(i:number,duration:number){
  const clip=this.needClip(i);const d=checkDuration(duration);const last=Math.max(0,...clip.tracks.map(t=>lastKeyTime(t.times)));
  if(d<last)throw new ClipError(`The clip cannot end before its last key at ${last} s.`);
  if(d===clip.duration)return;this.editClip(i,{key:'studio3d.hist.clipLength',params:{name:clip.name}},c=>({...this.snapClip(c),duration:d}));
 }
 private keyNode(id:number):THREE.Object3D{const o=this.need(id);if(o===this.root)throw new ClipError('The scene root cannot be animated.');return o;}
 /** Bones of every skin in the scene, depth-first. The depth indents the bone picker (roots at 0). */
 bones():{id:number;name:string;depth:number}[]{
  const out:{id:number;name:string;depth:number}[]=[];
  const walk=(o:THREE.Object3D,inside:boolean,depth:number)=>{
   for(const c of o.children){const bone=(c as THREE.Bone).isBone;if(bone)out.push({id:c.id,name:c.name||`Bone ${c.id}`,depth:bone?(inside?depth+1:0):depth});walk(c,bone,bone?(inside?depth+1:0):depth);}
  };
  walk(this.root,false,0);return out;
 }
 isBone(id:number):boolean{const o=this.find(id);return !!(o&&(o as THREE.Bone).isBone);}
 /** Resolves a bone or skinned mesh id to the root bone of its rig. */
 private rigOf(id:number):THREE.Bone{
  const o=this.need(id);let b:THREE.Object3D|null=null;
  if((o as THREE.Bone).isBone)b=o;
  else if((o as THREE.SkinnedMesh).isSkinnedMesh)b=(o as THREE.SkinnedMesh).skeleton.bones[0]??null;
  if(!b)throw new PoseError('Select a bone or a skinned mesh first.');
  while(b.parent&&(b.parent as THREE.Bone).isBone)b=b.parent;
  return b as THREE.Bone;
 }
 private poseLib(root:THREE.Bone):Pose[]{let l=this.poseLibs.get(root.id);if(!l){l=[];this.poseLibs.set(root.id,l);}return l;}
 private needPose(root:THREE.Bone,name:string):Pose{const p=this.poseLib(root).find(x=>x.name===name);if(!p)throw new PoseError(`There is no pose named "${name}" on this rig.`);return p;}
 /** Poses of the rig this object belongs to (name and bone count, for the panel). */
 poseList(id:number):{name:string;bones:number}[]{try{return this.poseLib(this.rigOf(id)).map(p=>({name:p.name,bones:Object.keys(p.bones).length}));}catch{return [];}}
 private captureLocals(chain:THREE.Bone[]):PoseBone[]{return chain.map(b=>({p:b.position.toArray() as [number,number,number],q:b.quaternion.toArray() as [number,number,number,number],s:b.scale.toArray() as [number,number,number]}));}
 private restoreLocals(chain:THREE.Bone[],rows:PoseBone[]){chain.forEach((b,i)=>{const r=rows[i];if(!r)return;b.position.fromArray([...r.p]);b.quaternion.fromArray([...r.q]);b.scale.fromArray([...r.s]);});this.root.updateMatrixWorld(true);}
 private applyPoseRecord(chain:THREE.Bone[],bones:Record<string,PoseBone>){for(const b of chain){const r=bones[b.name];if(!r)continue;b.position.fromArray([...r.p]);b.quaternion.fromArray([...r.q]);b.scale.fromArray([...r.s]);}this.root.updateMatrixWorld(true);}
 /** Applies a pose record to the rig as one undo step. */
 private poseSet(id:number,label:HistoryLabel,bones:Record<string,PoseBone>){
  const root=this.rigOf(id);const chain=this.boneChain(root);const before=this.captureLocals(chain);
  this.applyPoseRecord(chain,bones);
  this.push({label,undo:()=>this.restoreLocals(chain,before),redo:()=>this.applyPoseRecord(chain,bones)});this.emit();
 }
 /** Saves the rig's current pose under a name. One undo step. */
 poseSave(id:number,name:string){
  const root=this.rigOf(id);const lib=this.poseLib(root);
  if(lib.length>=MAX_POSES)throw new PoseError(`A rig keeps at most ${MAX_POSES} poses.`);
  const n=checkPoseName(name,lib.map(p=>p.name));
  const chain=this.boneChain(root);const bones:Record<string,PoseBone>={};
  chain.forEach((b,i)=>{bones[b.name]=this.captureLocals(chain)[i];});
  const at=lib.length;lib.push({name:n,bones});
  this.push({label:{key:'studio3d.hist.poseSave',params:{name:n}},undo:()=>{lib.splice(at,1);},redo:()=>{lib.splice(at,0,{name:n,bones});}});this.emit();
 }
 /** Applies a saved pose. One undo step. */
 poseApply(id:number,name:string){const root=this.rigOf(id);this.poseSet(id,{key:'studio3d.hist.poseApply',params:{name}},this.needPose(root,name).bones);}
 /** Applies the L/R mirror of a saved pose (name pairs like Arm.L/Arm.R or LeftArm/RightArm swap). One undo step. */
 poseMirror(id:number,name:string){const root=this.rigOf(id);this.poseSet(id,{key:'studio3d.hist.poseMirror',params:{name}},mirrorPose(this.needPose(root,name)).bones);}
 /** Blends two saved poses (t=0 is a, t=1 is b) and applies the mix. One undo step. */
 poseBlend(id:number,a:string,b:string,t:number){const root=this.rigOf(id);this.poseSet(id,{key:'studio3d.hist.poseBlend',params:{a,b}},blendPoses(this.needPose(root,a),this.needPose(root,b),t).bones);}
 /** Removes a saved pose. One undo step. */
 poseRemove(id:number,name:string){
  const root=this.rigOf(id);const lib=this.poseLib(root);const at=lib.findIndex(p=>p.name===name);
  if(at<0)throw new PoseError(`There is no pose named "${name}" on this rig.`);
  const[gone]=lib.splice(at,1);
  this.push({label:{key:'studio3d.hist.poseRemove',params:{name}},undo:()=>{lib.splice(at,0,gone);},redo:()=>{lib.splice(at,1);}});this.emit();
 }
 /** The three-bone chain starting at root: root, its first bone child, that child's first bone child. */
 private ikChain(rootId:number):{root:THREE.Bone;mid:THREE.Bone;end:THREE.Bone}{
  const o=this.need(rootId) as THREE.Bone;
  if(!o.isBone)throw new IkError('Select a bone to drive an IK chain.');
  const mid=o.children.find(c=>(c as THREE.Bone).isBone) as THREE.Bone|undefined;
  const end=mid?.children.find(c=>(c as THREE.Bone).isBone) as THREE.Bone|undefined;
  if(!mid||!end)throw new IkError(`The bone ${o.name||rootId} does not head a two-bone chain (bone > bone > bone).`);
  return{root:o,mid,end};
 }
 /** True when an active IK chain drives this bone (chain root or mid): FK edits step back. */
 ikDriven(boneId:number):boolean{
  const head=this.ikChainHead(boneId);if(!head)return false;
  const c=this.ikOf(head.id);if(!c||!c.on)return false;
  const{root,mid}=this.ikChain(head.id);return boneId===root.id||boneId===mid.id;
 }
 /** Nearest chain head for any bone in the chain: the bone itself, its parent or its grandparent. */
 ikChainHead(boneId:number):THREE.Bone|null{
  const o=this.find(boneId) as THREE.Bone|null;if(!o||!o.isBone)return null;
  for(let b:THREE.Object3D|null=o;b;b=b.parent){
   if(!(b as THREE.Bone).isBone)return null;
   try{this.ikChain(b.id);return b as THREE.Bone;}catch{/* not a head here */}
  }
  return null;
 }
 private ikOf(rootId:number){return this.ikChains.get(rootId)??null;}
 /** IK state of the chain rooted here, or null when the bone does not head a chain. */
 ikState(rootId:number):{on:boolean;target:[number,number,number];pole:[number,number,number]}|null{
  try{this.ikChain(rootId);}catch{return null;}
  const c=this.ikOf(rootId);
  if(!c)return{on:false,target:[0,0,0],pole:[0,0,0]};
  return{on:c.on,target:c.target.toArray() as [number,number,number],pole:c.pole.toArray() as [number,number,number]};
 }
 /** FK -> IK snaps the target to the current end effector and the pole behind the current bend, so the pose does not move. IK -> FK keeps the solved pose as the new FK pose. One undo step. */
 ikToggle(rootId:number,on:boolean){
  const{root,mid,end}=this.ikChain(rootId);
  const before=this.ikOf(rootId);
  if(on&&this.ikChains.size>=MAX_IK_CHAINS&&(!before||!before.on))throw new IkError(`At most ${MAX_IK_CHAINS} IK chains.`);
  this.root.updateMatrixWorld(true);
  let next:{on:boolean;target:THREE.Vector3;pole:THREE.Vector3}|null=null;
  if(on){
   const r=root.getWorldPosition(new THREE.Vector3()),m=mid.getWorldPosition(new THREE.Vector3()),e=end.getWorldPosition(new THREE.Vector3());
   const dir=e.clone().sub(r).normalize();let side=m.clone().sub(r).sub(dir.clone().multiplyScalar(m.clone().sub(r).dot(dir)));
   if(side.lengthSq()<1e-12)side=new THREE.Vector3(0,0,1).sub(dir.clone().multiplyScalar(dir.z));
   side.normalize();
   const pole=m.clone().add(side.multiplyScalar(r.distanceTo(m)+m.distanceTo(e)));
   next={on:true,target:e.clone(),pole};
  }
  if(next)this.ikChains.set(root.id,next);else this.ikChains.delete(root.id);
  this.push({label:{key:on?'studio3d.hist.ikOn':'studio3d.hist.fk',params:{name:root.name}},
   undo:()=>{if(before)this.ikChains.set(root.id,{...before,target:before.target.clone(),pole:before.pole.clone()});else this.ikChains.delete(root.id);},
   redo:()=>{if(next)this.ikChains.set(root.id,{...next,target:next.target.clone(),pole:next.pole.clone()});else this.ikChains.delete(root.id);}});
  this.emit();
 }
 /** Solves the chain onto its current target and applies the rotations (with joint limits). No undo: the caller owns the step. */
 private ikSolve(root:THREE.Bone,mid:THREE.Bone,end:THREE.Bone,c:{target:THREE.Vector3;pole:THREE.Vector3}){
  this.root.updateMatrixWorld(true);
  const r=root.getWorldPosition(new THREE.Vector3()),m=mid.getWorldPosition(new THREE.Vector3()),e=end.getWorldPosition(new THREE.Vector3());
  const s=solveTwoBone([r.x,r.y,r.z],r.distanceTo(m),m.distanceTo(e),[c.target.x,c.target.y,c.target.z],[c.pole.x,c.pole.y,c.pole.z]);
  // Aim the root so the mid lands on the solved direction.
  const old1=m.clone().sub(r).normalize();const q1=new THREE.Quaternion().setFromUnitVectors(old1,new THREE.Vector3(...s.dirMid));
  const pw1=new THREE.Quaternion();(root.parent as THREE.Object3D).getWorldQuaternion(pw1);
  root.quaternion.copy(pw1.clone().invert().multiply(q1).multiply(root.getWorldQuaternion(new THREE.Quaternion())));
  this.root.updateMatrixWorld(true);
  // Aim the mid so the end lands on the solved end point.
  const m2=mid.getWorldPosition(new THREE.Vector3()),e2=end.getWorldPosition(new THREE.Vector3());
  const old2=e2.clone().sub(m2).normalize();const want2=new THREE.Vector3(s.end[0]-m2.x,s.end[1]-m2.y,s.end[2]-m2.z).normalize();
  const q2=new THREE.Quaternion().setFromUnitVectors(old2,want2);
  const pw2=new THREE.Quaternion();(mid.parent as THREE.Object3D).getWorldQuaternion(pw2);
  mid.quaternion.copy(pw2.clone().invert().multiply(q2).multiply(mid.getWorldQuaternion(new THREE.Quaternion())));
  this.root.updateMatrixWorld(true);
  for(const b of[root,mid])this.clampBone(b);
 }
 /** Clamps a bone's local Euler rotation into its limits, if any. Returns true when it changed. */
 private clampBone(b:THREE.Bone):boolean{
  const l=this.boneLimits.get(b.uuid);if(!hasLimits(l))return false;
  const c=clampEuler([b.rotation.x,b.rotation.y,b.rotation.z],l!);
  if(c[0]===b.rotation.x&&c[1]===b.rotation.y&&c[2]===b.rotation.z)return false;
  b.rotation.set(c[0],c[1],c[2]);this.root.updateMatrixWorld(true);return true;
 }
 /** Snapshot of a chain's pose plus IK state; the drag commit turns it into one undo entry. */
 ikBegin(rootId:number){const{root}=this.ikChain(rootId);const chain=this.boneChain(root);const c=this.ikOf(rootId);return{chain,rows:this.captureLocals(chain),ik:c?{target:c.target.clone(),pole:c.pole.clone()}:null};}
 /** Live target/pole moves during a drag: solve without an undo entry. */
 ikDragTarget(rootId:number,p:readonly[number,number,number]){const{root,mid,end}=this.ikChain(rootId);const c=this.ikOf(rootId);if(!c||!c.on)throw new IkError('IK is off for this chain.');c.target.set(p[0],p[1],p[2]);this.ikSolve(root,mid,end,c);this.emit();}
 ikDragPole(rootId:number,p:readonly[number,number,number]){const{root,mid,end}=this.ikChain(rootId);const c=this.ikOf(rootId);if(!c||!c.on)throw new IkError('IK is off for this chain.');c.pole.set(p[0],p[1],p[2]);this.ikSolve(root,mid,end,c);this.emit();}
 /** Closes a drag or a command move as one undo step. */
 ikCommit(rootId:number,before:{chain:THREE.Bone[];rows:{p:readonly[number,number,number];q:readonly[number,number,number,number];s:readonly[number,number,number]}[];ik:{target:THREE.Vector3;pole:THREE.Vector3}|null},label:HistoryLabel){
  const{root,mid,end}=this.ikChain(rootId);const after=this.ikBegin(rootId);
  this.push({label,
   undo:()=>{this.restoreLocals(before.chain,before.rows);const c=this.ikOf(rootId);if(c&&before.ik){c.target.copy(before.ik.target);c.pole.copy(before.ik.pole);}},
   redo:()=>{this.restoreLocals(after.chain,after.rows);const c=this.ikOf(rootId);if(c&&after.ik){c.target.copy(after.ik.target);c.pole.copy(after.ik.pole);}}});
  void mid;void end;this.emit();
 }
 /** Command path: move the target (and solve) as one undo step. */
 ikSetTarget(rootId:number,p:readonly[number,number,number]){const before=this.ikBegin(rootId);this.ikDragTarget(rootId,p);this.ikCommit(rootId,before,{key:'studio3d.hist.ikTarget'});}
 ikSetPole(rootId:number,p:readonly[number,number,number]){const before=this.ikBegin(rootId);this.ikDragPole(rootId,p);this.ikCommit(rootId,before,{key:'studio3d.hist.ikPole'});}
 /** The joint chain starting at root for FABRIK: root plus first-bone-child walks, 3..8 segments. */
 private fabrikChainOf(rootId:number):THREE.Bone[]{
  const o=this.need(rootId) as THREE.Bone;
  if(!o.isBone)throw new IkError('Select a bone to drive a FABRIK chain.');
  const chain:THREE.Bone[]=[o];
  for(let b=o;;){const c=b.children.find(k=>(k as THREE.Bone).isBone) as THREE.Bone|undefined;if(!c)break;chain.push(c);b=c;}
  const segments=chain.length-1;
  if(segments<MIN_FABRIK_SEGMENTS||segments>MAX_FABRIK_SEGMENTS)throw new IkError(`The bone ${o.name||rootId} does not head a chain of ${MIN_FABRIK_SEGMENTS}..${MAX_FABRIK_SEGMENTS} segments (it has ${segments}). Two-segment chains use the two-bone IK.`);
  return chain;
 }
 /** Nearest FABRIK head for any bone in a 3+ segment chain: the bone itself or an ancestor; an active chain wins over a nearer inactive one. */
 fabrikChainHead(boneId:number):THREE.Bone|null{
  const o=this.find(boneId) as THREE.Bone|null;if(!o||!o.isBone)return null;
  let first:THREE.Bone|null=null;
  for(let b:THREE.Object3D|null=o;b;b=b.parent){
   if(!(b as THREE.Bone).isBone)return first;
   try{this.fabrikChainOf(b.id);}catch{continue;}
   if(this.fabrikOf(b.id)?.on)return b as THREE.Bone;
   first??=b as THREE.Bone;
  }
  return first;
 }
 private fabrikOf(rootId:number){return this.fabrikChains.get(rootId)??null;}
 /** True when an active FABRIK chain drives this bone: every chain joint except the end, plus the end while look-at is on. FK edits step back. */
 fabrikDriven(boneId:number):boolean{
  for(const[rid,c]of this.fabrikChains){
   if(!c.on)continue;
   let chain:THREE.Bone[];try{chain=this.fabrikChainOf(rid);}catch{continue;}
   const at=chain.findIndex(b=>b.id===boneId);
   if(at>=0)return at<chain.length-1||c.look.on;
  }
  return false;
 }
 /** FABRIK state of the chain rooted here, or null when the bone does not head a 3+ segment chain. */
 fabrikState(rootId:number):{on:boolean;target:[number,number,number];look:{on:boolean;target:[number,number,number]}}|null{
  try{this.fabrikChainOf(rootId);}catch{return null;}
  const c=this.fabrikOf(rootId);
  if(!c)return{on:false,target:[0,0,0],look:{on:false,target:[0,0,0]}};
  return{on:c.on,target:c.target.toArray() as [number,number,number],look:{on:c.look.on,target:c.look.target.toArray() as [number,number,number]}};
 }
 /** FK -> FABRIK snaps the target to the current end effector (and the look target just past it), so the pose does not move. FABRIK -> FK keeps the solved pose. One undo step. */
 fabrikToggle(rootId:number,on:boolean){
  const chain=this.fabrikChainOf(rootId);const root=chain[0];const end=chain[chain.length-1];
  const before=this.fabrikOf(rootId);
  if(on&&this.fabrikChains.size>=MAX_IK_CHAINS&&(!before||!before.on))throw new IkError(`At most ${MAX_IK_CHAINS} FABRIK chains.`);
  this.root.updateMatrixWorld(true);
  let next:{on:boolean;target:THREE.Vector3;look:{on:boolean;target:THREE.Vector3}}|null=null;
  if(on){
   const e=end.getWorldPosition(new THREE.Vector3());
   const dir=new THREE.Vector3(0,1,0).applyQuaternion(end.getWorldQuaternion(new THREE.Quaternion()));
   next={on:true,target:e.clone(),look:{on:false,target:e.clone().add(dir.multiplyScalar(1))}};
  }
  if(next)this.fabrikChains.set(root.id,next);else this.fabrikChains.delete(root.id);
  this.push({label:{key:on?'studio3d.hist.fabrikOn':'studio3d.hist.fk',params:{name:root.name}},
   undo:()=>{if(before)this.fabrikChains.set(root.id,{...before,target:before.target.clone(),look:{...before.look,target:before.look.target.clone()}});else this.fabrikChains.delete(root.id);},
   redo:()=>{if(next)this.fabrikChains.set(root.id,{...next,target:next.target.clone(),look:{...next.look,target:next.look.target.clone()}});else this.fabrikChains.delete(root.id);}});
  this.emit();
 }
 /** Aims a bone so its child lands on the solved direction, then clamps it into its joint limits. */
 private fabrikAim(bone:THREE.Bone,childPos:THREE.Vector3,want:THREE.Vector3){
  const p=bone.getWorldPosition(new THREE.Vector3());
  const old=childPos.clone().sub(p).normalize();
  const q=new THREE.Quaternion().setFromUnitVectors(old,want.clone().sub(p).normalize());
  const pw=new THREE.Quaternion();(bone.parent as THREE.Object3D).getWorldQuaternion(pw);
  bone.quaternion.copy(pw.clone().invert().multiply(q).multiply(bone.getWorldQuaternion(new THREE.Quaternion())));
  this.root.updateMatrixWorld(true);
  this.clampBone(bone);
 }
 /** Solves the chain onto its current target and applies the rotations root to leaf (with joint limits), then the optional look-at on the end bone. No undo: the caller owns the step. */
 private fabrikSolveChain(chain:THREE.Bone[],c:{target:THREE.Vector3;look:{on:boolean;target:THREE.Vector3}}){
  this.root.updateMatrixWorld(true);
  const joints=chain.map(b=>b.getWorldPosition(new THREE.Vector3()));
  const lengths:number[]=[];
  for(let i=0;i+1<chain.length;i++)lengths.push(joints[i].distanceTo(joints[i+1]));
  const solved=fabrikSolve(joints.map(j=>[j.x,j.y,j.z] as [number,number,number]),lengths,[c.target.x,c.target.y,c.target.z]);
  for(let i=0;i+1<chain.length;i++){
   const cur=chain[i+1].getWorldPosition(new THREE.Vector3());
   this.fabrikAim(chain[i],cur,new THREE.Vector3(...solved[i+1]));
  }
  if(c.look.on){
   const end=chain[chain.length-1];
   const e=end.getWorldPosition(new THREE.Vector3());
   const dir=c.look.target.clone().sub(e);
   if(dir.lengthSq()>1e-12){
    const up=new THREE.Vector3(0,0,1).applyQuaternion(end.getWorldQuaternion(new THREE.Quaternion()));
    const[x,y,z]=aimBasis([dir.x,dir.y,dir.z],[up.x,up.y,up.z]);
    const m=new THREE.Matrix4().makeBasis(new THREE.Vector3(...x),new THREE.Vector3(...y),new THREE.Vector3(...z));
    const q=new THREE.Quaternion().setFromRotationMatrix(m);
    const pw=new THREE.Quaternion();(end.parent as THREE.Object3D).getWorldQuaternion(pw);
    end.quaternion.copy(pw.clone().invert().multiply(q));
    this.root.updateMatrixWorld(true);
    this.clampBone(end);
   }
  }
 }
 /** Snapshot of a chain's pose plus FABRIK state; the drag commit turns it into one undo entry. */
 fabrikBegin(rootId:number){const chain=this.fabrikChainOf(rootId);const c=this.fabrikOf(rootId);return{chain,rows:this.captureLocals(chain),fabrik:c?{target:c.target.clone(),look:{on:c.look.on,target:c.look.target.clone()}}:null};}
 /** Live target/look moves during a drag: solve without an undo entry. */
 fabrikDragTarget(rootId:number,p:readonly[number,number,number]){const chain=this.fabrikChainOf(rootId);const c=this.fabrikOf(rootId);if(!c||!c.on)throw new IkError('FABRIK is off for this chain.');c.target.set(p[0],p[1],p[2]);this.fabrikSolveChain(chain,c);this.emit();}
 fabrikDragLook(rootId:number,p:readonly[number,number,number]){const chain=this.fabrikChainOf(rootId);const c=this.fabrikOf(rootId);if(!c||!c.on||!c.look.on)throw new IkError('Look-at is off for this chain.');c.look.target.set(p[0],p[1],p[2]);this.fabrikSolveChain(chain,c);this.emit();}
 /** Closes a drag or a command move as one undo step. */
 fabrikCommit(rootId:number,before:{chain:THREE.Bone[];rows:{p:readonly[number,number,number];q:readonly[number,number,number,number];s:readonly[number,number,number]}[];fabrik:{target:THREE.Vector3;look:{on:boolean;target:THREE.Vector3}}|null},label:HistoryLabel){
  const after=this.fabrikBegin(rootId);
  this.push({label,
   undo:()=>{this.restoreLocals(before.chain,before.rows);const c=this.fabrikOf(rootId);if(c&&before.fabrik){c.target.copy(before.fabrik.target);c.look.on=before.fabrik.look.on;c.look.target.copy(before.fabrik.look.target);}},
   redo:()=>{this.restoreLocals(after.chain,after.rows);const c=this.fabrikOf(rootId);if(c&&after.fabrik){c.target.copy(after.fabrik.target);c.look.on=after.fabrik.look.on;c.look.target.copy(after.fabrik.look.target);}}});
  this.emit();
 }
 /** Command path: move the target (and solve) as one undo step. */
 fabrikSetTarget(rootId:number,p:readonly[number,number,number]){const before=this.fabrikBegin(rootId);this.fabrikDragTarget(rootId,p);this.fabrikCommit(rootId,before,{key:'studio3d.hist.fabrikTarget'});}
 /** Command path: move the look target (and solve) as one undo step. */
 fabrikSetLook(rootId:number,p:readonly[number,number,number]){const before=this.fabrikBegin(rootId);this.fabrikDragLook(rootId,p);this.fabrikCommit(rootId,before,{key:'studio3d.hist.fabrikLook'});}
 /** Toggles the look-at constraint of an active chain. One undo step. */
 fabrikLookToggle(rootId:number,on:boolean){
  const chain=this.fabrikChainOf(rootId);const c=this.fabrikOf(rootId);
  if(!c||!c.on)throw new IkError('FABRIK is off for this chain.');
  const before={on:c.look.on,target:c.look.target.clone()};
  if(on&&!before.on){
   const end=chain[chain.length-1];this.root.updateMatrixWorld(true);
   const e=end.getWorldPosition(new THREE.Vector3());
   const dir=new THREE.Vector3(0,1,0).applyQuaternion(end.getWorldQuaternion(new THREE.Quaternion()));
   c.look.target.copy(e.clone().add(dir));
  }
  const rowsB=this.captureLocals(chain);
  c.look.on=on;if(on)this.fabrikSolveChain(chain,c);
  const rowsA=this.captureLocals(chain);
  const after={on,target:c.look.target.clone()};
  this.push({label:{key:on?'studio3d.hist.lookAtOn':'studio3d.hist.lookAtOff'},
   undo:()=>{const k=this.fabrikOf(rootId);if(k){k.look.on=before.on;k.look.target.copy(before.target);}this.restoreLocals(chain,rowsB);},
   redo:()=>{const k=this.fabrikOf(rootId);if(k){k.look.on=after.on;k.look.target.copy(after.target);}this.restoreLocals(chain,rowsA);}});
  this.emit();
 }
 /** Joint limits of a bone in degrees, or null when unlimited. */
 boneLimitsOf(id:number):{min:[number,number,number];max:[number,number,number]}|null{
  const o=this.find(id) as THREE.Bone|null;if(!o||!o.isBone)return null;
  const l=this.boneLimits.get(o.uuid);if(!hasLimits(l))return null;
  const d=(v:readonly[number,number,number])=>v.map(x=>Number.isNaN(x)?x:THREE.MathUtils.radToDeg(x)) as [number,number,number];
  return{min:d(l!.min),max:d(l!.max)};
 }
 /** Sets or clears joint limits (degrees; NaN keeps an axis open). One undo step. */
 setBoneLimits(id:number,min:readonly[number,number,number]|null,max:readonly[number,number,number]|null){
  const o=this.need(id) as THREE.Bone;if(!o.isBone)throw new IkError('Joint limits live on bones.');
  const rad=(v:readonly[number,number,number])=>v.map(x=>Number.isNaN(x)?x:THREE.MathUtils.degToRad(x)) as [number,number,number];
  const next=checkLimits(rad(min??[Number.NaN,Number.NaN,Number.NaN]),rad(max??[Number.NaN,Number.NaN,Number.NaN]));
  const before=this.boneLimits.get(o.uuid)??null;
  if(hasLimits(next))this.boneLimits.set(o.uuid,next);else this.boneLimits.delete(o.uuid);
  const rowsB=this.captureLocals([o]);this.clampBone(o);const rowsA=this.captureLocals([o]);
  this.push({label:{key:'studio3d.hist.limits',params:{name:o.name}},
   undo:()=>{if(before)this.boneLimits.set(o.uuid,before);else this.boneLimits.delete(o.uuid);this.restoreLocals([o],rowsB);},
   redo:()=>{if(hasLimits(next))this.boneLimits.set(o.uuid,next);else this.boneLimits.delete(o.uuid);this.restoreLocals([o],rowsA);}});
  this.emit();
 }
 /** Only rotation keys can be authored on bones. Tracks that a file already carries (translation, scale) still play and export, but are not key-editable here. */
 private keyPathFor(node:THREE.Object3D,path:KeyPath){
  if((node as THREE.Bone).isBone&&path!=='rotation')throw new ClipError('Bones take rotation keys only.');
 }
 private trackOf(clip:THREE.AnimationClip,node:THREE.Object3D,path:KeyPath){const n=trackName(node.uuid,path);return clip.tracks.find(t=>t.name===n);}
 private makeTrack(name:string,path:KeyPath,times:number[],values:number[],interp?:THREE.InterpolationModes){return path==='rotation'?new THREE.QuaternionKeyframeTrack(name,times,values,interp):new THREE.VectorKeyframeTrack(name,times,values,interp);}
 /** The clip state after putting a key on one path of a node. Used by setKey and by auto-key. */
 private withKey(clip:THREE.AnimationClip,node:THREE.Object3D,path:KeyPath,t:number,v:number[]):{state:ClipState;replaced:boolean}{
  const old=this.trackOf(clip,node,path);
  if(old&&!isPlainTrack(old.times,old.values,path))throw new ClipError('This track uses cubic spline keys and cannot be edited key by key.');
  const r=insertKey(old?old.times:[],old?old.values:[],path,t,v);const name=trackName(node.uuid,path);const base=this.snapClip(clip);
  const eases=(base.ease[name]??[]).slice();while(eases.length<(old?old.times.length:0))eases.push('linear');
  if(!r.replaced)eases.splice(r.times.indexOf(t)>=0?r.times.indexOf(t):eases.length,0,'linear');
  base.ease[name]=eases;
  return{state:{tracks:[...base.tracks.filter(x=>x.name!==name),this.makeTrack(name,path,r.times,r.values,old?.getInterpolation())],duration:Math.max(base.duration,t),ease:base.ease},replaced:r.replaced};
 }
 private valueOf(node:THREE.Object3D,path:KeyPath,value?:Partial<Vec3>):number[]{
  if(value===undefined)return path==='position'?node.position.toArray():path==='scale'?node.scale.toArray():node.quaternion.toArray();
  const cur=path==='position'?node.position:path==='scale'?node.scale:null;
  const x=value.x??(cur?cur.x:0),y=value.y??(cur?cur.y:0),z=value.z??(cur?cur.z:0);
  if(![x,y,z].every(Number.isFinite))throw new ClipError('The key value must be finite numbers.');
  return path==='rotation'?new THREE.Quaternion().setFromEuler(new THREE.Euler(x*DEG,y*DEG,z*DEG)).toArray():[x,y,z];
 }
 /** Adds or replaces a key on the position, rotation or scale of an object. Without a value the current transform of the object is recorded. One undo step. A key after the end extends the clip. */
 setKey(i:number,id:number,path:KeyPath,time:number,value?:Partial<Vec3>){
  if(!KEY_PATHS.includes(path))throw new ClipError('The path must be position, rotation or scale.');
  const clip=this.needClip(i);const node=this.keyNode(id);this.keyPathFor(node,path);const t=checkKeyTime(time);
  const r=this.withKey(clip,node,path,t,this.valueOf(node,path,value));
  this.editClip(i,{key:r.replaced?'studio3d.hist.keyChange':'studio3d.hist.keyAdd',params:{path,name:node.name}},()=>r.state);
 }
 /** Records the current pose of bones as rotation keys at a time in a clip - a keyframe pose on the timeline. One undo step for the whole record, however many bones. Returns the number of keys written. A key after the end extends the clip. */
 recordPose(i:number,time:number,ids:number[]):number{
  const clip=this.needClip(i);const t=checkKeyTime(time);
  const bones=[...new Set(ids)].map(id=>{const o=this.need(id) as THREE.Bone;if(!o.isBone)throw new ClipError('A pose records on bones only.');return o;});
  if(!bones.length)throw new ClipError('Select at least one bone to record.');
  const was=this.snapClip(clip);let cur=was;
  try{for(const b of bones){this.restoreClip(clip,cur);cur=this.withKey(clip,b,'rotation',t,b.quaternion.toArray()).state;}}
  catch(e){this.restoreClip(clip,was);throw e;}
  this.restoreClip(clip,cur);
  this.push({label:{key:'studio3d.hist.recordPose',params:{time:Math.round(t*1000)/1000}},undo:()=>this.restoreClip(clip,was),redo:()=>this.restoreClip(clip,cur)});
  this.emit();return bones.length;
 }
 /** Evaluates every track of a clip at a time (clamped): node uuid -> local transform parts. The review tools (onion skin, motion path, retarget) read poses through this and never touch the scene. */
 poseAt(i:number,time:number):Map<string,{p?:[number,number,number];q?:[number,number,number,number];s?:[number,number,number]}>{
  const clip=this.needClip(i);const t=Math.min(Math.max(time,0),clip.duration);
  const out=new Map<string,{p?:[number,number,number];q?:[number,number,number,number];s?:[number,number,number]}>();
  for(const tr of clip.tracks){
   const parsed=parseTrackName(tr.name);if(!parsed)continue;
   const v=Array.from(trackInterpolant(tr).evaluate(t));
   const slot=out.get(parsed.node)??{};out.set(parsed.node,slot);
   if(parsed.path==='position')slot.p=v as [number,number,number];
   else if(parsed.path==='rotation')slot.q=v as [number,number,number,number];
   else slot.s=v as [number,number,number];
  }
  return out;
 }
 /** Local rest rotations of a rig's bones from the bind matrices of the skinned mesh that owns the rig (same recipe as the bind-pose reset; empty when the rig drives no skinned mesh, callers then fall back to the current locals). */
 private rigRestQuats(root:THREE.Bone):Map<string,THREE.Quaternion>{
  const out=new Map<string,THREE.Quaternion>();
  let skeleton:THREE.Skeleton|undefined;
  this.root.traverse(o=>{const m=o as THREE.SkinnedMesh;if(!skeleton&&m.isSkinnedMesh&&m.skeleton.bones.includes(root))skeleton=m.skeleton;});
  if(!skeleton)return out;
  const bones=skeleton.bones,bindWorld=skeleton.boneInverses.map(m=>m.clone().invert());
  const chain=new Set(this.boneChain(root).map(b=>b.uuid));
  bones.forEach((b,i)=>{
   if(!chain.has(b.uuid))return;
   const pi=bones.indexOf(b.parent as THREE.Bone);
   const parentWorld=pi>=0?bindWorld[pi]:(b.parent?b.parent.matrixWorld:new THREE.Matrix4());
   const q=new THREE.Quaternion();
   parentWorld.clone().invert().multiply(bindWorld[i]).decompose(new THREE.Vector3(),q,new THREE.Vector3());
   out.set(b.uuid,q);
  });
  return out;
 }
 /** Bone pairs of a retarget between two rigs, matched by name. Throws when the rigs are the same or nothing maps. */
 retargetMap(sourceId:number,targetId:number):{pairs:{source:THREE.Bone;target:THREE.Bone}[];unmatchedSource:string[];unmatchedTarget:string[]}{
  const src=this.rigOf(sourceId),dst=this.rigOf(targetId);
  if(src.id===dst.id)throw new RetargetError('Source and target are the same rig.');
  const srcBones=this.boneChain(src),dstBones=this.boneChain(dst);
  const m=mapBoneNames(srcBones.map(b=>b.name),dstBones.map(b=>b.name));
  if(!m.pairs.length)throw new RetargetError('No bone names match between the two rigs.');
  const srcByName=new Map(srcBones.map(b=>[b.name,b])),dstByName=new Map(dstBones.map(b=>[b.name,b]));
  return{pairs:m.pairs.map(p=>({source:srcByName.get(p.source)!,target:dstByName.get(p.target)!})),unmatchedSource:m.unmatchedSource,unmatchedTarget:m.unmatchedTarget};
 }
 /** Retargeted local rotation of one pair: the source's rotation away from its rest pose, applied on top of the target's rest pose. */
 private retargetDelta(pair:{source:THREE.Bone;target:THREE.Bone},srcRest:Map<string,THREE.Quaternion>,dstRest:Map<string,THREE.Quaternion>,srcLocal:THREE.Quaternion):THREE.Quaternion{
  const rs=srcRest.get(pair.source.uuid)??pair.source.quaternion;
  const rd=dstRest.get(pair.target.uuid)??pair.target.quaternion;
  return rd.clone().multiply(rs.clone().invert()).multiply(srcLocal);
 }
 /** Poses the target rig with the retargeted pose of a clip at a time. One undo step. Returns the number of mapped bones. */
 retargetPreview(sourceId:number,targetId:number,i:number,time:number):number{
  this.needClip(i);const map=this.retargetMap(sourceId,targetId);
  const src=this.rigOf(sourceId),dst=this.rigOf(targetId);
  const srcRest=this.rigRestQuats(src),dstRest=this.rigRestQuats(dst);
  const pose=this.poseAt(i,time);
  const chain=this.boneChain(dst);const before=this.captureLocals(chain);
  for(const p of map.pairs){
   const srcLocal=pose.get(p.source.uuid)?.q;
   const q=srcLocal?this.retargetDelta(p,srcRest,dstRest,new THREE.Quaternion(...srcLocal)):dstRest.get(p.target.uuid);
   if(q)p.target.quaternion.copy(q);
  }
  this.root.updateMatrixWorld(true);const after=this.captureLocals(chain);
  this.push({label:{key:'studio3d.hist.retarget'},undo:()=>this.restoreLocals(chain,before),redo:()=>this.restoreLocals(chain,after)});
  this.emit();return map.pairs.length;
 }
 /** Bakes a clip retargeted onto the target rig as a new clip with quaternion tracks on the mapped target bones. One undo step. Returns the new clip index. */
 retargetApply(sourceId:number,targetId:number,i:number,name?:string):number{
  if(this.clipList.length>=MAX_CLIPS)throw new ClipError(`A scene can have at most ${MAX_CLIPS} clips.`);
  const clip=this.needClip(i);const map=this.retargetMap(sourceId,targetId);
  const src=this.rigOf(sourceId),dst=this.rigOf(targetId);
  const srcRest=this.rigRestQuats(src),dstRest=this.rigRestQuats(dst);
  // Sample at the union of the mapped source key times plus both ends, capped.
  const times=new Set<number>([0,clip.duration]);
  for(const p of map.pairs){const tr=clip.tracks.find(t=>t.name===trackName(p.source.uuid,'rotation'));if(tr)for(const t of Array.from(tr.times))times.add(Math.min(Math.max(t,0),clip.duration));}
  let samples=[...times].sort((a,b)=>a-b);
  if(samples.length>MAX_RETARGET_SAMPLES)samples=Array.from({length:MAX_RETARGET_SAMPLES},(_,k)=>clip.duration*k/(MAX_RETARGET_SAMPLES-1));
  const tracks:THREE.QuaternionKeyframeTrack[]=[];
  for(const p of map.pairs){
   const tr=clip.tracks.find(t=>t.name===trackName(p.source.uuid,'rotation'));
   if(!tr)continue; // No source motion on this bone: the target keeps its rest pose.
   const it=trackInterpolant(tr);const values:number[]=[];
   for(const t of samples){const v=it.evaluate(Math.min(t,clip.duration));const q=this.retargetDelta(p,srcRest,dstRest,new THREE.Quaternion(v[0],v[1],v[2],v[3]));values.push(q.x,q.y,q.z,q.w);}
   tracks.push(new THREE.QuaternionKeyframeTrack(trackName(p.target.uuid,'rotation'),samples,values));
  }
  if(!tracks.length)throw new ClipError(`Clip ${clip.name} has no rotation keys on the mapped source bones.`);
  const made=new THREE.AnimationClip(this.uniqueClipName(name===undefined?retargetClipName(clip.name):checkClipName(name)),clip.duration,tracks);
  const at=this.clipList.length;const add=()=>{this.clipList.splice(at,0,made);this.clipRevision++;};add();
  this.push({label:{key:'studio3d.hist.clipAdd',params:{name:made.name}},undo:()=>{this.clipList.splice(at,1);this.clipRevision++;},redo:add});this.emit();
  return at;
 }
 /** World positions of a bone across a clip, sampled evenly: the motion path polyline. */
 motionPathOf(boneId:number,i:number,samples=64):[number,number,number][]{
  const clip=this.needClip(i);const n=Math.min(Math.max(Math.floor(samples),2),256);
  const o=this.need(boneId) as THREE.Bone;if(!o.isBone)throw new ClipError('A motion path follows a bone.');
  const chain:THREE.Object3D[]=[];for(let b:THREE.Object3D|null=o;b&&b!==this.root;b=b.parent)chain.unshift(b);
  const out:[number,number,number][]=[];
  const m=new THREE.Matrix4(),lm=new THREE.Matrix4();
  for(let k=0;k<n;k++){
   const pose=this.poseAt(i,clip.duration*k/(n-1));
   m.identity();
   for(const node of chain){
    const t=pose.get(node.uuid);
    lm.compose(t?.p?new THREE.Vector3(...t.p):node.position,t?.q?new THREE.Quaternion(...t.q):node.quaternion,t?.s?new THREE.Vector3(...t.s):node.scale);
    m.multiply(lm);
   }
   out.push([m.elements[12],m.elements[13],m.elements[14]]);
  }
  return out;
 }
 removeKey(i:number,id:number,path:KeyPath,time:number){
  const clip=this.needClip(i);const node=this.keyNode(id);this.keyPathFor(node,path);const t=checkKeyTime(time);const old=this.trackOf(clip,node,path);
  if(!old||!isPlainTrack(old.times,old.values,path))throw new ClipError(`${node.name} has no ${path} keys in this clip.`);
  const k=findKey(old.times,t);if(k<0)throw new ClipError('There is no key at that time.');
  const r=removeKeyData(old.times,old.values,path,k);const name=trackName(node.uuid,path);
  this.editClip(i,{key:'studio3d.hist.keyRemove',params:{path,name:node.name}},c=>{
   const base=this.snapClip(c);const rest=base.tracks.filter(x=>x.name!==name);const eases=(base.ease[name]??[]).slice();eases.splice(k,1);
   if(!r.times.length){delete base.ease[name];return{...base,tracks:rest};}
   base.ease[name]=eases;return{...base,tracks:[...rest,this.makeTrack(name,path,r.times,r.values,old.getInterpolation())]};
  });
 }
 /** Moves a key to another time (its value and easing go with it). One undo step. A key may not land on another key. */
 moveKey(i:number,id:number,path:KeyPath,from:number,to:number){
  const clip=this.needClip(i);const node=this.keyNode(id);this.keyPathFor(node,path);const f=checkKeyTime(from),t=checkKeyTime(to);const old=this.trackOf(clip,node,path);
  if(!old||!isPlainTrack(old.times,old.values,path))throw new ClipError(`${node.name} has no ${path} keys in this clip.`);
  const k=findKey(old.times,f);if(k<0)throw new ClipError('There is no key at that time.');
  if(Math.abs(f-t)<0.0005)return;if(findKey(old.times,t)>=0)throw new ClipError('There is already a key at that time.');
  const sz=KEY_STRIDE[path];const name=trackName(node.uuid,path);const value=Array.from(old.values.slice(k*sz,k*sz+sz));
  const eases=(this.easeOf(clip)[name]??[]).slice();while(eases.length<old.times.length)eases.push('linear');const e=eases[k];
  const gone=removeKeyData(old.times,old.values,path,k);const ins=insertKey(gone.times,gone.values,path,t,value);
  const ne=eases.slice();ne.splice(k,1);ne.splice(ins.times.indexOf(t),0,e);
  this.editClip(i,{key:'studio3d.hist.keyMove',params:{path,name:node.name}},c=>{const base=this.snapClip(c);base.ease[name]=ne;return{...base,tracks:[...base.tracks.filter(x=>x.name!==name),this.makeTrack(name,path,ins.times,ins.values,old.getInterpolation())],duration:Math.max(base.duration,t)};});
 }
 /** Editable data of one track, with the easing padded to one entry per key. */
 private dataOf(clip:THREE.AnimationClip,node:THREE.Object3D,path:KeyPath):{name:string;track:THREE.KeyframeTrack;data:TrackData}{
  const t=this.trackOf(clip,node,path);
  if(!t)throw new ClipError(`${node.name} has no ${path} keys in this clip.`);
  if(!isPlainTrack(t.times,t.values,path))throw new ClipError('This track uses cubic spline keys and cannot be edited key by key.');
  const e=this.easeOf(clip)[t.name]??[];
  return{name:t.name,track:t,data:{times:Array.from(t.times),values:Array.from(t.values),eases:Array.from(t.times,(_,k)=>e[k]??'linear')}};
 }
 /** Copies keys with their values and easing, sorted by path and time. Throws when any key is missing. */
 copyKeys(i:number,id:number,refs:readonly KeyRef[]):KeyData[]{
  const clip=this.needClip(i);const node=this.keyNode(id);const out:KeyData[]=[];
  for(const{path,times}of groupRefs(refs)){this.keyPathFor(node,path);const{data}=this.dataOf(clip,node,path);out.push(...copyTrackKeys(data,path,keyIndices(data,times)));}
  return out;
 }
 /** Moves a set of keys by the same delta, possibly across paths. One undo step. */
 shiftKeys(i:number,id:number,refs:readonly KeyRef[],dt:number):number{
  const clip=this.needClip(i);const node=this.keyNode(id);
  const plan=new Map<string,{path:KeyPath;interp?:THREE.InterpolationModes;data:TrackData}>();
  for(const{path,times}of groupRefs(refs)){
   this.keyPathFor(node,path);const{name,track,data}=this.dataOf(clip,node,path);
   plan.set(name,{path,interp:track.getInterpolation(),data:shiftTrackKeys(data,path,keyIndices(data,times),dt)});
  }
  this.editClip(i,{key:'studio3d.hist.keysMove',params:{name:node.name}},c=>{
   const base=this.snapClip(c);
   for(const[name,p]of plan){base.ease[name]=p.data.eases;base.tracks=[...base.tracks.filter(x=>x.name!==name),this.makeTrack(name,p.path,p.data.times,p.data.values,p.interp)];}
   return{...base,duration:Math.max(base.duration,...[...plan.values()].map(p=>lastKeyTime(p.data.times)))};
  });
  return refs.length;
 }
 /** Pastes copied keys so the earliest lands at `at`, replacing keys on taken times. One undo step. Returns the number of pasted keys. */
 pasteKeys(i:number,id:number,keys:readonly KeyData[],at:number):number{
  const clip=this.needClip(i);const node=this.keyNode(id);const t=checkKeyTime(at);
  if(!keys.length)throw new ClipError('Copy keys first.');
  if(keys.length>MAX_KEYS_PER_TRACK)throw new ClipError(`At most ${MAX_KEYS_PER_TRACK} keys at once.`);
  const plan=new Map<string,{path:KeyPath;interp?:THREE.InterpolationModes;data:TrackData}>();
  for(const path of KEY_PATHS){
   const ks=keys.filter(k=>k.path===path);if(!ks.length)continue;
   this.keyPathFor(node,path);const cur=this.trackOf(clip,node,path);
   if(cur&&!isPlainTrack(cur.times,cur.values,path))throw new ClipError('This track uses cubic spline keys and cannot be edited key by key.');
   const data=pasteTrackKeys(cur?this.dataOf(clip,node,path).data:undefined,path,ks,t);
   plan.set(trackName(node.uuid,path),{path,interp:cur?.getInterpolation(),data});
  }
  this.editClip(i,{key:'studio3d.hist.keysPaste',params:{name:node.name}},c=>{
   const base=this.snapClip(c);
   for(const[name,p]of plan){base.ease[name]=p.data.eases;base.tracks=[...base.tracks.filter(x=>x.name!==name),this.makeTrack(name,p.path,p.data.times,p.data.values,p.interp)];}
   return{...base,duration:Math.max(base.duration,...[...plan.values()].map(p=>lastKeyTime(p.data.times)))};
  });
  return keys.length;
 }
 /** Easing of the segment that starts at a key. */
 setKeyEase(i:number,id:number,path:KeyPath,time:number,ease:Ease){
  if(!isEase(ease))throw new ClipError(`Easing must be one of ${EASES.join(', ')}.`);
  const clip=this.needClip(i);const node=this.keyNode(id);this.keyPathFor(node,path);const t=checkKeyTime(time);const old=this.trackOf(clip,node,path);
  if(!old||!isPlainTrack(old.times,old.values,path))throw new ClipError(`${node.name} has no ${path} keys in this clip.`);
  const k=findKey(old.times,t);if(k<0)throw new ClipError('There is no key at that time.');
  const name=trackName(node.uuid,path);const eases=(this.easeOf(clip)[name]??[]).slice();while(eases.length<old.times.length)eases.push('linear');
  if(eases[k]===ease)return;eases[k]=ease;
  this.editClip(i,{key:'studio3d.hist.keyEasing',params:{path,name:node.name}},c=>{const base=this.snapClip(c);base.ease[name]=eases;return base;});
 }
 /** Key times and easing of one object in one clip, per path. */
 keysOf(i:number,id:number):{path:KeyPath;times:number[];eases:Ease[];editable:boolean}[]{
  const clip=this.clipList[i];const node=this.find(id);if(!clip||!node||node===this.root)return[];
  const out:{path:KeyPath;times:number[];eases:Ease[];editable:boolean}[]=[];
  for(const path of KEY_PATHS){const t=this.trackOf(clip,node,path);if(t){const e=this.easeOf(clip)[t.name]??[];out.push({path,times:Array.from(t.times),eases:Array.from(t.times,(_,k)=>e[k]??'linear'),editable:isPlainTrack(t.times,t.values,path)});}}
  return out;
 }
 /** A clip as it plays and exports: eased segments expanded into samples. */
 private bake(c:THREE.AnimationClip):THREE.AnimationClip{
  const e=this.easeOf(c);const tracks=c.tracks.map(t=>{const b=parseTrackName(t.name);const ez=e[t.name];
   if(!b||!ez||ez.every(x=>x==='linear')||!isPlainTrack(t.times,t.values,b.path))return t;
   const r=bakeTrack(t.times,t.values,b.path,ez);return this.makeTrack(t.name,b.path,r.times,r.values,t.getInterpolation());});
  return new THREE.AnimationClip(c.name,c.duration,tracks);
 }
 private bakedCache=new Map<THREE.AnimationClip,{rev:number;clip:THREE.AnimationClip}>();
 /** The clip to hand to an AnimationMixer. Cached until the clips change. */
 playableClip(i:number):THREE.AnimationClip|undefined{
  const c=this.clipList[i];if(!c)return undefined;const hit=this.bakedCache.get(c);if(hit&&hit.rev===this.clipRevision)return hit.clip;
  const clip=this.bake(c);this.bakedCache.set(c,{rev:this.clipRevision,clip});return clip;
 }
 /** What to give GLTFExporter when clips are included: a scene that lists the top-level nodes, so every clip finds its nodes and the file has no extra wrapper node. */
 exportScene():THREE.Scene{const sc=new THREE.Scene();sc.children=this.root.children;return sc;}
 /** Clips ready for export (baked): tracks whose object no longer exists are left out. */
 exportClips():THREE.AnimationClip[]{
  return this.clipList.map(c=>{const keep=c.tracks.filter(t=>{const b=parseTrackName(t.name);if(!b)return true;return !!THREE.PropertyBinding.findNode(this.root,b.node);});const src=new THREE.AnimationClip(c.name,c.duration,keep);src.userData=c.userData;return this.bake(src);}).filter(c=>c.tracks.length>0);
 }
 /** A GLTFExporter plugin that writes the clip length and the authoring keys with their easing into each animation's extras. Register it with exporter.register(stage.exporterPlugin()). */
 exporterPlugin(){
  return(writer:{json:{animations?:{name?:string;extras?:unknown;channels:{target:{node?:number;path:string}}[]}[]};nodeMap:Map<THREE.Object3D,number>})=>({
   afterParse:()=>{
    const anims=writer.json.animations;if(!anims)return;
    const sources=this.clipList.filter(c=>c.tracks.some(t=>{const b=parseTrackName(t.name);return !b||!!THREE.PropertyBinding.findNode(this.root,b.node);}));let at=0;
    for(const a of anims){
     while(at<sources.length&&sources[at].name!==a.name)at++;const c=sources[at++];if(!c)break;
     const ez=this.easeOf(c);const tracks:MetaTrack[]=[];
     for(const t of c.tracks){const b=parseTrackName(t.name);if(!b)continue;const node=THREE.PropertyBinding.findNode(this.root,b.node) as THREE.Object3D|undefined;const idx=node?writer.nodeMap.get(node):undefined;
      if(idx===undefined||!isPlainTrack(t.times,t.values,b.path))continue;const e=ez[t.name];if(!e||e.every(x=>x==='linear'))continue;
      tracks.push({node:idx,path:b.path,times:Array.from(t.times),ease:Array.from(t.times,(_,k)=>e[k]??'linear')});}
     a.extras={...(a.extras as object|undefined),...buildExtras({duration:c.duration,tracks})};
    }
   }
  });
 }
 /** Records a transform change into the current clip at the auto-key time. Returns the clip state change, or null when auto-key is off or nothing changed. */
 private autoKeyStates(o:THREE.Object3D,before:{p:THREE.Vector3;r:THREE.Euler;s:THREE.Vector3},next:{p:THREE.Vector3;r:THREE.Euler;s:THREE.Vector3}):{clip:THREE.AnimationClip;before:ClipState;after:ClipState}|null{
  const src=this.autoKeySource?.();if(!src||o===this.root)return null;const clip=this.clipList[src.clip];if(!clip)return null;
  let t:number;try{t=checkKeyTime(src.time);}catch{return null;}
  const was=this.snapClip(clip);let cur=was;
  const q=(e:THREE.Euler)=>new THREE.Quaternion().setFromEuler(e);
  const changes:[KeyPath,number[]][]=[];
  if(!before.p.equals(next.p))changes.push(['position',next.p.toArray()]);
  if(!q(before.r).equals(q(next.r)))changes.push(['rotation',q(next.r).toArray()]);
  if(!before.s.equals(next.s))changes.push(['scale',next.s.toArray()]);
  if(!changes.length)return null;
  try{for(const[path,v] of changes){this.restoreClip(clip,cur);cur=this.withKey(clip,o,path,t,v).state;}}catch{this.restoreClip(clip,was);return null;}
  this.restoreClip(clip,was);return{clip,before:was,after:cur};
 }
 /** Mirrors objects across the world plane through the origin that is perpendicular to the axis. With copy, mirrored duplicates are added instead. One undo step. */
 mirror(ids:number[],axis:MirrorAxis,copy:boolean):THREE.Object3D[]{
  if(!['x','y','z'].includes(axis))throw new StageError('axis must be x, y or z.');
  const objs=this.topLevel(this.needMany(ids,1));
  const flip=new THREE.Matrix4().makeScale(axis==='x'?-1:1,axis==='y'?-1:1,axis==='z'?-1:1);
  const place=(o:THREE.Object3D,parent:THREE.Object3D)=>{
   o.updateWorldMatrix(true,false);const w=flip.clone().multiply(o.matrixWorld);parent.updateWorldMatrix(true,false);
   const local=parent.matrixWorld.clone().invert().multiply(w);const p=new THREE.Vector3(),q=new THREE.Quaternion(),sc=new THREE.Vector3();local.decompose(p,q,sc);return{p,q,sc,s:sc};
  };
  if(!copy){
   const list=objs.map(o=>{const t=place(o,o.parent!);return{o,b:{p:o.position.clone(),q:o.quaternion.clone(),s:o.scale.clone()},a:t};});
   const set=(k:'b'|'a')=>{for(const l of list){const v=l[k];l.o.position.copy(v.p);l.o.quaternion.copy(v.q);l.o.scale.copy(v.s);}};
   set('a');this.push({label:{key:'studio3d.hist.mirrorObjects',params:{count:objs.length,name:objs[0].name}},undo:()=>set('b'),redo:()=>set('a')});return objs;
  }
  const items:{o:THREE.Object3D;parent:THREE.Object3D;at:number}[]=[];
  for(const src of objs){
   const c=src.clone(true);c.traverse(x=>{const m=x as THREE.Mesh;if(m.isMesh&&!Array.isArray(m.material))m.material=(m.material as THREE.Material).clone();});
   const parent=src.parent??this.root;const t=place(src,parent);c.position.copy(t.p);c.quaternion.copy(t.q);c.scale.copy(t.sc);
   c.name=this.uniqueName(src.name+' mirror');items.push({o:c,parent,at:parent.children.length});this.attach0(c,parent,parent.children.length);
  }
  let owned=true;
  this.push({label:{key:'studio3d.hist.mirrorCopy',params:{count:items.length,name:objs[0].name}},undo:()=>{for(const i of items)i.parent.remove(i.o);owned=false;},redo:()=>{for(const i of items)this.attach0(i.o,i.parent,i.at);owned=true;},release:()=>{if(!owned)for(const i of items)disposeObject(i.o);}});
  return items.map(i=>i.o);
 }
 /** Bakes each mesh's scale into its geometry and resets the scale to 1. The look does not change. A mesh with children is refused, because the children would change size. */
 applyScale(ids:number[]){
  const objs=this.topLevel(this.needMany(ids,1));
  for(const o of objs){if(!(o as THREE.Mesh).isMesh)throw new StageError(`${o.name} is not a mesh. Apply scale works on meshes.`);if(o.children.length)throw new StageError(`${o.name} has child objects, so its scale cannot be applied.`);}
  const list=objs.map(o=>o as THREE.Mesh).filter(m=>Math.abs(m.scale.x-1)>1e-9||Math.abs(m.scale.y-1)>1e-9||Math.abs(m.scale.z-1)>1e-9).map(m=>{
   const g=m.geometry.clone();g.applyMatrix4(new THREE.Matrix4().makeScale(m.scale.x,m.scale.y,m.scale.z));
   if(m.scale.x*m.scale.y*m.scale.z<0)flipWinding(g);g.computeBoundingBox();g.computeBoundingSphere();
   return{m,before:{g:m.geometry,s:m.scale.clone(),d:m.userData.somniaPrimitive},after:g};});
  if(!list.length)return;
  const set=(k:'before'|'after')=>{for(const l of list){if(k==='after'){l.m.geometry=l.after;l.m.scale.set(1,1,1);delete l.m.userData.somniaPrimitive;}else{l.m.geometry=l.before.g;l.m.scale.copy(l.before.s);if(l.before.d!==undefined)l.m.userData.somniaPrimitive=l.before.d;}}};
  let owned=true;set('after');
  this.push({label:{key:'studio3d.hist.applyScale',params:{count:list.length,name:list[0].m.name}},undo:()=>{set('before');owned=false;},redo:()=>{set('after');owned=true;},release:()=>{for(const l of list)(owned?l.before.g:l.after).dispose();}});
 }
 /** Joins all meshes in the given objects into one mesh at the scene root. World transforms are baked in. The first mesh's material is used. One undo step. */
 merge(ids:number[]):THREE.Mesh{
  const objs=this.topLevel(this.needMany(ids,1));const meshes:THREE.Mesh[]=[];
  for(const o of objs)o.traverse(x=>{if((x as THREE.Mesh).isMesh&&!Array.isArray((x as THREE.Mesh).material))meshes.push(x as THREE.Mesh);});
  if(meshes.length<2)throw new StageError('Select at least two meshes to merge.');
  this.root.updateWorldMatrix(true,true);const inv=this.root.matrixWorld.clone().invert();
  const geos:THREE.BufferGeometry[]=[];let verts=0;
  for(const m of meshes){
   const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();
   const w=inv.clone().multiply(m.matrixWorld);g.applyMatrix4(w);if(w.determinant()<0)flipWinding(g);
   if(!g.getAttribute('normal'))g.computeVertexNormals();
   if(!g.getAttribute('uv'))g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count*2),2));
   for(const k of Object.keys(g.attributes))if(!['position','normal','uv'].includes(k))g.deleteAttribute(k);
   g.clearGroups();verts+=g.getAttribute('position').count;
   if(verts>MAX_MERGE_VERTICES){for(const x of geos)x.dispose();throw new StageError(`The merged mesh would have more than ${MAX_MERGE_VERTICES.toLocaleString('en-US')} vertices.`);}
   geos.push(g);
  }
  const merged=mergeGeometries(geos,false);for(const g of geos)g.dispose();
  if(!merged)throw new StageError('These meshes could not be merged.');
  const first=meshes[0];const result=new THREE.Mesh(merged,(first.material as THREE.Material).clone());result.name=this.uniqueName('Merged');
  const items=objs.map(o=>({o,parent:o.parent!,at:o.parent!.children.indexOf(o)})).sort((a,b)=>a.parent.id-b.parent.id||a.at-b.at);
  for(const i of [...items].reverse())i.parent.remove(i.o);
  const at=this.root.children.length;this.attach0(result,this.root,at);
  let owned=true;
  this.push({label:{key:'studio3d.hist.mergeMeshes',params:{count:meshes.length}},undo:()=>{this.root.remove(result);for(const i of items)this.attach0(i.o,i.parent,i.at);owned=false;},redo:()=>{for(const i of [...items].reverse())i.parent.remove(i.o);this.attach0(result,this.root,this.root.children.length);owned=true;},
   release:()=>{if(owned)for(const i of items)disposeObject(i.o);else disposeObject(result);}});
  return result;
 }
 /** Simplifies a mesh with the meshopt simplifier: removes roughly the given fraction of vertices while keeping shape, UVs and normals. Primitive params and UV seam marks do not survive the new topology and are cleared. One undo step. */
 async simplify(id:number,keep:number):Promise<{before:number;after:number;tris:number}>{
  if(this.editId!=null)throw new StageError('Leave edit mode before simplifying.');
  const o=this.need(id);if(!(o instanceof THREE.Mesh))throw new StageError('Only meshes can be simplified.');
  const k=finite(keep,'keep');if(k<=0||k>=1)throw new StageError('keep must be between 0 and 1 (exclusive).');
  const before=o.geometry;const verts=before.getAttribute('position').count;
  if(verts>250000)throw new StageError('This mesh is too large to simplify (over 250,000 vertices).');
  const remove=verts-Math.max(4,Math.round(verts*k));
  if(remove<1)throw new StageError('This keep ratio removes nothing on such a small mesh; lower it.');
  const after=await new SimplifyModifier().modify(before.clone(),remove);
  const tris=Math.floor((after.getIndex()?after.getIndex()!.count:after.getAttribute('position').count)/3);
  if(tris<1)throw new StageError('Simplifying this far would remove the whole mesh; raise the keep ratio.');
  const beforeData=o.userData.somniaPrimitive;const seams0=this.seamsOf(o);
  let owned=true;
  const set=(g:THREE.BufferGeometry,param:unknown,seams:[number,number][])=>{o.geometry=g;if(param===undefined)delete o.userData.somniaPrimitive;else o.userData.somniaPrimitive=param;this.setSeams(o,seams);};
  set(after,undefined,[]);
  this.push({label:{key:'studio3d.hist.simplify',params:{name:o.name}},undo:()=>{set(before,beforeData,seams0);owned=false;},redo:()=>{set(after,undefined,[]);owned=true;},release:()=>{(owned?before:after).dispose();}});
  return {before:verts,after:after.getAttribute('position').count,tris};
 }
 /** Bakes a symmetry into meshes: keeps one side of each mesh's local mirror plane, mirrors it onto the other side and welds the seam. One undo step for the whole set. */
 symmetrize(axis:MirrorAxis,side:'positive'|'negative',merge:number,ids:number[]):number{
  if(this.editId!=null)throw new StageError('Leave edit mode before symmetrizing.');
  const m=finite(merge,'merge');if(m<0||m>1e6)throw new StageError('The merge distance must be zero or a positive number.');
  const objs=this.topLevel(this.needMany(ids,1));
  for(const o of objs)if(!(o as THREE.Mesh).isMesh)throw new StageError(`${o.name} is not a mesh. Symmetrize works on meshes.`);
  const list=(objs as THREE.Mesh[]).map(mesh=>{
   const data=this.meshDataOf(mesh);const out=symmetrizeMesh(data,axis,side,m);
   const g=this.buildGeometry(out);
   const seams0=this.seamsOf(mesh);let seams1:[number,number][]=[];
   if(seams0.length){try{seams1=remapSeams(data,seams0,out);}catch{seams1=[];}}
   return{mesh,before:{g:mesh.geometry,d:mesh.userData.somniaPrimitive,s:seams0},after:g,seams1};
  });
  const set=(k:'before'|'after')=>{for(const l of list){if(k==='after'){l.mesh.geometry=l.after;delete l.mesh.userData.somniaPrimitive;this.setSeams(l.mesh,l.seams1);}else{l.mesh.geometry=l.before.g;if(l.before.d!==undefined)l.mesh.userData.somniaPrimitive=l.before.d;this.setSeams(l.mesh,l.before.s);}}};
  let owned=true;
  set('after');
  this.push({label:{key:'studio3d.hist.symmetrize',params:{count:list.length,name:list[0].mesh.name}},undo:()=>{set('before');owned=false;},redo:()=>{set('after');owned=true;},release:()=>{for(const l of list)(owned?l.before.g:l.after).dispose();}});
  return list.length;
 }
 /** Subdivides meshes smoothly (Loop scheme): every triangle splits into four and the surface is smoothed; boundaries keep their outline. One undo step for the whole set. */
 subdivide(iterations:number,ids:number[]):number{
  if(this.editId!=null)throw new StageError('Leave edit mode before subdividing.');
  if(!Number.isInteger(iterations)||iterations<1||iterations>3)throw new StageError('Iterations must be a whole number between 1 and 3.');
  const objs=this.topLevel(this.needMany(ids,1));
  for(const o of objs)if(!(o as THREE.Mesh).isMesh)throw new StageError(`${o.name} is not a mesh. Subdivide works on meshes.`);
  const list=(objs as THREE.Mesh[]).map(mesh=>{
   const data=this.meshDataOf(mesh);
   let out:MeshData;try{out=subdivideLoop(data,iterations);}catch(e){throw e instanceof EditError?new StageError(e.message):e;}
   const g=this.buildGeometry(out);
   const seams0=this.seamsOf(mesh);let seams1:[number,number][]=[];
   if(seams0.length){try{seams1=remapSeams(data,seams0,out);}catch{seams1=[];}}
   return{mesh,before:{g:mesh.geometry,d:mesh.userData.somniaPrimitive,s:seams0},after:g,seams1};
  });
  const set=(k:'before'|'after')=>{for(const l of list){if(k==='after'){l.mesh.geometry=l.after;delete l.mesh.userData.somniaPrimitive;this.setSeams(l.mesh,l.seams1);}else{l.mesh.geometry=l.before.g;if(l.before.d!==undefined)l.mesh.userData.somniaPrimitive=l.before.d;this.setSeams(l.mesh,l.before.s);}}};
  let owned=true;
  set('after');
  this.push({label:{key:'studio3d.hist.subdivide',params:{count:list.length,name:list[0].mesh.name}},undo:()=>{set('before');owned=false;},redo:()=>{set('after');owned=true;},release:()=>{for(const l of list)(owned?l.before.g:l.after).dispose();}});
  return list.length;
 }
 /** Cleans meshes up: welds duplicate vertices (UV seams survive), drops collapsed and duplicate faces, removes unreferenced vertices and unifies winding (closed parts point outward). One undo step for the whole set. Returns the totals. */
 cleanup(weld:number,ids:number[]):{welded:number;facesDropped:number;vertsDropped:number;flipped:number}{
  if(this.editId!=null)throw new StageError('Leave edit mode before cleaning up meshes.');
  if(!Number.isFinite(weld)||weld<0||weld>1e6)throw new StageError('The weld distance must be zero or a positive number.');
  const objs=this.topLevel(this.needMany(ids,1));
  for(const o of objs)if(!(o as THREE.Mesh).isMesh)throw new StageError(`${o.name} is not a mesh. Cleanup works on meshes.`);
  const total={welded:0,facesDropped:0,vertsDropped:0,flipped:0};
  const list=(objs as THREE.Mesh[]).map(mesh=>{
   const data=this.meshDataOf(mesh);
   let r:CleanupResult;try{r=cleanupMesh(data,weld);}catch(e){throw e instanceof EditError?new StageError(e.message):e;}
   total.welded+=r.welded;total.facesDropped+=r.facesDropped;total.vertsDropped+=r.vertsDropped;total.flipped+=r.flipped;
   const g=this.buildGeometry(r.mesh);
   const seams0=this.seamsOf(mesh);let seams1:[number,number][]=[];
   if(seams0.length){try{seams1=remapSeams(data,seams0,r.mesh);}catch{seams1=[];}}
   return{mesh,before:{g:mesh.geometry,d:mesh.userData.somniaPrimitive,s:seams0},after:g,seams1};
  });
  const set=(k:'before'|'after')=>{for(const l of list){if(k==='after'){l.mesh.geometry=l.after;delete l.mesh.userData.somniaPrimitive;this.setSeams(l.mesh,l.seams1);}else{l.mesh.geometry=l.before.g;if(l.before.d!==undefined)l.mesh.userData.somniaPrimitive=l.before.d;this.setSeams(l.mesh,l.before.s);}}};
  let owned=true;
  set('after');
  this.push({label:{key:'studio3d.hist.cleanup',params:{count:list.length,name:list[0].mesh.name}},undo:()=>{set('before');owned=false;},redo:()=>{set('after');owned=true;},release:()=>{for(const l of list)(owned?l.before.g:l.after).dispose();}});
  return total;
 }
 /** Normals toolbox: flip winding, recalculate outward, or rebuild shading smooth, flat or split by angle. One undo step for the whole set. */
 normalsOp(op:NormalsOp,angle:number,ids:number[]):number{
  if(this.editId!=null)throw new StageError('Leave edit mode before rebuilding normals.');
  const objs=this.topLevel(this.needMany(ids,1));
  for(const o of objs)if(!(o as THREE.Mesh).isMesh)throw new StageError(`${o.name} is not a mesh. Normals work on meshes.`);
  const list=(objs as THREE.Mesh[]).map(mesh=>{
   const data=this.meshDataOf(mesh);
   let out:MeshData;
   try{
    if(op==='flip')out=flipMesh(data);
    else if(op==='outside')out=outsideMesh(data).mesh;
    else out=smoothMesh(data,op==='flat'?0:op==='smooth'?180:angle);
   }catch(e){throw e instanceof EditError?new StageError(e.message):e;}
   const g=this.buildGeometry(out);
   const seams0=this.seamsOf(mesh);let seams1:[number,number][]=[];
   if(seams0.length){try{seams1=remapSeams(data,seams0,out);}catch{seams1=[];}}
   return{mesh,before:{g:mesh.geometry,d:mesh.userData.somniaPrimitive,s:seams0},after:g,seams1};
  });
  const set=(k:'before'|'after')=>{for(const l of list){if(k==='after'){l.mesh.geometry=l.after;delete l.mesh.userData.somniaPrimitive;this.setSeams(l.mesh,l.seams1);}else{l.mesh.geometry=l.before.g;if(l.before.d!==undefined)l.mesh.userData.somniaPrimitive=l.before.d;this.setSeams(l.mesh,l.before.s);}}};
  let owned=true;
  set('after');
  this.push({label:{key:'studio3d.hist.normals',params:{count:list.length,name:list[0].mesh.name}},undo:()=>{set('before');owned=false;},redo:()=>{set('after');owned=true;},release:()=>{for(const l of list)(owned?l.before.g:l.after).dispose();}});
  return list.length;
 }
 /** Splits meshes into one object per connected part (loose geometry, matched by position so UV seams stay together). The largest part keeps the original object, the rest become siblings with cloned materials and the same transform. One undo step for the whole set. Returns the number of resulting objects. */
 separate(ids:number[]):number{
  if(this.editId!=null)throw new StageError('Leave edit mode before separating.');
  const objs=this.topLevel(this.needMany(ids,1));
  for(const o of objs)if(!(o as THREE.Mesh).isMesh)throw new StageError(`${o.name} is not a mesh. Separate works on meshes.`);
  type Part={g:THREE.BufferGeometry;seams:[number,number][];o?:THREE.Mesh;at:number};
  type Work={mesh:THREE.Mesh;parent:THREE.Object3D;before:{g:THREE.BufferGeometry;d:unknown;s:[number,number][]};parts:Part[]};
  const work:Work[]=[];
  for(const o of objs as THREE.Mesh[]){
   const data=this.meshDataOf(o);
   let parts:MeshData[];
   try{parts=separateMesh(data);}catch(e){throw e instanceof EditError?new StageError(e.message):e;}
   if(parts.length<2)continue;
   const parent=o.parent!;const at=parent.children.indexOf(o);
   const seams0=this.seamsOf(o);
   const ws:Part[]=parts.map((p,i)=>{
    let seams:[number,number][]=[];
    if(seams0.length){try{seams=remapSeams(data,seams0,p);}catch{seams=[];}}
    return{g:this.buildGeometry(p),seams,at:at+1+i};
   });
   for(let i=1;i<ws.length;i++){
    const m2=new THREE.Mesh(ws[i].g,(o.material as THREE.Material).clone());
    m2.name=this.uniqueName(`${o.name}.${i+1}`);
    m2.position.copy(o.position);m2.quaternion.copy(o.quaternion);m2.scale.copy(o.scale);m2.visible=o.visible;
    ws[i].o=m2;
   }
   work.push({mesh:o,parent,before:{g:o.geometry,d:o.userData.somniaPrimitive,s:seams0},parts:ws});
  }
  if(!work.length)throw new StageError('Every selected mesh is already one connected part.');
  let owned=true;
  const set=(k:'before'|'after')=>{
   for(const w of work){
    if(k==='after'){
     w.mesh.geometry=w.parts[0].g;delete w.mesh.userData.somniaPrimitive;this.setSeams(w.mesh,w.parts[0].seams);
     for(let i=1;i<w.parts.length;i++)this.attach0(w.parts[i].o!,w.parent,w.parts[i].at);
    }else{
     for(let i=1;i<w.parts.length;i++)w.parent.remove(w.parts[i].o!);
     w.mesh.geometry=w.before.g;if(w.before.d!==undefined)w.mesh.userData.somniaPrimitive=w.before.d;this.setSeams(w.mesh,w.before.s);
    }
   }
  };
  set('after');
  this.push({label:{key:'studio3d.hist.separate',params:{count:work.length,name:work[0].mesh.name}},undo:()=>{set('before');owned=false;},redo:()=>{set('after');owned=true;},
   release:()=>{for(const w of work){if(owned)w.before.g.dispose();else{w.parts[0].g.dispose();for(let i=1;i<w.parts.length;i++)disposeObject(w.parts[i].o!);}}}});
  return work.reduce((n,w)=>n+w.parts.length,0);
 }
 /** Gives meshes real thickness: outer skin, flipped inner skin and stitched side walls on open borders. One undo step for the whole set. */
 solidify(thickness:number,offset:number,ids:number[]):number{
  if(this.editId!=null)throw new StageError('Leave edit mode before solidifying.');
  const objs=this.topLevel(this.needMany(ids,1));
  for(const o of objs)if(!(o as THREE.Mesh).isMesh)throw new StageError(`${o.name} is not a mesh. Solidify works on meshes.`);
  const list=(objs as THREE.Mesh[]).map(mesh=>{
   const data=this.meshDataOf(mesh);
   let out:MeshData;
   try{out=solidifyMesh(data,thickness,offset);}catch(e){throw e instanceof EditError?new StageError(e.message):e;}
   const g=this.buildGeometry(out);
   const seams0=this.seamsOf(mesh);let seams1:[number,number][]=[];
   if(seams0.length){try{seams1=remapSeams(data,seams0,out);}catch{seams1=[];}}
   return{mesh,before:{g:mesh.geometry,d:mesh.userData.somniaPrimitive,s:seams0},after:g,seams1};
  });
  const set=(k:'before'|'after')=>{for(const l of list){if(k==='after'){l.mesh.geometry=l.after;delete l.mesh.userData.somniaPrimitive;this.setSeams(l.mesh,l.seams1);}else{l.mesh.geometry=l.before.g;if(l.before.d!==undefined)l.mesh.userData.somniaPrimitive=l.before.d;this.setSeams(l.mesh,l.before.s);}}};
  let owned=true;
  set('after');
  this.push({label:{key:'studio3d.hist.solidify',params:{count:list.length,name:list[0].mesh.name}},undo:()=>{set('before');owned=false;},redo:()=>{set('after');owned=true;},release:()=>{for(const l of list)(owned?l.before.g:l.after).dispose();}});
  return list.length;
 }
 /** Caps open borders of meshes with centroid fans wound consistently with each border's surface. Meshes without open borders are skipped; one undo step for the whole set. Returns the number of holes filled. */
 fillHoles(ids:number[]):number{
  if(this.editId!=null)throw new StageError('Leave edit mode before filling holes.');
  const objs=this.topLevel(this.needMany(ids,1));
  for(const o of objs)if(!(o as THREE.Mesh).isMesh)throw new StageError(`${o.name} is not a mesh. Fill holes works on meshes.`);
  let holes=0;
  const list:{mesh:THREE.Mesh;before:{g:THREE.BufferGeometry;d:unknown;s:[number,number][]};after:THREE.BufferGeometry;seams1:[number,number][]}[]=[];
  for(const mesh of objs as THREE.Mesh[]){
   const data=this.meshDataOf(mesh);
   let r:{mesh:MeshData;holes:number};
   try{r=fillHolesMesh(data);}catch(e){if(e instanceof EditError)continue;throw e;}
   const g=this.buildGeometry(r.mesh);
   const seams0=this.seamsOf(mesh);let seams1:[number,number][]=[];
   if(seams0.length){try{seams1=remapSeams(data,seams0,r.mesh);}catch{seams1=[];}}
   list.push({mesh,before:{g:mesh.geometry,d:mesh.userData.somniaPrimitive,s:seams0},after:g,seams1});
   holes+=r.holes;
  }
  if(!list.length)throw new StageError('Every selected mesh is already closed.');
  const set=(k:'before'|'after')=>{for(const l of list){if(k==='after'){l.mesh.geometry=l.after;delete l.mesh.userData.somniaPrimitive;this.setSeams(l.mesh,l.seams1);}else{l.mesh.geometry=l.before.g;if(l.before.d!==undefined)l.mesh.userData.somniaPrimitive=l.before.d;this.setSeams(l.mesh,l.before.s);}}};
  let owned=true;
  set('after');
  this.push({label:{key:'studio3d.hist.fillHoles',params:{count:holes,name:list[0].mesh.name}},undo:()=>{set('before');owned=false;},redo:()=>{set('after');owned=true;},release:()=>{for(const l of list)(owned?l.before.g:l.after).dispose();}});
  return holes;
 }
 /** Laplacian smoothing of whole meshes: vertices drift toward their neighbourhood average, borders pinned, sculpt masks protect, UV-seam twins move as one. One undo step for the whole set. */
 relax(iterations:number,factor:number,ids:number[]):number{
  if(this.editId!=null)throw new StageError('Leave edit mode before relaxing.');
  const objs=this.topLevel(this.needMany(ids,1));
  for(const o of objs)if(!(o as THREE.Mesh).isMesh)throw new StageError(`${o.name} is not a mesh. Relax works on meshes.`);
  const list=(objs as THREE.Mesh[]).map(mesh=>{
   const data=this.meshDataOf(mesh);
   let out:MeshData;
   try{out=relaxMesh(data,iterations,factor);}catch(e){throw e instanceof EditError?new StageError(e.message):e;}
   const g=this.buildGeometry(out);
   const seams0=this.seamsOf(mesh);let seams1:[number,number][]=[];
   if(seams0.length){try{seams1=remapSeams(data,seams0,out);}catch{seams1=[];}}
   return{mesh,before:{g:mesh.geometry,d:mesh.userData.somniaPrimitive,s:seams0},after:g,seams1};
  });
  const set=(k:'before'|'after')=>{for(const l of list){if(k==='after'){l.mesh.geometry=l.after;delete l.mesh.userData.somniaPrimitive;this.setSeams(l.mesh,l.seams1);}else{l.mesh.geometry=l.before.g;if(l.before.d!==undefined)l.mesh.userData.somniaPrimitive=l.before.d;this.setSeams(l.mesh,l.before.s);}}};
  let owned=true;
  set('after');
  this.push({label:{key:'studio3d.hist.relax',params:{count:list.length,name:list[0].mesh.name}},undo:()=>{set('before');owned=false;},redo:()=>{set('after');owned=true;},release:()=>{for(const l of list)(owned?l.before.g:l.after).dispose();}});
  return list.length;
 }
 /** Shrinks or fattens meshes along their smooth normals (negative amounts shrink). UV-seam twins push along one shared normal, sculpt masks scale the push. One undo step for the whole set. */
 fatten(amount:number,ids:number[]):number{
  if(this.editId!=null)throw new StageError('Leave edit mode before fattening.');
  const objs=this.topLevel(this.needMany(ids,1));
  for(const o of objs)if(!(o as THREE.Mesh).isMesh)throw new StageError(`${o.name} is not a mesh. Shrink/fatten works on meshes.`);
  const list=(objs as THREE.Mesh[]).map(mesh=>{
   const data=this.meshDataOf(mesh);
   let out:MeshData;
   try{out=fattenMesh(data,amount);}catch(e){throw e instanceof EditError?new StageError(e.message):e;}
   const g=this.buildGeometry(out);
   const seams0=this.seamsOf(mesh);let seams1:[number,number][]=[];
   if(seams0.length){try{seams1=remapSeams(data,seams0,out);}catch{seams1=[];}}
   return{mesh,before:{g:mesh.geometry,d:mesh.userData.somniaPrimitive,s:seams0},after:g,seams1};
  });
  const set=(k:'before'|'after')=>{for(const l of list){if(k==='after'){l.mesh.geometry=l.after;delete l.mesh.userData.somniaPrimitive;this.setSeams(l.mesh,l.seams1);}else{l.mesh.geometry=l.before.g;if(l.before.d!==undefined)l.mesh.userData.somniaPrimitive=l.before.d;this.setSeams(l.mesh,l.before.s);}}};
  let owned=true;
  set('after');
  this.push({label:{key:'studio3d.hist.fatten',params:{count:list.length,name:list[0].mesh.name}},undo:()=>{set('before');owned=false;},redo:()=>{set('after');owned=true;},release:()=>{for(const l of list)(owned?l.before.g:l.after).dispose();}});
  return list.length;
 }
 /** Cuts meshes with an axis-aligned plane at the given offset and keeps both halves: the original mesh gets the negative side, a sibling clone gets the positive side. With fill on, each cut face is capped. One undo step for the whole set. */
 bisect(axis:MirrorAxis,offset:number,fill:boolean,ids:number[]):number{
  if(this.editId!=null)throw new StageError('Leave edit mode before bisecting.');
  const objs=this.topLevel(this.needMany(ids,1));
  for(const o of objs)if(!(o as THREE.Mesh).isMesh)throw new StageError(`${o.name} is not a mesh. Bisect works on meshes.`);
  type Work={mesh:THREE.Mesh;parent:THREE.Object3D;before:{g:THREE.BufferGeometry;d:unknown;s:[number,number][]};negG:THREE.BufferGeometry;negSeams:[number,number][];pos:THREE.Mesh;at:number};
  const work:Work[]=[];
  for(const o of objs as THREE.Mesh[]){
   const data=this.meshDataOf(o);
   let r:{neg:MeshData;pos:MeshData};
   try{r=bisectMesh(data,axis,offset,fill);}catch(e){throw e instanceof EditError?new StageError(e.message):e;}
   const parent=o.parent!;const at=parent.children.indexOf(o);
   const seams0=this.seamsOf(o);
   let negSeams:[number,number][]=[],posSeams:[number,number][]=[];
   if(seams0.length){try{negSeams=remapSeams(data,seams0,r.neg);}catch{negSeams=[];}try{posSeams=remapSeams(data,seams0,r.pos);}catch{posSeams=[];}}
   const negG=this.buildGeometry(r.neg);
   const posMesh=new THREE.Mesh(this.buildGeometry(r.pos),(o.material as THREE.Material).clone());
   posMesh.name=this.uniqueName(`${o.name}.2`);
   posMesh.position.copy(o.position);posMesh.quaternion.copy(o.quaternion);posMesh.scale.copy(o.scale);posMesh.visible=o.visible;
   this.setSeams(posMesh,posSeams);
   work.push({mesh:o,parent,before:{g:o.geometry,d:o.userData.somniaPrimitive,s:seams0},negG,negSeams,pos:posMesh,at:at+1});
  }
  let owned=true;
  const set=(k:'before'|'after')=>{
   for(const w of work){
    if(k==='after'){
     w.mesh.geometry=w.negG;delete w.mesh.userData.somniaPrimitive;this.setSeams(w.mesh,w.negSeams);
     this.attach0(w.pos,w.parent,w.at);
    }else{
     w.parent.remove(w.pos);
     w.mesh.geometry=w.before.g;if(w.before.d!==undefined)w.mesh.userData.somniaPrimitive=w.before.d;this.setSeams(w.mesh,w.before.s);
    }
   }
  };
  set('after');
  this.push({label:{key:'studio3d.hist.bisect',params:{count:work.length,name:work[0].mesh.name}},undo:()=>{set('before');owned=false;},redo:()=>{set('after');owned=true;},
   release:()=>{for(const w of work){if(owned)w.before.g.dispose();else{w.negG.dispose();disposeObject(w.pos);}}}});
  return work.length*2;
 }
 /** Twists meshes around an axis: the total angle is spread across each mesh's extent along that axis (simple-deform twist around the bounding-box centre line). Sculpt masks scale the rotation. One undo step for the whole set. */
 twist(axis:MirrorAxis,degrees:number,ids:number[]):number{
  if(this.editId!=null)throw new StageError('Leave edit mode before twisting.');
  const objs=this.topLevel(this.needMany(ids,1));
  for(const o of objs)if(!(o as THREE.Mesh).isMesh)throw new StageError(`${o.name} is not a mesh. Twist works on meshes.`);
  const list=(objs as THREE.Mesh[]).map(mesh=>{
   const data=this.meshDataOf(mesh);
   let out:MeshData;
   try{out=twistMesh(data,axis,degrees);}catch(e){throw e instanceof EditError?new StageError(e.message):e;}
   const g=this.buildGeometry(out);
   const seams0=this.seamsOf(mesh);let seams1:[number,number][]=[];
   if(seams0.length){try{seams1=remapSeams(data,seams0,out);}catch{seams1=[];}}
   return{mesh,before:{g:mesh.geometry,d:mesh.userData.somniaPrimitive,s:seams0},after:g,seams1};
  });
  const set=(k:'before'|'after')=>{for(const l of list){if(k==='after'){l.mesh.geometry=l.after;delete l.mesh.userData.somniaPrimitive;this.setSeams(l.mesh,l.seams1);}else{l.mesh.geometry=l.before.g;if(l.before.d!==undefined)l.mesh.userData.somniaPrimitive=l.before.d;this.setSeams(l.mesh,l.before.s);}}};
  let owned=true;
  set('after');
  this.push({label:{key:'studio3d.hist.twist',params:{count:list.length,name:list[0].mesh.name}},undo:()=>{set('before');owned=false;},redo:()=>{set('after');owned=true;},release:()=>{for(const l of list)(owned?l.before.g:l.after).dispose();}});
  return list.length;
 }
 /** Tapers meshes along an axis: the perpendicular scale runs from 1 at the low end to the factor at the high end (negative factors invert the far end), around the bounding-box centre line. Sculpt masks scale the effect. One undo step for the whole set. */
 taper(axis:MirrorAxis,factor:number,ids:number[]):number{
  if(this.editId!=null)throw new StageError('Leave edit mode before tapering.');
  const objs=this.topLevel(this.needMany(ids,1));
  for(const o of objs)if(!(o as THREE.Mesh).isMesh)throw new StageError(`${o.name} is not a mesh. Taper works on meshes.`);
  const list=(objs as THREE.Mesh[]).map(mesh=>{
   const data=this.meshDataOf(mesh);
   let out:MeshData;
   try{out=taperMesh(data,axis,factor);}catch(e){throw e instanceof EditError?new StageError(e.message):e;}
   const g=this.buildGeometry(out);
   const seams0=this.seamsOf(mesh);let seams1:[number,number][]=[];
   if(seams0.length){try{seams1=remapSeams(data,seams0,out);}catch{seams1=[];}}
   return{mesh,before:{g:mesh.geometry,d:mesh.userData.somniaPrimitive,s:seams0},after:g,seams1};
  });
  const set=(k:'before'|'after')=>{for(const l of list){if(k==='after'){l.mesh.geometry=l.after;delete l.mesh.userData.somniaPrimitive;this.setSeams(l.mesh,l.seams1);}else{l.mesh.geometry=l.before.g;if(l.before.d!==undefined)l.mesh.userData.somniaPrimitive=l.before.d;this.setSeams(l.mesh,l.before.s);}}};
  let owned=true;
  set('after');
  this.push({label:{key:'studio3d.hist.taper',params:{count:list.length,name:list[0].mesh.name}},undo:()=>{set('before');owned=false;},redo:()=>{set('after');owned=true;},release:()=>{for(const l of list)(owned?l.before.g:l.after).dispose();}});
  return list.length;
 }
 /** Revolves meshes around an axis through a center (lathe/spin): border edges sweep the walls, faces cap the start and (for partial turns) the end, a full 360 degrees welds the seam ring. One undo step for the whole set. */
 spin(axis:MirrorAxis,degrees:number,steps:number,center:[number,number,number],ids:number[]):number{
  if(this.editId!=null)throw new StageError('Leave edit mode before spinning.');
  const objs=this.topLevel(this.needMany(ids,1));
  for(const o of objs)if(!(o as THREE.Mesh).isMesh)throw new StageError(`${o.name} is not a mesh. Spin works on meshes.`);
  const list=(objs as THREE.Mesh[]).map(mesh=>{
   const data=this.meshDataOf(mesh);
   let out:MeshData;
   try{out=spinMesh(data,axis,degrees,steps,center);}catch(e){throw e instanceof EditError?new StageError(e.message):e;}
   const g=this.buildGeometry(out);
   const seams0=this.seamsOf(mesh);let seams1:[number,number][]=[];
   if(seams0.length){try{seams1=remapSeams(data,seams0,out);}catch{seams1=[];}}
   return{mesh,before:{g:mesh.geometry,d:mesh.userData.somniaPrimitive,s:seams0},after:g,seams1};
  });
  const set=(k:'before'|'after')=>{for(const l of list){if(k==='after'){l.mesh.geometry=l.after;delete l.mesh.userData.somniaPrimitive;this.setSeams(l.mesh,l.seams1);}else{l.mesh.geometry=l.before.g;if(l.before.d!==undefined)l.mesh.userData.somniaPrimitive=l.before.d;this.setSeams(l.mesh,l.before.s);}}};
  let owned=true;
  set('after');
  this.push({label:{key:'studio3d.hist.spin',params:{count:list.length,name:list[0].mesh.name}},undo:()=>{set('before');owned=false;},redo:()=>{set('after');owned=true;},release:()=>{for(const l of list)(owned?l.before.g:l.after).dispose();}});
  return list.length;
 }
 /** Bridges two meshes through their largest open border loops: world transforms are baked, a sewn tunnel connects the loops and the pair becomes one mesh at the scene root (keeping the first mesh's name and material). One undo step. */
 bridge(ids:number[],twist:number):number{
  if(this.editId!=null)throw new StageError('Leave edit mode before bridging.');
  const objs=this.topLevel(this.needMany(ids,2));
  if(objs.length!==2)throw new StageError('Bridge works on exactly two meshes.');
  for(const o of objs)if(!(o as THREE.Mesh).isMesh)throw new StageError(`${o.name} is not a mesh. Bridge works on meshes.`);
  const meshes=objs as THREE.Mesh[];
  this.root.updateWorldMatrix(true,true);
  const inv=this.root.matrixWorld.clone().invert();
  const datas=meshes.map(m=>{
   const d=this.meshDataOf(m);
   const w=inv.clone().multiply(m.matrixWorld);
   const e=w.elements;
   const positions=new Array<number>(d.positions.length);
   for(let i=0;i<d.positions.length;i+=3){
    const x=d.positions[i],y=d.positions[i+1],z=d.positions[i+2];
    positions[i]=e[0]*x+e[4]*y+e[8]*z+e[12];
    positions[i+1]=e[1]*x+e[5]*y+e[9]*z+e[13];
    positions[i+2]=e[2]*x+e[6]*y+e[10]*z+e[14];
   }
   const index=w.determinant()<0?(()=>{const idx=[];for(let f=0;f<d.index.length;f+=3)idx.push(d.index[f],d.index[f+2],d.index[f+1]);return idx;})():[...d.index];
   const out:MeshData={positions,index,...(d.uvs?{uvs:[...d.uvs]}:{})};
   return out;
  });
  let out:MeshData;
  try{out=bridgeMesh(datas[0],datas[1],twist);}catch(e){throw e instanceof EditError?new StageError(e.message):e;}
  const g=this.buildGeometry(out);
  const items=meshes.map(o=>({o,parent:o.parent!,at:o.parent!.children.indexOf(o)})).sort((a,b)=>a.parent.id-b.parent.id||a.at-b.at);
  for(const i of [...items].reverse())i.parent.remove(i.o);
  const result=new THREE.Mesh(g,(meshes[0].material as THREE.Material).clone());
  result.name=this.uniqueName(meshes[0].name);
  this.attach0(result,this.root,this.root.children.length);
  let owned=true;
  this.push({label:{key:'studio3d.hist.bridge',params:{name:meshes[0].name,other:meshes[1].name}},undo:()=>{this.root.remove(result);for(const i of items)this.attach0(i.o,i.parent,i.at);owned=false;},redo:()=>{for(const i of [...items].reverse())i.parent.remove(i.o);this.attach0(result,this.root,this.root.children.length);owned=true;},
   release:()=>{if(owned)for(const i of items)disposeObject(i.o);else disposeObject(result);}});
  return 1;
 }
 /** Combines exactly two meshes with a 3D boolean (union, subtract or intersect) in world space. The originals are removed; one undo step restores both. */
 booleanOp(op:'union'|'subtract'|'intersect',ids:number[]):number{
  if(this.editId!=null)throw new StageError('Leave edit mode before a boolean.');
  const objs=this.topLevel(this.needMany(ids,2));
  if(objs.length!==2)throw new StageError('Boolean works on exactly two meshes.');
  for(const o of objs)if(!(o as THREE.Mesh).isMesh)throw new StageError(`${o.name} is not a mesh. Booleans work on meshes.`);
  const meshes=objs as THREE.Mesh[];
  this.root.updateWorldMatrix(true,true);
  const inv=this.root.matrixWorld.clone().invert();
  const brushes=meshes.map(m=>{
   const d=this.meshDataOf(m);
   const w=inv.clone().multiply(m.matrixWorld);
   const e=w.elements;
   const positions=new Array<number>(d.positions.length);
   for(let i=0;i<d.positions.length;i+=3){
    const x=d.positions[i],y=d.positions[i+1],z=d.positions[i+2];
    positions[i]=e[0]*x+e[4]*y+e[8]*z+e[12];
    positions[i+1]=e[1]*x+e[5]*y+e[9]*z+e[13];
    positions[i+2]=e[2]*x+e[6]*y+e[10]*z+e[14];
   }
   const index=w.determinant()<0?(()=>{const idx=[];for(let f=0;f<d.index.length;f+=3)idx.push(d.index[f],d.index[f+2],d.index[f+1]);return idx;})():[...d.index];
   const g=new THREE.BufferGeometry();
   g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(positions),3));
   g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(d.uvs??new Array<number>((positions.length/3)*2).fill(0)),2));
   g.setIndex(index);
   g.computeVertexNormals();
   return new Brush(g);
  });
  const OPS={union:ADDITION,subtract:SUBTRACTION,intersect:INTERSECTION} as const;
  let res:Brush;
  try{const ev=new Evaluator();ev.useGroups=false;res=ev.evaluate(brushes[0],brushes[1],OPS[op]);}
  catch(e){throw new StageError(`Boolean failed: ${e instanceof Error?e.message:String(e)}`);}
  const rg=res.geometry;
  const posA=rg.getAttribute('position') as THREE.BufferAttribute;
  const uvA=rg.getAttribute('uv') as THREE.BufferAttribute|undefined;
  const idxA=rg.index;
  if(!idxA||idxA.count===0){for(const b of brushes)b.geometry.dispose();rg.dispose();throw new StageError('The boolean result is empty.');}
  const out:MeshData={positions:[...posA.array] as number[],index:[...idxA.array] as number[],...(uvA?{uvs:[...uvA.array] as number[]}:{})};
  for(const b of brushes)b.geometry.dispose();
  const g=this.buildGeometry(out);
  rg.dispose();
  const items=meshes.map(o=>({o,parent:o.parent!,at:o.parent!.children.indexOf(o)})).sort((a,b)=>a.parent.id-b.parent.id||a.at-b.at);
  for(const i of [...items].reverse())i.parent.remove(i.o);
  const result=new THREE.Mesh(g,(meshes[0].material as THREE.Material).clone());
  result.name=this.uniqueName(meshes[0].name);
  this.attach0(result,this.root,this.root.children.length);
  let owned=true;
  this.push({label:{key:'studio3d.hist.boolean',params:{name:meshes[0].name,other:meshes[1].name}},undo:()=>{this.root.remove(result);for(const i of items)this.attach0(i.o,i.parent,i.at);owned=false;},redo:()=>{for(const i of [...items].reverse())i.parent.remove(i.o);this.attach0(result,this.root,this.root.children.length);owned=true;},
   release:()=>{if(owned)for(const i of items)disposeObject(i.o);else disposeObject(result);}});
  return 1;
 }
 /** Rebuilds meshes as an even voxel grid (binary voxelization + surface nets, vertices projected onto the source). UVs, masks and seams are dropped. One undo step for the whole set. */
 remesh(resolution:number,ids:number[]):number{
  if(this.editId!=null)throw new StageError('Leave edit mode before remeshing.');
  if(!Number.isInteger(resolution)||resolution<8||resolution>128)throw new StageError('The remesh resolution must be a whole number between 8 and 128.');
  const objs=this.topLevel(this.needMany(ids,1));
  for(const o of objs)if(!(o as THREE.Mesh).isMesh)throw new StageError(`${o.name} is not a mesh. Remesh works on meshes.`);
  const list=(objs as THREE.Mesh[]).map(mesh=>{
   const data=this.meshDataOf(mesh);
   let out:MeshData;try{out=remeshMesh(data,resolution);}catch(e){throw e instanceof EditError?new StageError(e.message):e;}
   const g=this.buildGeometry(out);
   return{mesh,before:{g:mesh.geometry,d:mesh.userData.somniaPrimitive,s:this.seamsOf(mesh)},after:g};
  });
  const set=(k:'before'|'after')=>{for(const l of list){if(k==='after'){l.mesh.geometry=l.after;delete l.mesh.userData.somniaPrimitive;this.setSeams(l.mesh,[]);}else{l.mesh.geometry=l.before.g;if(l.before.d!==undefined)l.mesh.userData.somniaPrimitive=l.before.d;this.setSeams(l.mesh,l.before.s);}}};
  let owned=true;
  set('after');
  this.push({label:{key:'studio3d.hist.remesh',params:{count:list.length,name:list[0].mesh.name}},undo:()=>{set('before');owned=false;},redo:()=>{set('after');owned=true;},release:()=>{for(const l of list)(owned?l.before.g:l.after).dispose();}});
  return list.length;
 }
 /** Shows or hides an object. A hidden parent hides its whole subtree. One undo step. */
 setHidden(id:number,hidden:boolean){
  const o=this.need(id);if(o===this.root)throw new StageError('The scene root cannot be hidden.');
  if(o.visible===!hidden)return;
  o.visible=!hidden;this.push({label:{key:hidden?'studio3d.hist.hide':'studio3d.hist.show',params:{name:o.name}},undo:()=>{o.visible=hidden;},redo:()=>{o.visible=!hidden;}});
 }
 /** Locks an object against viewport picking and marquee selection. One undo step. */
 setLocked(id:number,locked:boolean){
  const o=this.need(id);if(o===this.root)throw new StageError('The scene root cannot be locked.');
  if((o.userData.somniaLocked===true)===locked)return;
  o.userData.somniaLocked=locked;this.push({label:{key:locked?'studio3d.hist.lock':'studio3d.hist.unlock',params:{name:o.name}},undo:()=>{o.userData.somniaLocked=!locked;},redo:()=>{o.userData.somniaLocked=locked;}});
 }
 /** Moves objects under a new parent (null = scene root), keeping their world transforms. One undo step for all. */
 reparent(ids:number[],parentId:number|null,index?:number){
  const objs=this.topLevel(this.needMany(ids,1));
  const parent=parentId==null?this.root:this.need(parentId);
  if((parent as THREE.Bone).isBone)throw new StageError('Objects cannot be moved under a bone.');
  for(const o of objs){
   if(o===parent)throw new StageError(`${o.name} cannot be moved into itself.`);
   for(let p=parent.parent;p;p=p.parent)if(p===o)throw new StageError(`${o.name} cannot be moved into its own child.`);
  }
  const before=objs.map(o=>({o,from:o.parent!,at:o.parent!.children.indexOf(o)}));
  const move=()=>{
   for(const o of objs)parent.attach(o);
   // An explicit slot pulls the moved children out of the end and inserts them in order.
   if(index!==undefined){
    const ch=parent.children;let slot=Math.max(0,Math.min(index,ch.length-objs.length));
    for(const o of objs){ch.splice(ch.indexOf(o),1);ch.splice(slot++,0,o);}
   }
  };
  const back=()=>{for(const b of before){b.from.attach(b.o);const ch=b.from.children;ch.splice(ch.indexOf(b.o),1);ch.splice(Math.min(b.at,ch.length),0,b.o);}};
  move();this.push({label:{key:parent===this.root?'studio3d.hist.moveRoot':'studio3d.hist.move',params:{count:objs.length,name:objs[0].name,target:parent===this.root?'':parent.name||'a new parent'}},undo:back,redo:move});
 }
 /** Moves objects next to a sibling in the outline: same parent as the target, one slot before or after it. World transforms are kept. */
 reorder(ids:number[],targetId:number,where:'before'|'after'){
  const objs=this.topLevel(this.needMany(ids,1));
  const target=this.need(targetId);
  if(objs.some(o=>o===target||o===this.root))return; // dropping a row onto itself is a no-op
  const parent=target.parent;
  if(!parent)throw new StageError('The scene root cannot be reordered.');
  const dragged=new Set(objs.map(o=>o.id));
  let slot=parent.children.filter(c=>!dragged.has(c.id)).indexOf(target);
  if(slot<0)return;
  if(where==='after')slot+=1;
  this.reparent(ids,parent===this.root?null:parent.id,slot);
 }
 rename(id:number,name:string){
  const o=this.need(id);const n=name.trim();if(!n)throw new StageError('A name cannot be empty.');if(n===o.name)return;
  const before=o.name;o.name=n;this.push({label:{key:'studio3d.hist.rename',params:{name:before}},undo:()=>{o.name=before;},redo:()=>{o.name=n;}});
 }
 remove(id:number){
  const o=this.need(id);const parent=o.parent;if(!parent)throw new StageError('The scene root cannot be deleted.');
  if((o as THREE.Bone).isBone)throw new StageError('Bones cannot be deleted: the skin would lose a joint.');
  const at=parent.children.indexOf(o);parent.remove(o);let owned=false;
  this.push({label:{key:'studio3d.hist.delete',params:{name:o.name}},undo:()=>{this.attach0(o,parent,at);owned=true;},redo:()=>{parent.remove(o);owned=false;},release:()=>{if(!owned)disposeObject(o);}});
 }
 duplicate(id:number):THREE.Object3D{
  const o=this.need(id);if(o===this.root)throw new StageError('The scene root cannot be duplicated.');
  if((o as THREE.Bone).isBone)throw new StageError('Bones cannot be duplicated: the skin would lose a joint.');
  const copy=o.clone(true);
  // clone() shares geometry and material. Give the copy its own material so edits stay independent; geometry stays shared and is only freed with the last owner.
  copy.traverse(c=>{const m=c as THREE.Mesh;if(m.isMesh&&!Array.isArray(m.material))m.material=(m.material as THREE.Material).clone();});
  copy.name=this.uniqueName(o.name+' copy');copy.position.x+=0.5;
  const parent=o.parent??this.root;this.attach(copy,parent,parent.children.indexOf(o)+1,{key:'studio3d.hist.duplicate',params:{name:o.name}});return copy;
 }
 /** The chain below (and including) a root bone, depth-first - the same order bones() lists them in. */
 private boneChain(root:THREE.Bone):THREE.Bone[]{const out:THREE.Bone[]=[];root.traverse(o=>{if((o as THREE.Bone).isBone)out.push(o as THREE.Bone);});return out;}
 /** Bone segments in a mesh's local space: head is the joint, tail runs towards the average child joint; leaf joints extend their incoming direction, a lone root goes a small step up. Deterministic. */
 private boneSegments(chain:THREE.Bone[],space:THREE.Object3D):BoneSegment[]{
  const heads=chain.map(b=>space.worldToLocal(b.getWorldPosition(new THREE.Vector3())));
  return chain.map((b,i)=>{
   const kids=chain.map((c,j)=>c.parent===b?j:-1).filter(j=>j>=0);
   let tail:THREE.Vector3;
   if(kids.length)tail=kids.reduce((a,j)=>a.add(heads[j]),new THREE.Vector3()).multiplyScalar(1/kids.length);
   else{const p=chain.indexOf(b.parent as THREE.Bone);tail=p>=0?heads[i].clone().multiplyScalar(2).sub(heads[p]):heads[i].clone().add(new THREE.Vector3(0,0.1,0));}
   return{head:[heads[i].x,heads[i].y,heads[i].z],tail:[tail.x,tail.y,tail.z]};
  });
 }
 private weightsFor(mesh:THREE.Mesh,chain:THREE.Bone[],mode:'smooth'|'rigid'):SkinWeights{
  const pos=mesh.geometry.getAttribute('position');if(!pos)throw new StageError(`${mesh.name} has no vertices to skin.`);
  const segments=this.boneSegments(chain,mesh);
  return mode==='rigid'?rigidWeights(pos.array as ArrayLike<number>,segments):smoothWeights(pos.array as ArrayLike<number>,segments);
 }
 /** Binds a plain mesh to the chain below a bone: it becomes a skinned mesh with auto-computed weights (smooth falloff or rigid nearest-joint). The mesh keeps its id, uuid, transform, material and clips; its parametric shape editing ends. One undo step. */
 skinBind(id:number,boneId:number,mode:'smooth'|'rigid'):THREE.SkinnedMesh{
  const o=this.need(id);const mesh=o as THREE.Mesh;const bone=this.need(boneId) as THREE.Bone;
  if(!mesh.isMesh)throw new StageError(`${o.name} is not a mesh.`);
  if((mesh as THREE.SkinnedMesh).isSkinnedMesh)throw new StageError(`${o.name} is already skinned; recompute its weights instead.`);
  if(!bone.isBone)throw new StageError('That target is not a bone.');
  const parent=o.parent??this.root;const at=parent.children.indexOf(o);
  this.root.updateMatrixWorld(true);
  const chain=this.boneChain(bone);
  let w:SkinWeights;try{w=this.weightsFor(mesh,chain,mode);}catch(e){throw e instanceof SkinError?new StageError(e.message):e;}
  // The geometry is cloned: duplicates share it and must not grow skin attributes.
  const geo=mesh.geometry.clone();
  geo.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(w.indices,4));
  geo.setAttribute('skinWeight',new THREE.Float32BufferAttribute(w.weights,4));
  const skinned=new THREE.SkinnedMesh(geo,mesh.material);
  skinned.name=mesh.name;skinned.position.copy(mesh.position);skinned.quaternion.copy(mesh.quaternion);skinned.scale.copy(mesh.scale);
  skinned.visible=mesh.visible;skinned.castShadow=mesh.castShadow;skinned.receiveShadow=mesh.receiveShadow;
  skinned.userData={...mesh.userData};delete skinned.userData.somniaPrimitive;
  // Same uuid: existing clip tracks keep binding to the mesh. (Object3D.id is read-only, so the caller re-selects the returned mesh.)
  skinned.uuid=mesh.uuid;
  skinned.bind(new THREE.Skeleton(chain,chain.map(b=>b.matrixWorld.clone().invert())),mesh.matrixWorld.clone());
  const swap=(inn:THREE.Object3D,out:THREE.Object3D)=>{parent.remove(out);this.attach0(inn,parent,at);};
  swap(skinned,mesh);let meshLive=false;
  this.push({label:{key:'studio3d.hist.bind',params:{name:o.name,bone:bone.name||'bones'}},undo:()=>{swap(mesh,skinned);meshLive=true;},redo:()=>{swap(skinned,mesh);meshLive=false;},
   // Only the cloned geometry is exclusively ours; the original mesh may share its geometry and material with duplicates.
   release:()=>{if(meshLive)geo.dispose();}});
  this.emit();return skinned;
 }
 /** True when two matrices match within a small absolute tolerance (scaled by the matrix size). */
 private matricesNear(a:THREE.Matrix4,b:THREE.Matrix4):boolean{
  const e=a.elements,f=b.elements;let scale=1;for(const v of f)scale=Math.max(scale,Math.abs(v));
  const tol=1e-4*scale;
  for(let i=0;i<16;i++)if(Math.abs(e[i]-f[i])>tol)return false;
  return true;
 }
 /** Posed joints make auto-weights land wrong, so they are snapped back to the bind pose first. Returns the pose restore data, or null when the skeleton already was in bind pose. */
 private poseReset(skeleton:THREE.Skeleton):{bone:THREE.Bone;p:THREE.Vector3;q:THREE.Quaternion;s:THREE.Vector3}[]|null{
  const bones=skeleton.bones,bindWorld=skeleton.boneInverses.map(m=>new THREE.Matrix4().copy(m).invert());
  if(bones.every((b,i)=>this.matricesNear(b.matrixWorld,bindWorld[i])))return null;
  const before=bones.map(b=>({bone:b,p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()}));
  bones.forEach((b,i)=>{
   const pi=bones.indexOf(b.parent as THREE.Bone);
   const parentWorld=pi>=0?bindWorld[pi]:(b.parent?b.parent.matrixWorld:new THREE.Matrix4());
   new THREE.Matrix4().copy(parentWorld).invert().multiply(bindWorld[i]).decompose(b.position,b.quaternion,b.scale);
  });
  this.root.updateMatrixWorld(true);
  return before;
 }
 private poseApplyRows(rows:{bone:THREE.Bone;p:THREE.Vector3;q:THREE.Quaternion;s:THREE.Vector3}[]){for(const r of rows){r.bone.position.copy(r.p);r.bone.quaternion.copy(r.q);r.bone.scale.copy(r.s);}this.root.updateMatrixWorld(true);}
 /** Recomputes the weights of an already skinned mesh against its current skeleton: smooth falloff, or rigid as the reset-to-nearest-joint bind. Posed joints are reset to the bind pose first, inside the same undo step. Returns true when a pose was reset. One undo step. */
 skinRebind(id:number,mode:'smooth'|'rigid'):boolean{
  const o=this.need(id);const mesh=o as THREE.SkinnedMesh;
  if(!mesh.isSkinnedMesh)throw new StageError(`${o.name} is not a skinned mesh; bind it to a bone chain first.`);
  this.root.updateMatrixWorld(true);
  const poseBefore=this.poseReset(mesh.skeleton);
  let w:SkinWeights;try{w=this.weightsFor(mesh,mesh.skeleton.bones,mode);}catch(e){throw e instanceof SkinError?new StageError(e.message):e;}
  const poseAfter=poseBefore?mesh.skeleton.bones.map(b=>({bone:b,p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()})):null;
  const geo=mesh.geometry;
  const beforeI=geo.getAttribute('skinIndex') as THREE.BufferAttribute,beforeW=geo.getAttribute('skinWeight') as THREE.BufferAttribute;
  const afterI=new THREE.Uint16BufferAttribute(w.indices,4),afterW=new THREE.Float32BufferAttribute(w.weights,4);
  let owned=true;const apply=(i:THREE.BufferAttribute,wt:THREE.BufferAttribute)=>{geo.setAttribute('skinIndex',i);geo.setAttribute('skinWeight',wt);};
  apply(afterI,afterW);
  this.push({label:{key:'studio3d.hist.weights',params:{name:o.name}},undo:()=>{apply(beforeI,beforeW);if(poseBefore)this.poseApplyRows(poseBefore);owned=false;},redo:()=>{apply(afterI,afterW);if(poseAfter)this.poseApplyRows(poseAfter);owned=true;},release:()=>{(owned?beforeI:afterI).dispose?.();(owned?beforeW:afterW).dispose?.();}});
  this.emit();return poseBefore!==null;
 }
 /** Weight painting: one stroke is one undo step. skinPaintStart snapshots the attributes, skinPaint dabs, skinPaintEnd closes the stroke. */
 private stroke:{id:number;geo:THREE.BufferGeometry;beforeI:THREE.BufferAttribute;beforeW:THREE.BufferAttribute}|null=null;
 /** Begins a paint stroke on a skinned mesh. Throws while another stroke is open. */
 skinPaintStart(id:number){
  const o=this.need(id);const mesh=o as THREE.SkinnedMesh;
  if(!mesh.isSkinnedMesh)throw new StageError(`${o.name} is not a skinned mesh; bind it to a bone chain first.`);
  if(this.stroke)throw new StageError('A paint stroke is already in progress.');
  const geo=mesh.geometry;
  this.stroke={id,geo,beforeI:geo.getAttribute('skinIndex') as THREE.BufferAttribute,beforeW:geo.getAttribute('skinWeight') as THREE.BufferAttribute};
 }
 /** One brush dab on the open stroke. The bone is a skeleton index... no: a bone object id. Returns the touched vertex count. */
 skinPaint(id:number,boneId:number,center:readonly[number,number,number],brush:BrushSettings):number{
  const st=this.stroke;if(!st||st.id!==id)throw new StageError('Start a paint stroke first.');
  const mesh=this.need(id) as THREE.SkinnedMesh;const boneIdx=mesh.skeleton.bones.findIndex(b=>b.id===boneId);
  if(boneIdx<0)throw new StageError('That bone is not part of the mesh skeleton.');
  const pos=mesh.geometry.getAttribute('position');if(!pos)throw new StageError(`${mesh.name} has no vertices to paint.`);
  // Fresh attribute objects per dab: the preview overlay notices the swap and repaints.
  const si=(st.geo.getAttribute('skinIndex') as THREE.BufferAttribute).clone() as THREE.BufferAttribute;
  const sw=(st.geo.getAttribute('skinWeight') as THREE.BufferAttribute).clone() as THREE.BufferAttribute;
  let n:number;try{n=paintWeights(pos.array as ArrayLike<number>,si.array as Uint16Array,sw.array as Float32Array,boneIdx,center,brush);}catch(e){throw e instanceof SkinError?new StageError(e.message):e;}
  if(n>0){st.geo.setAttribute('skinIndex',si);st.geo.setAttribute('skinWeight',sw);this.emit();}
  return n;
 }
 /** Closes the open stroke: all its dabs become one undo step. Safe to call with no stroke open. */
 skinPaintEnd(id:number,label:HistoryLabel={key:'studio3d.hist.paintWeights'}){
  const st=this.stroke;if(!st||st.id!==id){this.stroke=null;return;}
  this.stroke=null;
  const beforeI=st.beforeI,beforeW=st.beforeW;
  const afterI=st.geo.getAttribute('skinIndex') as THREE.BufferAttribute,afterW=st.geo.getAttribute('skinWeight') as THREE.BufferAttribute;
  if(afterI===beforeI&&afterW===beforeW)return; // not a single dab landed
  let owned=true;const apply=(i:THREE.BufferAttribute,w:THREE.BufferAttribute)=>{st.geo.setAttribute('skinIndex',i);st.geo.setAttribute('skinWeight',w);};
  this.push({label,undo:()=>{apply(beforeI,beforeW);owned=false;},redo:()=>{apply(afterI,afterW);owned=true;},release:()=>{(owned?beforeI:afterI).dispose?.();(owned?beforeW:afterW).dispose?.();}});
  this.emit();
 }
 private uvInfo(m:THREE.Mesh):{hasUv:boolean;islands:number;seams:number}{
  const seams=this.seamsOf(m).length;
  if(!m.geometry.getAttribute('uv'))return{hasUv:false,islands:0,seams};
  try{const islands=uvIslands(this.meshDataOf(m),this.seamsOf(m));return{hasUv:true,islands:Math.max(...islands)+1,seams};}catch{return{hasUv:true,islands:0,seams};}
 }
 info(id:number):ObjectInfo|null{
  const o=this.find(id);if(!o)return null;const m=o as THREE.Mesh;const l=o as THREE.Light;
  const mat=m.isMesh&&!Array.isArray(m.material)&&(m.material as THREE.MeshStandardMaterial).isMeshStandardMaterial?m.material as THREE.MeshStandardMaterial:null;
  return{id:o.id,name:o.name,kind:(o as THREE.Bone).isBone?'bone':m.isMesh?readPin(o.userData)!==null?'pin':'mesh':l.isLight?'light':(o as THREE.Camera).isCamera?'camera':'group',
   pin:readPin(o.userData),
   position:{x:o.position.x,y:o.position.y,z:o.position.z},rotation:{x:o.rotation.x/DEG,y:o.rotation.y/DEG,z:o.rotation.z/DEG},scale:{x:o.scale.x,y:o.scale.y,z:o.scale.z},
   skinned:(m as THREE.SkinnedMesh).isSkinnedMesh===true,
   mirror:(o.userData.somniaMirror as {axis:'x'|'y'|'z';merge:number;bisect?:boolean}|undefined)??null,
   uv:m.isMesh?this.uvInfo(m):null,
   camera:(o as THREE.PerspectiveCamera).isPerspectiveCamera?{kind:'perspective' as const,fov:(o as THREE.PerspectiveCamera).fov}:(o as THREE.OrthographicCamera).isOrthographicCamera?{kind:'orthographic' as const,zoom:(o as THREE.OrthographicCamera).zoom}:null,
   primitive:this.primitiveOf(o),material:mat?{color:'#'+mat.color.getHexString(),metalness:mat.metalness,roughness:mat.roughness,emissive:'#'+mat.emissive.getHexString(),emissiveIntensity:mat.emissiveIntensity,opacity:mat.transparent||mat.alphaTest>0?mat.opacity:1,alphaMode:alphaModeOf(mat.transparent,mat.alphaTest),alphaCutoff:mat.alphaTest>0?mat.alphaTest:0.5,doubleSided:mat.side===THREE.DoubleSide,textures:Object.fromEntries((Object.keys(SLOT_CONFIG) as TextureSlot[]).map(k=>{const t=mat[SLOT_CONFIG[k].prop] as THREE.Texture|null;return[k,t?(t.name||'image'):null];})) as Record<TextureSlot,string|null>,transforms:Object.fromEntries((Object.keys(SLOT_CONFIG) as TextureSlot[]).map(k=>{const t=mat[SLOT_CONFIG[k].prop] as THREE.Texture|null;return[k,t?readTransform(t):null];})) as Record<TextureSlot,TextureTransform|null>}:null,light:l.isLight?lightInfo(l):null};
 }
 /** Materials in the scene with the meshes using them, most-used first. Unnamed instances are numbered after collection so the list is stable. */
 materialUsage():MaterialUsage[]{
  const map=new Map<string,MaterialUsage>();
  this.root.traverse(o=>{const mesh=o as THREE.Mesh;if(!mesh.isMesh)return;const list=Array.isArray(mesh.material)?mesh.material:[mesh.material];
   for(const mat of list){const std=mat as THREE.MeshStandardMaterial;let u=map.get(mat.uuid);
    if(!u){u={key:mat.uuid,name:(mat.name??'').trim(),color:std.color?('#'+std.color.getHexString()):'#b8bcc8',count:0,ids:[]};map.set(mat.uuid,u);}
    u.count++;u.ids.push(o.id);}});
  const out=[...map.values()];let n=0;
  for(const u of out)if(!u.name)u.name=`Material ${++n}`;
  out.sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
  return out;
 }
 measure(animations=this.clipList.length):{stats:ModelStats;outline:OutlineEntry[];bounds:Bounds|null}{
  const stats=emptyStats();stats.animations=animations;const outline:OutlineEntry[]=[];const mats=new Set<THREE.Material>(),texs=new Set<THREE.Texture>();
  const instanced=new Map<THREE.BufferGeometry,Set<THREE.Material>>();
  const walk=(o:THREE.Object3D,depth:number)=>{
   const mesh=o as THREE.Mesh;const kind:OutlineEntry['kind']=(o as THREE.Bone).isBone?'bone':mesh.isMesh?readPin(o.userData)!==null?'pin':'mesh':(o as THREE.Light).isLight?'light':(o as THREE.Camera).isCamera?'camera':'group';
   if(kind==='bone')stats.bones++;
   if(depth>0){stats.nodes++;if(kind!=='bone')outline.push({id:o.id,name:o.name||`${kind} ${o.id}`,depth:depth-1,kind,hidden:!o.visible,locked:o.userData.somniaLocked===true});}
   if(kind==='camera')stats.cameras++;
   if(depth>0&&(o.scale.x===0||o.scale.y===0||o.scale.z===0))stats.zeroScale++;
   if(mesh.isMesh&&mesh.geometry){
    stats.meshes++;const pos=mesh.geometry.getAttribute('position');const count=pos?pos.count:0;const index=mesh.geometry.getIndex();
    stats.vertices+=count;stats.triangles+=Math.floor((index?index.count:count)/3);
    for(const a of Object.values(mesh.geometry.attributes))stats.geometryBytes+=(a as THREE.BufferAttribute).array.byteLength;if(index)stats.geometryBytes+=index.array.byteLength;
    let noUv=false;const list=Array.isArray(mesh.material)?mesh.material:[mesh.material];stats.draws+=Math.max(1,list.length);
    for(const mat of list){if(!mat)continue;mats.add(mat);for(const v of Object.values(mat as unknown as Record<string,unknown>))if(v instanceof THREE.Texture){texs.add(v);if(!mesh.geometry.getAttribute('uv'))noUv=true;}}
    if(noUv)stats.textureNoUv++;
    if(!Array.isArray(mesh.material)&&mesh.material){const seen=instanced.get(mesh.geometry);if(seen?.has(mesh.material))stats.instancingCandidates++;else if(seen)seen.add(mesh.material);else instanced.set(mesh.geometry,new Set([mesh.material]));}
   }
   for(const c of o.children)walk(c,depth+1);
  };
  walk(this.root,0);stats.materials=mats.size;stats.textures=texs.size;
  for(const t of texs){const im=t.image as {width?:number;height?:number}|null;const w=im?.width??0,h=im?.height??0;stats.textureBytes+=textureBytes(w,h);stats.maxTexture=Math.max(stats.maxTexture,w,h);}
  // Lights have no geometry: bound only the renderable content.
  const box=new THREE.Box3();this.root.traverse(o=>{if((o as THREE.Mesh).isMesh)box.expandByObject(o);});
  const bounds:Bounds|null=box.isEmpty()?null:{min:box.min.toArray() as [number,number,number],max:box.max.toArray() as [number,number,number]};
  return{stats,outline,bounds};
 }
}
