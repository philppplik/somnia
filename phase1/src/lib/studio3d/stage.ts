import {PRIMITIVE_KINDS,PrimitiveError,defaultParams,patchParams,readPrimitive,resolveMaterial,type PrimitiveKind,type PrimitiveData,type PrimitiveParams,type MaterialRequest} from './primitives';
import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {checkPbr,alphaState,alphaModeOf,MaterialError,SLOT_CONFIG,type PbrExtras,type AlphaMode,type TextureSlot} from './materials';
import type {NodeExtra} from './document';
import {EASES,isEase,bakeTrack,type Ease} from './ease';
import {buildExtras,type ClipMeta,type MetaTrack} from './clipMeta';
import {groupRefs,keyIndices,copyTrackKeys,shiftTrackKeys,pasteTrackKeys,type KeyRef,type KeyData,type TrackData} from './keyEdit';
import {KEY_PATHS,KEY_STRIDE,ClipError,MAX_CLIPS,MAX_KEYS_PER_TRACK,DEFAULT_CLIP_SECONDS,insertKey,removeKey as removeKeyData,findKey,isPlainTrack,trackName,parseTrackName,checkKeyTime,checkDuration,checkClipName,lastKeyTime,type KeyPath} from './clips';
import {mergeTransform,DEFAULT_TRANSFORM,UvError,type TextureTransform} from './uv';
import {textureBytes} from './validate';
import {smoothWeights,rigidWeights,paintWeights,SkinError,type BoneSegment,type SkinWeights,type BrushSettings} from './skinning';
import {checkPoseName,mirrorPose,blendPoses,PoseError,MAX_POSES} from './poses';import type {Pose,PoseBone} from './poses';
import {solveTwoBone,clampEuler,checkLimits,hasLimits,IkError,MAX_IK_CHAINS,fabrikSolve,aimBasis,MIN_FABRIK_SEGMENTS,MAX_FABRIK_SEGMENTS} from './ik';import type {AxisLimits} from './ik';
import {emptyStats,type ModelStats,type OutlineEntry,type Bounds} from './model';
/**
 * Scene operations for the 3D studio (P1 staging). Pure three.js core, no renderer and no DOM, so the logic runs under tsx --test.
 * Every user-visible change is one undo entry. Objects are addressed by Object3D.id.
 * Imported only by the lazy viewport chunk.
 */
