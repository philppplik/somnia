import * as THREE from 'three';
import {emptyStats,type ModelStats,type OutlineEntry,type Bounds} from './model';
/**
 * Scene operations for the 3D studio (P1 staging). Pure three.js core, no renderer and no DOM, so the logic runs under tsx --test.
 * Every user-visible change is one undo entry. Objects are addressed by Object3D.id.
 * Imported only by the lazy viewport chunk.
 */
export type PrimitiveKind='cube'|'sphere'|'plane'|'cylinder'|'cone'|'torus';
export type LightKind='directional'|'point'|'spot'|'area';
export const PRIMITIVES:readonly PrimitiveKind[]=['cube','sphere','plane','cylinder','cone','torus'];
export const LIGHTS:readonly LightKind[]=['directional','point','spot','area'];
export interface Vec3{x:number;y:number;z:number}
export interface TransformPatch{position?:Partial<Vec3>;/** degrees */rotation?:Partial<Vec3>;scale?:Partial<Vec3>}
export interface MaterialPatch{color?:string;metalness?:number;roughness?:number}
export interface ObjectInfo{
 camera:{fov:number}|null;
 id:number;name:string;kind:OutlineEntry['kind'];position:Vec3;rotation:Vec3;scale:Vec3;
 material:{color:string;metalness:number;roughness:number}|null;light:LightInfo|null;
}
export interface LightInfo{intensity:number;color:string;/** spot cone, degrees */angle?:number;penumbra?:number;width?:number;height?:number}
export interface LightPatch{intensity?:number;color?:string;angle?:number;penumbra?:number;width?:number;height?:number}
export type AlignAxis='x'|'y'|'z';
export type AlignTo='min'|'center'|'max';
export type PivotAt='center'|'base';
export const GROUP_MS=1000;
export class StageError extends Error{constructor(message:string){super(message);this.name='StageError';}}
const clamp01=(n:number)=>Math.min(1,Math.max(0,n));
const finite=(n:unknown,what:string):number=>{if(typeof n!=='number'||!Number.isFinite(n))throw new StageError(`${what} must be a finite number.`);return n;};
const DEG=Math.PI/180;
const HEX=/^#[0-9a-fA-F]{6}$/;
function geometryFor(kind:PrimitiveKind):THREE.BufferGeometry{
 switch(kind){
  case 'cube':return new THREE.BoxGeometry(1,1,1);
  case 'sphere':return new THREE.SphereGeometry(0.5,48,24);
  case 'plane':return new THREE.PlaneGeometry(2,2).rotateX(-Math.PI/2);
  case 'cylinder':return new THREE.CylinderGeometry(0.5,0.5,1,48);
  case 'cone':return new THREE.ConeGeometry(0.5,1,48);
  case 'torus':return new THREE.TorusGeometry(0.5,0.18,24,64);
 }
}
function lightInfo(l:THREE.Light):LightInfo{
 const info:LightInfo={intensity:l.intensity,color:'#'+l.color.getHexString()};
 const sp=l as THREE.SpotLight,ra=l as THREE.RectAreaLight;
 if(sp.isSpotLight){info.angle=sp.angle/DEG;info.penumbra=sp.penumbra;}
 if(ra.isRectAreaLight){info.width=ra.width;info.height=ra.height;}
 return info;
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
  const mesh=new THREE.Mesh(geometryFor(kind),new THREE.MeshStandardMaterial({color:0xb8bcc8,metalness:0,roughness:0.6}));
  mesh.name=this.uniqueName(label(kind));
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
  if(patch.angle!==undefined&&!sp.isSpotLight)throw new StageError('Only spot lights have a cone angle.');
  if(patch.penumbra!==undefined&&!sp.isSpotLight)throw new StageError('Only spot lights have a penumbra.');
  if((patch.width!==undefined||patch.height!==undefined)&&!ra.isRectAreaLight)throw new StageError('Only area lights have a width and height.');
  const num=(v:number|undefined,what:string,min:number,max:number)=>{if(v===undefined)return undefined;const n=finite(v,what);if(n<min||n>max)throw new StageError(`${what} must be between ${min} and ${max}.`);return n;};
  const next={i:num(patch.intensity,'intensity',0,100000),c:patch.color,a:num(patch.angle,'angle',1,90),p:num(patch.penumbra,'penumbra',0,1),w:num(patch.width,'width',0.01,1000),h:num(patch.height,'height',0.01,1000)};
  const read=()=>({i:o.intensity,c:'#'+o.color.getHexString(),a:sp.isSpotLight?sp.angle/DEG:undefined,p:sp.isSpotLight?sp.penumbra:undefined,w:ra.isRectAreaLight?ra.width:undefined,h:ra.isRectAreaLight?ra.height:undefined});
  const before=read();
  const write=(v:ReturnType<typeof read>)=>{o.intensity=v.i;o.color.set(v.c);if(sp.isSpotLight){sp.angle=v.a!*DEG;sp.penumbra=v.p!;}if(ra.isRectAreaLight){ra.width=v.w!;ra.height=v.h!;}};
  const after={i:next.i??before.i,c:next.c??before.c,a:next.a??before.a,p:next.p??before.p,w:next.w??before.w,h:next.h??before.h};
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
 setMaterial(id:number,patch:MaterialPatch){
  const o=this.need(id);const mesh=o as THREE.Mesh;
  if(!mesh.isMesh||Array.isArray(mesh.material)||!(mesh.material as THREE.MeshStandardMaterial).isMeshStandardMaterial)throw new StageError(`${o.name} has no editable PBR material.`);
  if(patch.color!==undefined&&!HEX.test(patch.color))throw new StageError('color must look like #rrggbb.');
  const mat=mesh.material as THREE.MeshStandardMaterial;
  const before={c:mat.color.clone(),m:mat.metalness,r:mat.roughness};
  const next={c:patch.color?new THREE.Color(patch.color):before.c.clone(),m:patch.metalness===undefined?before.m:clamp01(finite(patch.metalness,'metalness')),r:patch.roughness===undefined?before.r:clamp01(finite(patch.roughness,'roughness'))};
  if(before.c.equals(next.c)&&before.m===next.m&&before.r===next.r)return;
  const set=(s:typeof before)=>{mat.color.copy(s.c);mat.metalness=s.m;mat.roughness=s.r;};
  set(next);this.push({label:`Material of ${o.name}`,undo:()=>set(before),redo:()=>set(next)});
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
   material:mat?{color:'#'+mat.color.getHexString(),metalness:mat.metalness,roughness:mat.roughness}:null,light:l.isLight?lightInfo(l):null};
 }
 measure(animations=0):{stats:ModelStats;outline:OutlineEntry[];bounds:Bounds|null}{
  const stats=emptyStats();stats.animations=animations;const outline:OutlineEntry[]=[];const mats=new Set<THREE.Material>(),texs=new Set<THREE.Texture>();
  const walk=(o:THREE.Object3D,depth:number)=>{
   const mesh=o as THREE.Mesh;const kind:OutlineEntry['kind']=mesh.isMesh?'mesh':(o as THREE.Light).isLight?'light':(o as THREE.Camera).isCamera?'camera':'group';
   if(depth>0){stats.nodes++;outline.push({id:o.id,name:o.name||`${kind} ${o.id}`,depth:depth-1,kind});}
   if(kind==='camera')stats.cameras++;
   if(mesh.isMesh&&mesh.geometry){
    stats.meshes++;const pos=mesh.geometry.getAttribute('position');const count=pos?pos.count:0;const index=mesh.geometry.getIndex();
    stats.vertices+=count;stats.triangles+=Math.floor((index?index.count:count)/3);
    const list=Array.isArray(mesh.material)?mesh.material:[mesh.material];stats.draws+=Math.max(1,list.length);
    for(const mat of list){if(!mat)continue;mats.add(mat);for(const v of Object.values(mat as unknown as Record<string,unknown>))if(v instanceof THREE.Texture)texs.add(v);}
   }
   for(const c of o.children)walk(c,depth+1);
  };
  walk(this.root,0);stats.materials=mats.size;stats.textures=texs.size;
  // Lights have no geometry: bound only the renderable content.
  const box=new THREE.Box3();this.root.traverse(o=>{if((o as THREE.Mesh).isMesh)box.expandByObject(o);});
  const bounds:Bounds|null=box.isEmpty()?null:{min:box.min.toArray() as [number,number,number],max:box.max.toArray() as [number,number,number]};
  return{stats,outline,bounds};
 }
}
