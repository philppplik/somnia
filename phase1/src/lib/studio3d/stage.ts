import {PRIMITIVE_KINDS,PrimitiveError,defaultParams,patchParams,readPrimitive,resolveMaterial,type PrimitiveKind,type PrimitiveData,type PrimitiveParams,type MaterialRequest} from './primitives';
import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {checkPbr,alphaState,alphaModeOf,MaterialError,SLOT_CONFIG,type PbrExtras,type AlphaMode,type TextureSlot} from './materials';
import type {NodeExtra} from './document';
import {mergeTransform,DEFAULT_TRANSFORM,UvError,type TextureTransform} from './uv';
import {textureBytes} from './validate';
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
  const o=this.need(id);const next={p:o.position.clone(),r:o.rotation.clone(),s:o.scale.clone()};
  if(before.p.equals(next.p)&&before.r.equals(next.r)&&before.s.equals(next.s))return;
  this.applyTransform(o,before,next,{},true);
 }
 private applyTransform(o:THREE.Object3D,before:{p:THREE.Vector3;r:THREE.Euler;s:THREE.Vector3},next:{p:THREE.Vector3;r:THREE.Euler;s:THREE.Vector3},opts:{group?:string;now?:number},already=false){
  const set=(s:typeof before)=>{o.position.copy(s.p);o.rotation.copy(s.r);o.scale.copy(s.s);};
  if(!already)set(next);
  const now=opts.now??Date.now();const key=opts.group?`${opts.group}:${o.id}`:undefined;
  const last=this.entries[this.cursor-1];
  if(key&&last&&this.cursor===this.entries.length&&this.saved!==this.cursor&&last.group===key&&last.at!==undefined&&now-last.at<=GROUP_MS&&last.merge){
   last.merge(()=>set(next));last.at=now;this.emit();return;
  }
  let redo=()=>set(next);
  this.push({label:`Transform ${o.name}`,undo:()=>set(before),redo:()=>redo(),group:key,at:now,merge:r=>{redo=r;}});
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
  const at=parent.children.indexOf(o);parent.remove(o);let owned=false;
  this.push({label:`Delete ${o.name}`,undo:()=>{this.attach0(o,parent,at);owned=true;},redo:()=>{parent.remove(o);owned=false;},release:()=>{if(!owned)disposeObject(o);}});
 }
 duplicate(id:number):THREE.Object3D{
  const o=this.need(id);if(o===this.root)throw new StageError('The scene root cannot be duplicated.');
  const copy=o.clone(true);
  // clone() shares geometry and material. Give the copy its own material so edits stay independent; geometry stays shared and is only freed with the last owner.
  copy.traverse(c=>{const m=c as THREE.Mesh;if(m.isMesh&&!Array.isArray(m.material))m.material=(m.material as THREE.Material).clone();});
  copy.name=this.uniqueName(o.name+' copy');copy.position.x+=0.5;
  const parent=o.parent??this.root;this.attach(copy,parent,parent.children.indexOf(o)+1,`Duplicate ${o.name}`);return copy;
 }
 info(id:number):ObjectInfo|null{
  const o=this.find(id);if(!o)return null;const m=o as THREE.Mesh;const l=o as THREE.Light;
  const mat=m.isMesh&&!Array.isArray(m.material)&&(m.material as THREE.MeshStandardMaterial).isMeshStandardMaterial?m.material as THREE.MeshStandardMaterial:null;
  return{id:o.id,name:o.name,kind:m.isMesh?'mesh':l.isLight?'light':(o as THREE.Camera).isCamera?'camera':'group',
   position:{x:o.position.x,y:o.position.y,z:o.position.z},rotation:{x:o.rotation.x/DEG,y:o.rotation.y/DEG,z:o.rotation.z/DEG},scale:{x:o.scale.x,y:o.scale.y,z:o.scale.z},
   camera:(o as THREE.PerspectiveCamera).isPerspectiveCamera?{fov:(o as THREE.PerspectiveCamera).fov}:null,
   primitive:this.primitiveOf(o),material:mat?{color:'#'+mat.color.getHexString(),metalness:mat.metalness,roughness:mat.roughness,emissive:'#'+mat.emissive.getHexString(),emissiveIntensity:mat.emissiveIntensity,opacity:mat.transparent||mat.alphaTest>0?mat.opacity:1,alphaMode:alphaModeOf(mat.transparent,mat.alphaTest),alphaCutoff:mat.alphaTest>0?mat.alphaTest:0.5,doubleSided:mat.side===THREE.DoubleSide,textures:Object.fromEntries((Object.keys(SLOT_CONFIG) as TextureSlot[]).map(k=>{const t=mat[SLOT_CONFIG[k].prop] as THREE.Texture|null;return[k,t?(t.name||'image'):null];})) as Record<TextureSlot,string|null>,transforms:Object.fromEntries((Object.keys(SLOT_CONFIG) as TextureSlot[]).map(k=>{const t=mat[SLOT_CONFIG[k].prop] as THREE.Texture|null;return[k,t?readTransform(t):null];})) as Record<TextureSlot,TextureTransform|null>}:null,light:l.isLight?lightInfo(l):null};
 }
 measure(animations=0):{stats:ModelStats;outline:OutlineEntry[];bounds:Bounds|null}{
  const stats=emptyStats();stats.animations=animations;const outline:OutlineEntry[]=[];const mats=new Set<THREE.Material>(),texs=new Set<THREE.Texture>();
  const walk=(o:THREE.Object3D,depth:number)=>{
   const mesh=o as THREE.Mesh;const kind:OutlineEntry['kind']=mesh.isMesh?'mesh':(o as THREE.Light).isLight?'light':(o as THREE.Camera).isCamera?'camera':'group';
   if(depth>0){stats.nodes++;outline.push({id:o.id,name:o.name||`${kind} ${o.id}`,depth:depth-1,kind});}
   if(kind==='camera')stats.cameras++;
   if(depth>0&&(o.scale.x===0||o.scale.y===0||o.scale.z===0))stats.zeroScale++;
   if(mesh.isMesh&&mesh.geometry){
    stats.meshes++;const pos=mesh.geometry.getAttribute('position');const count=pos?pos.count:0;const index=mesh.geometry.getIndex();
    stats.vertices+=count;stats.triangles+=Math.floor((index?index.count:count)/3);
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