export type {PrimitiveKind}from './primitives';
export type LightKind='directional'|'point'|'spot'|'area';
export const PRIMITIVES:readonly PrimitiveKind[]=PRIMITIVE_KINDS;
export const LIGHTS:readonly LightKind[]=['directional','point','spot','area'];
export interface Vec3{x:number;y:number;z:number}
export interface TransformPatch{position?:Partial<Vec3>;/** degrees */rotation?:Partial<Vec3>;scale?:Partial<Vec3>}
export interface MaterialPatch extends MaterialRequest,PbrExtras{}
export const MAX_MERGE_VERTICES=3_000_000;
export type MirrorAxis='x'|'y'|'z';
export interface ObjectInfo{
 camera:{fov:number}|null;
 /** Kind and parameters when the mesh is an editable primitive. */primitive?:PrimitiveData|null;
 id:number;name:string;kind:OutlineEntry['kind'];position:Vec3;rotation:Vec3;scale:Vec3;
 /** True for a skinned mesh (bound to a skeleton). */skinned:boolean;
 material:{color:string;metalness:number;roughness:number;emissive?:string;emissiveIntensity?:number;opacity?:number;alphaMode?:AlphaMode;alphaCutoff?:number;doubleSided?:boolean;/** Name of the image in each slot, or null */textures?:Record<TextureSlot,string|null>;/** UV transform per slot, null where the slot is empty */transforms?:Record<TextureSlot,TextureTransform|null>}|null;light:LightInfo|null;
}
export interface LightInfo{intensity:number;color:string;/** shadow casting; absent for area lights, which cannot cast shadows */shadow?:boolean;/** spot cone, degrees */angle?:number;penumbra?:number;width?:number;height?:number}
export interface LightPatch{intensity?:number;color?:string;shadow?:boolean;angle?:number;penumbra?:number;width?:number;height?:number}
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
/** Data glTF cannot hold: shadow flags and area lights (glTF punctual lights have no area light). */
export function collectNodeExtras(root:THREE.Object3D):NodeExtra[]{
 const out:NodeExtra[]=[];
 nodesOf(root).forEach((o,i)=>{
  const l=o as THREE.Light;if(!l.isLight)return;const ra=o as THREE.RectAreaLight;
  if(ra.isRectAreaLight){
   out.push({i,area:{position:o.position.toArray() as [number,number,number],quaternion:o.quaternion.toArray().slice(0,4) as [number,number,number,number],scale:o.scale.toArray() as [number,number,number],color:'#'+ra.color.getHexString(),intensity:ra.intensity,width:ra.width,height:ra.height,name:o.name}});
  }else if(l.castShadow)out.push({i,shadow:true});
 });
 return out;
}
/** Re-applies extras to a freshly loaded tree. Area lights replace the empty node the exporter wrote. Entries that no longer fit are skipped and counted. */
export function applyNodeExtras(root:THREE.Object3D,extras:readonly NodeExtra[]):{skipped:number}{
 const nodes=nodesOf(root);let skipped=0;
 for(const e of extras){
  const o=nodes[e.i];if(!o){skipped++;continue;}
  if(e.area){
   if(!o.parent||o.children.length>0||(o as THREE.Mesh).isMesh||(o as THREE.Light).isLight){skipped++;continue;}
   const a=e.area;const light=new THREE.RectAreaLight(new THREE.Color(a.color),a.intensity,a.width,a.height);
   light.name=a.name||o.name;light.position.fromArray(a.position);light.quaternion.fromArray(a.quaternion);light.scale.fromArray(a.scale);
   const parent=o.parent;const at=parent.children.indexOf(o);parent.remove(o);parent.add(light);parent.children.splice(parent.children.indexOf(light),1);parent.children.splice(at,0,light);
  }else if(e.shadow){const l=o as THREE.Light;if(l.isLight&&!(l as THREE.RectAreaLight).isRectAreaLight)l.castShadow=true;else skipped++;}
 }
 return{skipped};
}
interface ClipState{tracks:THREE.KeyframeTrack[];duration:number;ease:Record<string,Ease[]>}
const readTransform=(t:THREE.Texture):TextureTransform=>({offsetX:t.offset.x,offsetY:t.offset.y,scaleX:t.repeat.x,scaleY:t.repeat.y,rotation:t.rotation/DEG});
const writeTransform=(t:THREE.Texture,v:TextureTransform)=>{t.offset.set(v.offsetX,v.offsetY);t.repeat.set(v.scaleX,v.scaleY);t.rotation=v.rotation*DEG;t.center.set(0,0);t.matrixAutoUpdate=true;t.updateMatrix();};
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
 if(l.castShadow!==undefined&&!(l as THREE.RectAreaLight).isRectAreaLight)info.shadow=l.castShadow;
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
interface Entry{label:string;undo():void;redo():void;/** Edits with the same group id and object within GROUP_MS merge into one undo step (gizmo drags, key nudges). */group?:string;at?:number;merge?(redo:()=>void):void;/** Called when the entry falls off the history; frees objects only the redo side still owned. */release?():void}
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
 get undoLabel(){return this.canUndo?this.entries[this.cursor-1].label:'';}
 private push(e:Entry){
  // The saved state may live on the redo side that this entry discards: then no state is clean any more.
  if(this.saved>this.cursor)this.saved=-1;
  for(const dropped of this.entries.splice(this.cursor))dropped.release?.();
  this.entries.push(e);this.cursor=this.entries.length;this.emit();
 }
 undo(){if(!this.canUndo)return false;this.entries[--this.cursor].undo();this.emit();return true;}
 redo(){if(!this.canRedo)return false;this.entries[this.cursor++].redo();this.emit();return true;}
 /** Replaces the content with a freshly loaded model. History starts empty and the scene is clean. */
 load(model:THREE.Object3D|null){
  this.clear();if(model)this.root.add(model);this.emit();
 }
 clear(){
  this.bakedCache.clear();this.clipList=[];this.clipRevision++;this.poseLibs.clear();this.ikChains.clear();this.fabrikChains.clear();this.boneLimits.clear();
  for(const c of [...this.root.children]){this.root.remove(c);disposeObject(c);}
  for(const e of this.entries)e.release?.();this.entries=[];this.cursor=0;this.saved=0;this.emit();
 }
 /** Replaces the content with several loaded top-level nodes (no wrapper group). History starts empty and the scene is clean. */
 loadMany(nodes:THREE.Object3D[]){this.clear();for(const n of nodes)this.root.add(n);this.emit();}
 find(id:number):THREE.Object3D|undefined{return this.root.getObjectById(id);}
 private need(id:number):THREE.Object3D{const o=this.find(id);if(!o)throw new StageError(`No object with id ${id}.`);return o;}
 private uniqueName(base:string){
  const names=new Set<string>();this.root.traverse(o=>names.add(o.name));
  if(!names.has(base))return base;let i=2;while(names.has(`${base} ${i}`))i++;return `${base} ${i}`;
 }
 private attach(obj:THREE.Object3D,parent:THREE.Object3D,index:number,text:string){
  this.attach0(obj,parent,index);let owned=true;
  this.push({label:text,undo:()=>{parent.remove(obj);owned=false;},redo:()=>{this.attach0(obj,parent,index);owned=true;},release:()=>{if(!owned)disposeObject(obj);}});
 }
 private attach0(obj:THREE.Object3D,parent:THREE.Object3D,at:number){parent.add(obj);const i=parent.children.indexOf(obj);if(i!==at&&at<parent.children.length){parent.children.splice(i,1);parent.children.splice(at,0,obj);}}
 addPrimitive(kind:PrimitiveKind):THREE.Mesh{
  if(!PRIMITIVES.includes(kind))throw new StageError(`Unknown primitive: ${String(kind)}.`);
  const params=defaultParams(kind);
  const mesh=new THREE.Mesh(geometryFor(kind,params),new THREE.MeshStandardMaterial({color:0xb8bcc8,metalness:0,roughness:0.6}));
  mesh.name=this.uniqueName(label(kind));mesh.userData.somniaPrimitive={kind,params};
  if(kind!=='plane')mesh.position.y=kind==='cube'||kind==='cylinder'||kind==='cone'?0.5:kind==='sphere'?0.5:0.68;
  this.attach(mesh,this.root,this.root.children.length,`Add ${mesh.name}`);return mesh;
 }
 addLight(kind:LightKind):THREE.Light{
  if(!LIGHTS.includes(kind))throw new StageError(`Unknown light: ${String(kind)}.`);
  const light:THREE.Light=kind==='directional'?new THREE.DirectionalLight(0xffffff,2):kind==='point'?new THREE.PointLight(0xffffff,40,0,2)
   :kind==='spot'?new THREE.SpotLight(0xffffff,120,0,Math.PI/6,0.3,2):new THREE.RectAreaLight(0xffffff,6,2,2);
  light.name=this.uniqueName({directional:'Directional light',point:'Point light',spot:'Spot light',area:'Area light'}[kind]);light.position.set(3,4,2);
  if(kind==='area')light.lookAt(0,0,0);
  this.attach(light,this.root,this.root.children.length,`Add ${light.name}`);return light;
 }
 addCamera(pose?:{position:Vec3;quaternion:[number,number,number,number]},fov=40):THREE.PerspectiveCamera{
  const f=finite(fov,'fov');if(f<1||f>120)throw new StageError('fov must be between 1 and 120 degrees.');
  const cam=new THREE.PerspectiveCamera(f,1.5,0.1,100);cam.name=this.uniqueName('Camera');
  if(pose){cam.position.set(pose.position.x,pose.position.y,pose.position.z);cam.quaternion.set(...pose.quaternion);}else{cam.position.set(4,3,5);cam.lookAt(0,0.5,0);}
  this.attach(cam,this.root,this.root.children.length,`Add ${cam.name}`);return cam;
 }
 setCamera(id:number,patch:{fov:number}){
  const o=this.need(id) as THREE.PerspectiveCamera;if(!o.isPerspectiveCamera)throw new StageError(`${o.name} is not a camera.`);
  const f=finite(patch.fov,'fov');if(f<1||f>120)throw new StageError('fov must be between 1 and 120 degrees.');
  const before=o.fov;if(before===f)return;const set=(v:number)=>{o.fov=v;o.updateProjectionMatrix();};
  set(f);this.push({label:`Camera ${o.name}`,undo:()=>set(before),redo:()=>set(f)});
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
  const o=this.need(id);if((o as THREE.Bone).isBone)this.clampBone(o);
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
  this.push({label:`Transform ${o.name}`,undo:()=>{set(before);if(ak)this.restoreClip(ak.clip,ak.before);},redo:()=>redo(),group:key,at:now,merge:r=>{redo=r;}});
 }
 setLight(id:number,patch:LightPatch){
  const o=this.need(id) as THREE.Light;if(!o.isLight)throw new StageError(`${o.name} is not a light.`);
  const sp=o as THREE.SpotLight,ra=o as THREE.RectAreaLight;
  if(patch.color!==undefined&&!HEX.test(patch.color))throw new StageError('color must look like #rrggbb.');
  if(patch.shadow!==undefined){if(typeof patch.shadow!=='boolean')throw new StageError('shadow must be true or false.');if(ra.isRectAreaLight)throw new StageError('Area lights cannot cast shadows.');}
  if(patch.angle!==undefined&&!sp.isSpotLight)throw new StageError('Only spot lights have a cone angle.');
  if(patch.penumbra!==undefined&&!sp.isSpotLight)throw new StageError('Only spot lights have a penumbra.');
  if((patch.width!==undefined||patch.height!==undefined)&&!ra.isRectAreaLight)throw new StageError('Only area lights have a width and height.');
  const num=(v:number|undefined,what:string,min:number,max:number)=>{if(v===undefined)return undefined;const n=finite(v,what);if(n<min||n>max)throw new StageError(`${what} must be between ${min} and ${max}.`);return n;};
  const next={i:num(patch.intensity,'intensity',0,100000),c:patch.color,sh:patch.shadow,a:num(patch.angle,'angle',1,90),p:num(patch.penumbra,'penumbra',0,1),w:num(patch.width,'width',0.01,1000),h:num(patch.height,'height',0.01,1000)};
  const read=()=>({i:o.intensity,c:'#'+o.color.getHexString(),sh:o.castShadow,a:sp.isSpotLight?sp.angle/DEG:undefined,p:sp.isSpotLight?sp.penumbra:undefined,w:ra.isRectAreaLight?ra.width:undefined,h:ra.isRectAreaLight?ra.height:undefined});
  const before=read();
  const write=(v:ReturnType<typeof read>)=>{o.intensity=v.i;o.castShadow=v.sh;o.color.set(v.c);if(sp.isSpotLight){sp.angle=v.a!*DEG;sp.penumbra=v.p!;}if(ra.isRectAreaLight){ra.width=v.w!;ra.height=v.h!;}};
  const after={i:next.i??before.i,c:next.c??before.c,sh:next.sh??before.sh,a:next.a??before.a,p:next.p??before.p,w:next.w??before.w,h:next.h??before.h};
  if(JSON.stringify(after)===JSON.stringify(before))return;
  write(after);this.push({label:`Light ${o.name}`,undo:()=>write(before),redo:()=>write(after)});
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
  set(geo,p1);this.push({label:`Pivot of ${o.name}`,undo:()=>set(old,p0),redo:()=>set(geo,p1)});
 }
 private worldBox(o:THREE.Object3D){o.updateWorldMatrix(true,true);return new THREE.Box3().setFromObject(o);}
 private needMany(ids:number[],min:number){
  if(!Array.isArray(ids)||new Set(ids).size!==ids.length)throw new StageError('Choose each object only once.');
  if(ids.length<min)throw new StageError(`Select at least ${min} objects.`);
  return ids.map(id=>{const o=this.need(id);if(o===this.root)throw new StageError('The scene root cannot be moved.');return o;});
 }
 /** One undo step for moving several objects in world space. */
 private moveMany(text:string,moves:{o:THREE.Object3D;delta:THREE.Vector3}[]){
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
  this.moveMany(`Align ${axis.toUpperCase()}`,objs.map((o,i)=>{const b=boxes[i];const cur=to==='min'?b.min[axis]:to==='max'?b.max[axis]:(b.min[axis]+b.max[axis])/2;
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
  this.moveMany(`Distribute ${axis.toUpperCase()}`,moves);
 }
 /** Objects of a multi-selection without any whose ancestor is also selected. */
 private topLevel(objs:THREE.Object3D[]){const set=new Set(objs);return objs.filter(o=>{for(let p=o.parent;p;p=p.parent)if(set.has(p))return false;return true;});}
 snapshot(ids:number[]):TransformSnapshot[]{return ids.map(id=>{const o=this.need(id);return{id,p:o.position.clone(),r:o.rotation.clone(),s:o.scale.clone()};});}
 /** Records a group transform that already happened (a group gizmo drag). One undo step for all objects. */
 commitMany(before:TransformSnapshot[],text='Transform selection'){
  const list=before.map(b=>{const o=this.need(b.id);return{o,b,a:{p:o.position.clone(),r:o.rotation.clone(),s:o.scale.clone()}};})
   .filter(x=>!(x.b.p.equals(x.a.p)&&x.b.r.equals(x.a.r)&&x.b.s.equals(x.a.s)));
  if(!list.length)return;
  const set=(k:'b'|'a')=>{for(const x of list){x.o.position.copy(x[k].p);x.o.rotation.copy(x[k].r);x.o.scale.copy(x[k].s);}};
  this.push({label:text,undo:()=>set('b'),redo:()=>set('a')});
 }
 /** Moves several objects by the same world offset in one undo step. */
 translateMany(ids:number[],delta:Partial<Vec3>){
  const objs=this.topLevel(this.needMany(ids,1));const d=new THREE.Vector3(finite(delta.x??0,'x'),finite(delta.y??0,'y'),finite(delta.z??0,'z'));
  this.moveMany(`Move ${objs.length} objects`,objs.map(o=>({o,delta:d.clone()})));
 }
 /** Deletes several objects in one undo step. */
 removeMany(ids:number[]){
  const objs=this.topLevel(this.needMany(ids,1));
  const items=objs.map(o=>({o,parent:o.parent!,at:o.parent!.children.indexOf(o)})).sort((a,b)=>a.parent.id-b.parent.id||a.at-b.at);
  for(const i of [...items].reverse())i.parent.remove(i.o);
  let owned=false;
  this.push({label:`Delete ${items.length} objects`,undo:()=>{for(const i of items)this.attach0(i.o,i.parent,i.at);owned=true;},redo:()=>{for(const i of items)i.parent.remove(i.o);owned=false;},release:()=>{if(!owned)for(const i of items)disposeObject(i.o);}});
 }
 /** Duplicates several objects in one undo step. Copies get their own materials and a small offset. */
 duplicateMany(ids:number[]):THREE.Object3D[]{
  const objs=this.topLevel(this.needMany(ids,1));const items:{o:THREE.Object3D;parent:THREE.Object3D;at:number}[]=[];
  for(const src of objs){
   const copy=src.clone(true);copy.traverse(c=>{const m=c as THREE.Mesh;if(m.isMesh&&!Array.isArray(m.material))m.material=(m.material as THREE.Material).clone();});
   copy.name=this.uniqueName(src.name+' copy');copy.position.x+=0.5;
   const parent=src.parent??this.root;items.push({o:copy,parent,at:parent.children.length});this.attach0(copy,parent,parent.children.length);
  }
  let owned=true;
  this.push({label:`Duplicate ${items.length} objects`,undo:()=>{for(const i of items)i.parent.remove(i.o);owned=false;},redo:()=>{for(const i of items)this.attach0(i.o,i.parent,i.at);owned=true;},release:()=>{if(!owned)for(const i of items)disposeObject(i.o);}});
  return items.map(i=>i.o);
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
  this.push({label:`Shape of ${o.name}`,undo:()=>{apply(before,beforeData);owned=false;},redo:()=>{apply(after,afterData);owned=true;},release:()=>{(owned?before:after).dispose();}});
 }
 setMaterial(id:number,request:MaterialPatch){
  const o=this.need(id);const mesh=o as THREE.Mesh;let patch:{color?:string;metalness?:number;roughness?:number};
  try{patch=resolveMaterial(request);checkPbr(request);}catch(e){throw e instanceof PrimitiveError||e instanceof MaterialError?new StageError(e.message):e;}
  if(!mesh.isMesh||Array.isArray(mesh.material)||!(mesh.material as THREE.MeshStandardMaterial).isMeshStandardMaterial)throw new StageError(`${o.name} has no editable PBR material.`);
  if(patch.color!==undefined&&!HEX.test(patch.color))throw new StageError('color must look like #rrggbb.');
  const mat=mesh.material as THREE.MeshStandardMaterial;
  const take=()=>({c:mat.color.clone(),m:mat.metalness,r:mat.roughness,e:mat.emissive.clone(),ei:mat.emissiveIntensity,op:mat.opacity,tr:mat.transparent,at:mat.alphaTest,dw:mat.depthWrite,side:mat.side});
  const before=take();const next=take();
  if(patch.color)next.c=new THREE.Color(patch.color);
  if(patch.metalness!==undefined)next.m=clamp01(finite(patch.metalness,'metalness'));
  if(patch.roughness!==undefined)next.r=clamp01(finite(patch.roughness,'roughness'));
  if(request.emissive!==undefined)next.e=new THREE.Color(request.emissive);
  if(request.emissiveIntensity!==undefined)next.ei=request.emissiveIntensity;
  if(request.doubleSided!==undefined)next.side=request.doubleSided?THREE.DoubleSide:THREE.FrontSide;
  if(request.opacity!==undefined||request.alphaMode!==undefined||request.alphaCutoff!==undefined){
   const cur=alphaModeOf(before.tr,before.at);
   // Lowering opacity on an opaque material means the user wants it see-through.
   const mode=request.alphaMode??(cur==='opaque'&&request.opacity!==undefined&&request.opacity<1?'blend':cur);
   const a=alphaState(mode,request.opacity??(before.tr||before.at>0?before.op:1),request.alphaCutoff??(before.at>0?before.at:0.5));
   next.tr=a.transparent;next.op=a.opacity;next.at=a.alphaTest;next.dw=a.depthWrite;
  }
  const same=(x:ReturnType<typeof take>,y:ReturnType<typeof take>)=>x.c.equals(y.c)&&x.e.equals(y.e)&&x.m===y.m&&x.r===y.r&&x.ei===y.ei&&x.op===y.op&&x.tr===y.tr&&x.at===y.at&&x.dw===y.dw&&x.side===y.side;
  if(same(before,next))return;
  const set=(sn:typeof before)=>{mat.color.copy(sn.c);mat.metalness=sn.m;mat.roughness=sn.r;mat.emissive.copy(sn.e);mat.emissiveIntensity=sn.ei;mat.opacity=sn.op;mat.transparent=sn.tr;mat.alphaTest=sn.at;mat.depthWrite=sn.dw;mat.side=sn.side;mat.needsUpdate=true;};
  set(next);this.push({label:`Material of ${o.name}`,undo:()=>set(before),redo:()=>set(next)});
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
  this.push({label:`${slot} texture of ${o.name}`,undo:()=>{set(before);owned=false;},redo:()=>{set(texture);owned=true;},release:()=>{(owned?before:texture)?.dispose();}});
 }
 /** Changes offset, scale or rotation of the image in one slot. One undo step. Several texture slots of one material share nothing, so each is set on its own. */
 setTextureTransform(id:number,slot:TextureSlot,patch:Partial<TextureTransform>|'reset'){
  const o=this.need(id);const mesh=o as THREE.Mesh;const cfg=SLOT_CONFIG[slot];if(!cfg)throw new StageError(`Unknown texture slot: ${String(slot)}.`);
  if(!mesh.isMesh||Array.isArray(mesh.material))throw new StageError(`${o.name} has no editable PBR material.`);
  const tex=(mesh.material as unknown as Record<string,unknown>)[cfg.prop] as THREE.Texture|null;if(!tex)throw new StageError(`The ${slot} slot of ${o.name} has no image.`);
  let next:TextureTransform;try{next=patch==='reset'?{...DEFAULT_TRANSFORM}:mergeTransform(readTransform(tex),patch);}catch(e){if(e instanceof UvError)throw new StageError(e.message);throw e;}
  const before=readTransform(tex);if(JSON.stringify(before)===JSON.stringify(next))return;
  const set=(t:TextureTransform)=>{writeTransform(tex,t);};set(next);
  this.push({label:`${slot} texture mapping of ${o.name}`,undo:()=>set(before),redo:()=>set(next)});
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
 private editClip(i:number,label:string,make:(clip:THREE.AnimationClip)=>ClipState){
  const clip=this.needClip(i);const before=this.snapClip(clip);const next=make(clip);
  this.restoreClip(clip,next);this.push({label,undo:()=>this.restoreClip(clip,before),redo:()=>this.restoreClip(clip,next)});
 }
 private uniqueClipName(base:string){const names=new Set(this.clipList.map(c=>c.name));if(!names.has(base))return base;let n=2;while(names.has(`${base} ${n}`))n++;return `${base} ${n}`;}
 addClip(name?:string,duration=DEFAULT_CLIP_SECONDS):number{
  if(this.clipList.length>=MAX_CLIPS)throw new ClipError(`A scene can have at most ${MAX_CLIPS} clips.`);
  const clip=new THREE.AnimationClip(this.uniqueClipName(name===undefined?'Clip':checkClipName(name)),checkDuration(duration),[]);
  const at=this.clipList.length;const add=()=>{this.clipList.splice(at,0,clip);this.clipRevision++;};add();
  this.push({label:`Add clip ${clip.name}`,undo:()=>{this.clipList.splice(at,1);this.clipRevision++;},redo:add});return at;
 }
 /** Duplicates a clip with all tracks and their easing, right after the original. One undo step. */
 duplicateClip(i:number):number{
  if(this.clipList.length>=MAX_CLIPS)throw new ClipError(`A scene can have at most ${MAX_CLIPS} clips.`);
  const src=this.needClip(i);
  const copy=new THREE.AnimationClip(this.uniqueClipName(`${src.name} copy`),src.duration,src.tracks.map(t=>t.clone()));
  (copy.userData as {ease?:unknown}).ease=Object.fromEntries(Object.entries(this.easeOf(src)).map(([k,v])=>[k,v.slice()]));
  const at=i+1;const add=()=>{this.clipList.splice(at,0,copy);this.clipRevision++;};add();
  this.push({label:`Duplicate clip ${src.name}`,undo:()=>{this.clipList.splice(at,1);this.clipRevision++;},redo:add});
  return at;
 }
 removeClip(i:number){
  const clip=this.needClip(i);const del=()=>{this.clipList.splice(i,1);this.clipRevision++;};del();
  this.push({label:`Delete clip ${clip.name}`,undo:()=>{this.clipList.splice(i,0,clip);this.clipRevision++;},redo:del});
 }
 renameClip(i:number,name:string){
  const clip=this.needClip(i);const next=checkClipName(name);const before=clip.name;if(next===before)return;
  const set=(n:string)=>{clip.name=n;this.clipRevision++;};set(next);this.push({label:`Rename clip ${before}`,undo:()=>set(before),redo:()=>set(next)});
 }
 /** Sets the length of a clip. It cannot end before its last key. */
 setClipDuration(i:number,duration:number){
  const clip=this.needClip(i);const d=checkDuration(duration);const last=Math.max(0,...clip.tracks.map(t=>lastKeyTime(t.times)));
  if(d<last)throw new ClipError(`The clip cannot end before its last key at ${last} s.`);
  if(d===clip.duration)return;this.editClip(i,`Length of clip ${clip.name}`,c=>({...this.snapClip(c),duration:d}));
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
 private restoreLocals(chain:THREE.Bone[],rows:PoseBone[]){chain.forEach((b,i)=>{const r=rows[i];if(!r)return;b.position.fromArray(r.p as number[]);b.quaternion.fromArray(r.q as number[]);b.scale.fromArray(r.s as number[]);});this.root.updateMatrixWorld(true);}
 private applyPoseRecord(chain:THREE.Bone[],bones:Record<string,PoseBone>){for(const b of chain){const r=bones[b.name];if(!r)continue;b.position.fromArray(r.p as number[]);b.quaternion.fromArray(r.q as number[]);b.scale.fromArray(r.s as number[]);}this.root.updateMatrixWorld(true);}
 /** Applies a pose record to the rig as one undo step. */
 private poseSet(id:number,label:string,bones:Record<string,PoseBone>){
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
  this.push({label:`Save pose ${n}`,undo:()=>{lib.splice(at,1);},redo:()=>{lib.splice(at,0,{name:n,bones});}});this.emit();
 }
 /** Applies a saved pose. One undo step. */
 poseApply(id:number,name:string){const root=this.rigOf(id);this.poseSet(id,`Pose ${name}`,this.needPose(root,name).bones);}
 /** Applies the L/R mirror of a saved pose (name pairs like Arm.L/Arm.R or LeftArm/RightArm swap). One undo step. */
 poseMirror(id:number,name:string){const root=this.rigOf(id);this.poseSet(id,`Mirror pose ${name}`,mirrorPose(this.needPose(root,name)).bones);}
 /** Blends two saved poses (t=0 is a, t=1 is b) and applies the mix. One undo step. */
 poseBlend(id:number,a:string,b:string,t:number){const root=this.rigOf(id);this.poseSet(id,`Blend ${a} and ${b}`,blendPoses(this.needPose(root,a),this.needPose(root,b),t).bones);}
 /** Removes a saved pose. One undo step. */
 poseRemove(id:number,name:string){
  const root=this.rigOf(id);const lib=this.poseLib(root);const at=lib.findIndex(p=>p.name===name);
  if(at<0)throw new PoseError(`There is no pose named "${name}" on this rig.`);
  const[gone]=lib.splice(at,1);
  this.push({label:`Remove pose ${name}`,undo:()=>{lib.splice(at,0,gone);},redo:()=>{lib.splice(at,1);}});this.emit();
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
  this.push({label:on?`IK on ${root.name}`:`FK for ${root.name}`,
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
 ikCommit(rootId:number,before:{chain:THREE.Bone[];rows:{p:readonly[number,number,number];q:readonly[number,number,number,number];s:readonly[number,number,number]}[];ik:{target:THREE.Vector3;pole:THREE.Vector3}|null},label:string){
  const{root,mid,end}=this.ikChain(rootId);const after=this.ikBegin(rootId);
  this.push({label,
   undo:()=>{this.restoreLocals(before.chain,before.rows);const c=this.ikOf(rootId);if(c&&before.ik){c.target.copy(before.ik.target);c.pole.copy(before.ik.pole);}},
   redo:()=>{this.restoreLocals(after.chain,after.rows);const c=this.ikOf(rootId);if(c&&after.ik){c.target.copy(after.ik.target);c.pole.copy(after.ik.pole);}}});
  void mid;void end;this.emit();
 }
 /** Command path: move the target (and solve) as one undo step. */
 ikSetTarget(rootId:number,p:readonly[number,number,number]){const before=this.ikBegin(rootId);this.ikDragTarget(rootId,p);this.ikCommit(rootId,before,'IK target');}
 ikSetPole(rootId:number,p:readonly[number,number,number]){const before=this.ikBegin(rootId);this.ikDragPole(rootId,p);this.ikCommit(rootId,before,'IK pole');}
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
  this.push({label:on?`FABRIK on ${root.name}`:`FK for ${root.name}`,
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
 fabrikCommit(rootId:number,before:{chain:THREE.Bone[];rows:{p:readonly[number,number,number];q:readonly[number,number,number,number];s:readonly[number,number,number]}[];fabrik:{target:THREE.Vector3;look:{on:boolean;target:THREE.Vector3}}|null},label:string){
  const after=this.fabrikBegin(rootId);
  this.push({label,
   undo:()=>{this.restoreLocals(before.chain,before.rows);const c=this.fabrikOf(rootId);if(c&&before.fabrik){c.target.copy(before.fabrik.target);c.look.on=before.fabrik.look.on;c.look.target.copy(before.fabrik.look.target);}},
   redo:()=>{this.restoreLocals(after.chain,after.rows);const c=this.fabrikOf(rootId);if(c&&after.fabrik){c.target.copy(after.fabrik.target);c.look.on=after.fabrik.look.on;c.look.target.copy(after.fabrik.look.target);}}});
  this.emit();
 }
 /** Command path: move the target (and solve) as one undo step. */
 fabrikSetTarget(rootId:number,p:readonly[number,number,number]){const before=this.fabrikBegin(rootId);this.fabrikDragTarget(rootId,p);this.fabrikCommit(rootId,before,'FABRIK target');}
 /** Command path: move the look target (and solve) as one undo step. */
 fabrikSetLook(rootId:number,p:readonly[number,number,number]){const before=this.fabrikBegin(rootId);this.fabrikDragLook(rootId,p);this.fabrikCommit(rootId,before,'FABRIK look target');}
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
  this.push({label:on?'Look-at on':'Look-at off',
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
  this.push({label:`Limits of ${o.name}`,
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
  this.editClip(i,`${r.replaced?'Change':'Add'} ${path} key on ${node.name}`,()=>r.state);
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
  this.push({label:`Record pose at ${Math.round(t*1000)/1000}s`,undo:()=>this.restoreClip(clip,was),redo:()=>this.restoreClip(clip,cur)});
  this.emit();return bones.length;
 }
 removeKey(i:number,id:number,path:KeyPath,time:number){
  const clip=this.needClip(i);const node=this.keyNode(id);this.keyPathFor(node,path);const t=checkKeyTime(time);const old=this.trackOf(clip,node,path);
  if(!old||!isPlainTrack(old.times,old.values,path))throw new ClipError(`${node.name} has no ${path} keys in this clip.`);
  const k=findKey(old.times,t);if(k<0)throw new ClipError('There is no key at that time.');
  const r=removeKeyData(old.times,old.values,path,k);const name=trackName(node.uuid,path);
  this.editClip(i,`Remove ${path} key on ${node.name}`,c=>{
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
  this.editClip(i,`Move ${path} key on ${node.name}`,c=>{const base=this.snapClip(c);base.ease[name]=ne;return{...base,tracks:[...base.tracks.filter(x=>x.name!==name),this.makeTrack(name,path,ins.times,ins.values,old.getInterpolation())],duration:Math.max(base.duration,t)};});
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
  this.editClip(i,`Move keys on ${node.name}`,c=>{
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
  this.editClip(i,`Paste keys on ${node.name}`,c=>{
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
  this.editClip(i,`Easing of ${path} key on ${node.name}`,c=>{const base=this.snapClip(c);base.ease[name]=eases;return base;});
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
   set('a');this.push({label:`Mirror ${objs.length>1?objs.length+' objects':objs[0].name}`,undo:()=>set('b'),redo:()=>set('a')});return objs;
  }
  const items:{o:THREE.Object3D;parent:THREE.Object3D;at:number}[]=[];
  for(const src of objs){
   const c=src.clone(true);c.traverse(x=>{const m=x as THREE.Mesh;if(m.isMesh&&!Array.isArray(m.material))m.material=(m.material as THREE.Material).clone();});
   const parent=src.parent??this.root;const t=place(src,parent);c.position.copy(t.p);c.quaternion.copy(t.q);c.scale.copy(t.sc);
   c.name=this.uniqueName(src.name+' mirror');items.push({o:c,parent,at:parent.children.length});this.attach0(c,parent,parent.children.length);
  }
  let owned=true;
  this.push({label:`Mirror copy of ${items.length>1?items.length+' objects':objs[0].name}`,undo:()=>{for(const i of items)i.parent.remove(i.o);owned=false;},redo:()=>{for(const i of items)this.attach0(i.o,i.parent,i.at);owned=true;},release:()=>{if(!owned)for(const i of items)disposeObject(i.o);}});
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
  this.push({label:`Apply scale of ${list.length>1?list.length+' objects':list[0].m.name}`,undo:()=>{set('before');owned=false;},redo:()=>{set('after');owned=true;},release:()=>{for(const l of list)(owned?l.before.g:l.after).dispose();}});
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
  this.push({label:`Merge ${meshes.length} meshes`,undo:()=>{this.root.remove(result);for(const i of items)this.attach0(i.o,i.parent,i.at);owned=false;},redo:()=>{for(const i of [...items].reverse())i.parent.remove(i.o);this.attach0(result,this.root,this.root.children.length);owned=true;},
   release:()=>{if(owned)for(const i of items)disposeObject(i.o);else disposeObject(result);}});
  return result;
 }
 rename(id:number,name:string){
  const o=this.need(id);const n=name.trim();if(!n)throw new StageError('A name cannot be empty.');if(n===o.name)return;
  const before=o.name;o.name=n;this.push({label:`Rename ${before}`,undo:()=>{o.name=before;},redo:()=>{o.name=n;}});
 }
 remove(id:number){
  const o=this.need(id);const parent=o.parent;if(!parent)throw new StageError('The scene root cannot be deleted.');
  if((o as THREE.Bone).isBone)throw new StageError('Bones cannot be deleted: the skin would lose a joint.');
  const at=parent.children.indexOf(o);parent.remove(o);let owned=false;
  this.push({label:`Delete ${o.name}`,undo:()=>{this.attach0(o,parent,at);owned=true;},redo:()=>{parent.remove(o);owned=false;},release:()=>{if(!owned)disposeObject(o);}});
 }
 duplicate(id:number):THREE.Object3D{
  const o=this.need(id);if(o===this.root)throw new StageError('The scene root cannot be duplicated.');
  if((o as THREE.Bone).isBone)throw new StageError('Bones cannot be duplicated: the skin would lose a joint.');
  const copy=o.clone(true);
  // clone() shares geometry and material. Give the copy its own material so edits stay independent; geometry stays shared and is only freed with the last owner.
  copy.traverse(c=>{const m=c as THREE.Mesh;if(m.isMesh&&!Array.isArray(m.material))m.material=(m.material as THREE.Material).clone();});
  copy.name=this.uniqueName(o.name+' copy');copy.position.x+=0.5;
  const parent=o.parent??this.root;this.attach(copy,parent,parent.children.indexOf(o)+1,`Duplicate ${o.name}`);return copy;
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
  this.push({label:`Bind ${o.name} to ${bone.name||'bones'}`,undo:()=>{swap(mesh,skinned);meshLive=true;},redo:()=>{swap(skinned,mesh);meshLive=false;},
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
  this.push({label:`Weights of ${o.name}`,undo:()=>{apply(beforeI,beforeW);if(poseBefore)this.poseApplyRows(poseBefore);owned=false;},redo:()=>{apply(afterI,afterW);if(poseAfter)this.poseApplyRows(poseAfter);owned=true;},release:()=>{(owned?beforeI:afterI).dispose?.();(owned?beforeW:afterW).dispose?.();}});
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
 skinPaintEnd(id:number,label='Paint weights'){
  const st=this.stroke;if(!st||st.id!==id){this.stroke=null;return;}
  this.stroke=null;
  const beforeI=st.beforeI,beforeW=st.beforeW;
  const afterI=st.geo.getAttribute('skinIndex') as THREE.BufferAttribute,afterW=st.geo.getAttribute('skinWeight') as THREE.BufferAttribute;
  if(afterI===beforeI&&afterW===beforeW)return; // not a single dab landed
  let owned=true;const apply=(i:THREE.BufferAttribute,w:THREE.BufferAttribute)=>{st.geo.setAttribute('skinIndex',i);st.geo.setAttribute('skinWeight',w);};
  this.push({label,undo:()=>{apply(beforeI,beforeW);owned=false;},redo:()=>{apply(afterI,afterW);owned=true;},release:()=>{(owned?beforeI:afterI).dispose?.();(owned?beforeW:afterW).dispose?.();}});
  this.emit();
 }
 info(id:number):ObjectInfo|null{
  const o=this.find(id);if(!o)return null;const m=o as THREE.Mesh;const l=o as THREE.Light;
  const mat=m.isMesh&&!Array.isArray(m.material)&&(m.material as THREE.MeshStandardMaterial).isMeshStandardMaterial?m.material as THREE.MeshStandardMaterial:null;
  return{id:o.id,name:o.name,kind:(o as THREE.Bone).isBone?'bone':m.isMesh?'mesh':l.isLight?'light':(o as THREE.Camera).isCamera?'camera':'group',
   position:{x:o.position.x,y:o.position.y,z:o.position.z},rotation:{x:o.rotation.x/DEG,y:o.rotation.y/DEG,z:o.rotation.z/DEG},scale:{x:o.scale.x,y:o.scale.y,z:o.scale.z},
   skinned:(m as THREE.SkinnedMesh).isSkinnedMesh===true,
   camera:(o as THREE.PerspectiveCamera).isPerspectiveCamera?{fov:(o as THREE.PerspectiveCamera).fov}:null,
   primitive:this.primitiveOf(o),material:mat?{color:'#'+mat.color.getHexString(),metalness:mat.metalness,roughness:mat.roughness,emissive:'#'+mat.emissive.getHexString(),emissiveIntensity:mat.emissiveIntensity,opacity:mat.transparent||mat.alphaTest>0?mat.opacity:1,alphaMode:alphaModeOf(mat.transparent,mat.alphaTest),alphaCutoff:mat.alphaTest>0?mat.alphaTest:0.5,doubleSided:mat.side===THREE.DoubleSide,textures:Object.fromEntries((Object.keys(SLOT_CONFIG) as TextureSlot[]).map(k=>{const t=mat[SLOT_CONFIG[k].prop] as THREE.Texture|null;return[k,t?(t.name||'image'):null];})) as Record<TextureSlot,string|null>,transforms:Object.fromEntries((Object.keys(SLOT_CONFIG) as TextureSlot[]).map(k=>{const t=mat[SLOT_CONFIG[k].prop] as THREE.Texture|null;return[k,t?readTransform(t):null];})) as Record<TextureSlot,TextureTransform|null>}:null,light:l.isLight?lightInfo(l):null};
 }
 measure(animations=this.clipList.length):{stats:ModelStats;outline:OutlineEntry[];bounds:Bounds|null}{
  const stats=emptyStats();stats.animations=animations;const outline:OutlineEntry[]=[];const mats=new Set<THREE.Material>(),texs=new Set<THREE.Texture>();
  const walk=(o:THREE.Object3D,depth:number)=>{
   const mesh=o as THREE.Mesh;const kind:OutlineEntry['kind']=(o as THREE.Bone).isBone?'bone':mesh.isMesh?'mesh':(o as THREE.Light).isLight?'light':(o as THREE.Camera).isCamera?'camera':'group';
   if(kind==='bone')stats.bones++;
   if(depth>0){stats.nodes++;if(kind!=='bone')outline.push({id:o.id,name:o.name||`${kind} ${o.id}`,depth:depth-1,kind});}
   if(kind==='camera')stats.cameras++;
   if(depth>0&&(o.scale.x===0||o.scale.y===0||o.scale.z===0))stats.zeroScale++;
   if(mesh.isMesh&&mesh.geometry){
    stats.meshes++;const pos=mesh.geometry.getAttribute('position');const count=pos?pos.count:0;const index=mesh.geometry.getIndex();
    stats.vertices+=count;stats.triangles+=Math.floor((index?index.count:count)/3);
    for(const a of Object.values(mesh.geometry.attributes))stats.geometryBytes+=(a as THREE.BufferAttribute).array.byteLength;if(index)stats.geometryBytes+=index.array.byteLength;
    let noUv=false;const list=Array.isArray(mesh.material)?mesh.material:[mesh.material];stats.draws+=Math.max(1,list.length);
    for(const mat of list){if(!mat)continue;mats.add(mat);for(const v of Object.values(mat as unknown as Record<string,unknown>))if(v instanceof THREE.Texture){texs.add(v);if(!mesh.geometry.getAttribute('uv'))noUv=true;}}
    if(noUv)stats.textureNoUv++;
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
