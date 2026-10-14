import {StudioStatus} from '../studios/StudioStatus';
import {useEffect,useRef} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import {PLYLoader} from 'three/addons/loaders/PLYLoader.js';
import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';
import {MTLLoader} from 'three/addons/loaders/MTLLoader.js';
import {RectAreaLightUniformsLib} from 'three/addons/lights/RectAreaLightUniformsLib.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {STLExporter} from 'three/addons/exporters/STLExporter.js';
import {OBJExporter} from 'three/addons/exporters/OBJExporter.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {RGBELoader} from 'three/addons/loaders/RGBELoader.js';
import {EXRLoader} from 'three/addons/loaders/EXRLoader.js';
import {Sky} from 'three/addons/objects/Sky.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {useT} from '../../lib/useT';
import {getState as getAppState} from '../../store/appStore';
import {readProjectUnit,writeProjectUnit} from '../../lib/studio3d/projectPrefs';
import {toggleSelection,marqueeRect,inRect,turntablePlan,frameName,exportFileName,unitScale,isUnit,isMeshFormat,mergeSnap,snapTo,stlUnitHint,mtlReferences,mtlTextures,clampRenderSize,MAX_MTL_BYTES,MAX_TEXTURE_BYTES,MAX_TEXTURE_FILES,SnapError,mergeEnv,envFormatFor,nudgeFor,EnvError,modelFormatFor,readModelHeader,externalResources,ModelError,boundsValid,boundsCenter,boundsRadius,frameDistance,clipPlanes} from '../../lib/studio3d/model';
import type {Bounds} from '../../lib/studio3d/model';
import {Stage,beginGroupDrag,applyGroupDrag,collectNodeExtras,applyNodeExtras,type GroupDragMember,type TransformSnapshot} from '../../lib/studio3d/stage';
import {parseDocument,buildDocument,sceneBytes,fromBase64,DocumentError} from '../../lib/studio3d/document';
import {registerStudio3DController} from '../../lib/studio3d/commands';
import {parseExtras,type ClipMeta} from '../../lib/studio3d/clipMeta';
import type {Ease} from '../../lib/studio3d/ease';
import type {KeyPath} from '../../lib/studio3d/clips';
import {advance,clampTime,checkClip,checkSpeed,startTime,AnimationError,type ClipInfo} from '../../lib/studio3d/animation';
import {exportBlocker,LIMITS} from '../../lib/studio3d/validate';
import {inspectImage,isTextureSlot,MAX_TEXTURE_FILE_BYTES,MaterialError,type TextureSlot} from '../../lib/studio3d/materials';
import {viewDirection,type ViewPreset} from '../../lib/studio3d/viewPresets';
import {rememberScene,forgetAutosave} from '../../lib/studio3d/recentSession';
import {autosaveDue} from '../../lib/studio3d/recent';
import {patchStudio3D,resetStudio3D,getStudio3DState,useStudio3D} from '../../lib/studio3d/session';

type GltfParser={json:{animations?:{extras?:unknown}[]};getDependency(type:string,index:number):Promise<THREE.Object3D>};
const DEFAULT_DIR=new THREE.Vector3(1,0.75,1).normalize();
/** Anything a model names that was not selected with it resolves to this empty pixel, so nothing is ever fetched from the network. */
const BLOCKED='data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const safeDecode=(u:string)=>{try{return decodeURIComponent(u);}catch{return u;}};
/** MTL materials are Phong. The studio edits PBR, so they become standard materials with the same maps. */
function toStandard(m:THREE.Material):THREE.Material{
 const p=m as THREE.MeshPhongMaterial;if(!p.isMeshPhongMaterial)return m;
 const out=new THREE.MeshStandardMaterial({name:p.name,color:p.color,map:p.map,normalMap:p.normalMap,bumpMap:p.bumpMap,alphaMap:p.alphaMap,emissive:p.emissive,emissiveMap:p.emissiveMap,opacity:p.opacity,transparent:p.transparent,side:THREE.DoubleSide,metalness:0,roughness:0.7});
 p.dispose();return out;
}
const base=(name:string)=>name.replace(/^.*[\\/]/,'');
const download=(blob:Blob,name:string)=>{const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
const stem=(name:string)=>base(name).replace(/\.[^.]+$/,'')||'scene';
/** The scene outlives the viewport: switching studios and back must never drop unsaved work. A new open or blank scene replaces it (after confirmation when dirty). */
let sharedStage:Stage|null=null;
/** Custom environment map bytes, kept so the map survives remounting the viewport. */
let customEnv:{name:string;bytes:ArrayBuffer}|null=null;
/** The lazy 3D chunk: scene, orbit camera, glTF import, environment lighting, GLB export and PNG still. */
export default function Viewport3D(){
 const {t}=useT();const host=useRef<HTMLDivElement|null>(null);
 useEffect(()=>{
  const el=host.current!;
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;RectAreaLightUniformsLib.init();renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.domElement.style.cssText='display:block;width:100%;height:100%;outline:none;touch-action:none';
  renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('role','img');renderer.domElement.setAttribute('aria-label',t('studio3d.canvas.label'));
  el.appendChild(renderer.domElement);
  const gl=renderer.getContext();const webgl2=typeof WebGL2RenderingContext!=='undefined'&&gl instanceof WebGL2RenderingContext;
  patchStudio3D({backend:(webgl2?'WebGL2':'WebGL1')+('gpu' in navigator?' (WebGPU available)':'')});
  const scene=new THREE.Scene();scene.background=new THREE.Color(0xe9ebf0);
  const pmrem=new THREE.PMREMGenerator(renderer);
  const envCache=new Map<string,THREE.Texture>();const envTargets:THREE.WebGLRenderTarget[]=[];
  const bake=(src:THREE.Scene)=>{const t=pmrem.fromScene(src,0.04);envTargets.push(t);return t.texture;};
  const presetTexture=async(preset:string):Promise<THREE.Texture|null>=>{
   if(preset==='none')return null;
   const hit=envCache.get(preset);if(hit)return hit;
   let tex:THREE.Texture|null=null;
   if(preset==='studio'){const room=new RoomEnvironment();tex=bake(room as unknown as THREE.Scene);}
   else if(preset==='sky'){const sc=new THREE.Scene();const sky=new Sky();sky.scale.setScalar(450000);sc.add(sky);const u=sky.material.uniforms;u.turbidity.value=4;u.rayleigh.value=1.2;u.sunPosition.value.setFromSphericalCoords(1,THREE.MathUtils.degToRad(60),THREE.MathUtils.degToRad(140));tex=bake(sc);}
   else if(preset==='neutral'){const sc=new THREE.Scene();sc.background=new THREE.Color(0xd0d3da);tex=bake(sc);}
   else if(preset==='custom'&&customEnv){
    const fmt=envFormatFor(customEnv.name);const url=URL.createObjectURL(new Blob([customEnv.bytes]));
    try{const t=await (fmt==='exr'?new EXRLoader():new RGBELoader()).loadAsync(url);t.mapping=THREE.EquirectangularReflectionMapping;tex=t;envTargets.push({dispose:()=>t.dispose()} as THREE.WebGLRenderTarget);}
    finally{URL.revokeObjectURL(url);}
   }
   if(tex)envCache.set(preset,tex);return tex;
  };
  let envTicket=0;
  const applyEnv=async()=>{
   const e=getStudio3DState().env;const ticket=++envTicket;
   let tex:THREE.Texture|null=null;
   try{tex=await presetTexture(e.preset);}catch(err){if(ticket===envTicket)patchStudio3D({env:{...e,preset:'studio'},error:err instanceof Error?err.message:String(err)});return;}
   if(ticket!==envTicket||disposed)return;
   scene.environment=tex;scene.environmentIntensity=e.intensity;scene.environmentRotation.set(0,THREE.MathUtils.degToRad(e.rotation),0);
   scene.backgroundIntensity=e.intensity;scene.backgroundRotation.set(0,THREE.MathUtils.degToRad(e.rotation),0);
   scene.background=e.background&&tex?tex:new THREE.Color(0xe9ebf0);invalidate();
  };
  const camera=new THREE.PerspectiveCamera(45,1,0.01,1000);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;
  const grid=new THREE.GridHelper(20,20,0x8a8f9c,0xc3c7d0);grid.visible=getStudio3DState().grid;scene.add(grid);
  const stage=sharedStage??(sharedStage=new Stage());const holder=stage.root;scene.add(holder);
  let selection:THREE.Box3Helper|null=null;let bounds:Bounds|null=null;let disposed=false;let frame=0;
  const invalidate=()=>{if(frame||disposed)return;frame=requestAnimationFrame(()=>{frame=0;if(!disposed)renderer.render(scene,camera);});};
  controls.addEventListener('change',invalidate);
  const resize=()=>{const w=Math.max(1,el.clientWidth),h=Math.max(1,el.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();invalidate();};
  const ro=new ResizeObserver(resize);ro.observe(el);resize();
  const place=(dir:THREE.Vector3,center:THREE.Vector3,radius:number)=>{
   const d=frameDistance(radius,camera.fov,camera.aspect);const {near,far}=clipPlanes(d,radius);
   camera.near=near;camera.far=far;camera.position.copy(center).addScaledVector(dir,d);camera.updateProjectionMatrix();
   controls.target.copy(center);controls.minDistance=radius*0.05;controls.maxDistance=d*20;controls.update();invalidate();
  };
  const frameAll=()=>{
   if(camera.fov!==45){camera.fov=45;camera.updateProjectionMatrix();}
   if(bounds&&boundsValid(bounds)){const c=boundsCenter(bounds);place(DEFAULT_DIR,new THREE.Vector3(...c),Math.max(boundsRadius(bounds),1e-4));}
   else place(DEFAULT_DIR,new THREE.Vector3(0,0,0),5);
  };
  const marks=new THREE.Group();scene.add(marks);
  const clearMarks=()=>{for(const c of [...marks.children]){marks.remove(c);(c as THREE.Box3Helper).dispose?.();}};
  const clearSelection=()=>{clearMarks();if(selection){scene.remove(selection);selection.dispose();selection=null;}};
  const clearModel=()=>{clearSelection();stage.clear();bounds=null;};
  const applyWire=(on:boolean)=>holder.traverse(o=>{const m=o as THREE.Mesh;if(!m.isMesh)return;for(const mat of Array.isArray(m.material)?m.material:[m.material])(mat as THREE.MeshBasicMaterial).wireframe=on;});
  const drawSelection=()=>{
   clearSelection();const id=getStudio3DState().selected;const obj=id==null?null:stage.find(id);
   if(obj){const box=new THREE.Box3().setFromObject(obj);if(!box.isEmpty()){selection=new THREE.Box3Helper(box,0x6d4aff);scene.add(selection);}}
   for(const m of getStudio3DState().marked){if(m===id)continue;const o=stage.find(m);if(!o)continue;const b=new THREE.Box3().setFromObject(o);if(!b.isEmpty())marks.add(new THREE.Box3Helper(b,0xa28bff));}
  };
  const select=(id:number|null)=>{patchStudio3D({selected:id!=null&&stage.find(id)?id:null,marked:[]});sync();};
  const applySet=(marked:number[],selected:number|null)=>{const live=marked.filter(m=>stage.find(m));patchStudio3D({marked:live,selected:selected!=null&&stage.find(selected)?selected:null});sync();};
  let mixer:THREE.AnimationMixer|null=null;let mixerRev=-1;let animRaf=0;let lastTick=0;let lastPublish=0;let state_time=0;
  function clipInfos():ClipInfo[]{return stage.clips.map((c,i)=>({name:c.name||`Clip ${i+1}`,duration:c.duration}));}
  function stopAnim(){if(animRaf)cancelAnimationFrame(animRaf);animRaf=0;}
  const syncHooks:(()=>void)[]=[];
  /** Pushes the stage into the session: outline, stats, selection info and undo state. */
  const sync=()=>{
   const m=stage.measure();bounds=m.bounds;
   const sel=getStudio3DState().selected;const info=sel==null?null:stage.info(sel);
   const infos=clipInfos();const an=getStudio3DState().anim;const keys=sel==null||!infos[an.clip]?[]:stage.keysOf(an.clip,sel);
   if(an.clip>=infos.length&&an.clip>0){stopAnim();patchStudio3D({anim:{clip:0,playing:false,time:0,loop:true,speed:1}});}
   patchStudio3D({clips:infos,clipKeys:keys,stats:m.stats,outline:m.outline,bounds:m.bounds,selected:info?sel:null,selectedInfo:info,dirty:stage.dirty,canUndo:stage.canUndo,canRedo:stage.canRedo,undoLabel:stage.undoLabel});
   drawSelection();applyWire(getStudio3DState().wireframe);for(const h of syncHooks)h();invalidate();
  };
  const offStage=stage.onChange(()=>{if(!disposed)sync();});
  const frameSelection=()=>{
   const id=getStudio3DState().selected;const obj=id==null?null:stage.find(id);if(!obj)return frameAll();
   const box=new THREE.Box3().setFromObject(obj);if(box.isEmpty())return frameAll();
   const c=box.getCenter(new THREE.Vector3()),r=box.getSize(new THREE.Vector3()).length()/2;
   place(camera.position.clone().sub(controls.target).normalize(),c,Math.max(r,1e-4));
  };
  const loadParsed=async(file:File,extras:File[])=>{
   const tmpUrls:string[]=[];let notice='';let unitHint:{id:number;factor:number}|null=null;
   const bytes=new Uint8Array(await file.arrayBuffer());const header=readModelHeader(file.name,bytes);
   const urls=new Map<string,string>();for(const f of extras)urls.set(base(f.name).toLowerCase(),URL.createObjectURL(f));
   const manager=new THREE.LoadingManager();
   manager.setURLModifier(u=>{if(u.startsWith('data:')||u.startsWith('blob:'))return u;const hit=urls.get(base(safeDecode(u)).toLowerCase());return hit??BLOCKED;});
   try{
    if(isMeshFormat(header.format)){
     const scene=new THREE.Group();scene.name=file.name.replace(/\.[^.]+$/,'');
     const buf=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;
     const solid=()=>new THREE.MeshStandardMaterial({color:0xb8bcc6,metalness:0.1,roughness:0.6,side:THREE.DoubleSide});
     const fromGeometry=(g:THREE.BufferGeometry,points=false)=>{
      if(!g.getAttribute('position')||g.getAttribute('position').count===0)throw new ModelError(`${file.name} contains no geometry.`);
      if(points){const m=new THREE.PointsMaterial({size:0.01,sizeAttenuation:true,vertexColors:!!g.getAttribute('color')});return new THREE.Points(g,m);}
      if(!g.getAttribute('normal'))g.computeVertexNormals();
      const m=solid();if(g.getAttribute('color'))m.vertexColors=true;
      return new THREE.Mesh(g,m);
     };
     if(header.format==='stl')scene.add(fromGeometry(new STLLoader().parse(buf)));
     else if(header.format==='ply')scene.add(fromGeometry(new PLYLoader().parse(buf),!!header.pointCloud));
     else{
      const text=new TextDecoder().decode(bytes);const refs=mtlReferences(text);
      const mtls=extras.filter(f=>/\.mtl$/i.test(f.name));
      const mtlFile=mtls.find(f=>refs.some(r=>r.toLowerCase()===base(f.name).toLowerCase()))??(mtls.length===1?mtls[0]:undefined);
      const objLoader=new OBJLoader();
      if(mtlFile){
       if(mtlFile.size>MAX_MTL_BYTES)throw new ModelError(`${mtlFile.name} is larger than ${MAX_MTL_BYTES/1048576} MB.`);
       const mtlText=await mtlFile.text();const wanted=mtlTextures(mtlText);
       const have=new Map(extras.filter(f=>/\.(png|jpe?g|webp)$/i.test(f.name)).map(f=>[base(f.name).toLowerCase(),f] as const));
       const use=wanted.filter(w=>have.has(w.toLowerCase()));const missing=wanted.filter(w=>!have.has(w.toLowerCase()));
       if(use.length>MAX_TEXTURE_FILES)throw new ModelError(`${mtlFile.name} names more than ${MAX_TEXTURE_FILES} texture files.`);
       const blobs=new Map<string,string>();
       for(const w of use){const f=have.get(w.toLowerCase())!;if(f.size>MAX_TEXTURE_BYTES)throw new ModelError(`${f.name} is larger than ${MAX_TEXTURE_BYTES/1048576} MB.`);const u=URL.createObjectURL(f);tmpUrls.push(u);blobs.set(w.toLowerCase(),u);}
       // Only the selected files are readable. Any other reference gets an empty pixel, so nothing is fetched from the network.
       const tm=new THREE.LoadingManager();
       tm.setURLModifier(u=>u.startsWith('data:')||u.startsWith('blob:')?u:blobs.get(base(safeDecode(u)).toLowerCase())??BLOCKED);
       const mats=new MTLLoader(tm).parse(mtlText,'');mats.preload();objLoader.setMaterials(mats);
       if(missing.length)notice=`Textures not found: ${missing.slice(0,4).join(', ')}${missing.length>4?', ...':''}. Select them together with the OBJ.`;
      }else if(refs.length)notice=`Material file not found: ${refs[0]}. Select it together with the OBJ to get its materials.`;
      const group=objLoader.parse(text);
      group.traverse(o=>{const m=o as THREE.Mesh;if(!m.isMesh)return;if(!m.geometry.getAttribute('normal'))m.geometry.computeVertexNormals();
       const list=Array.isArray(m.material)?m.material:[m.material];
       const conv=list.map(x=>mtlFile?toStandard(x):solid());m.material=Array.isArray(m.material)?conv:conv[0];});
      if(!group.children.length)throw new ModelError(`${file.name} contains no geometry.`);
      scene.add(...group.children);
     }
     if(header.format==='stl'){const sz=new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3());const hint=stlUnitHint([sz.x,sz.y,sz.z]);if(hint)unitHint={id:scene.id,factor:hint.factor};}
     return{gltf:{scene,animations:[]},header,size:bytes.byteLength,notice,unitHint};
    }
    if(header.format==='gltf'||header.format==='glb'){
     const missing=externalResources(header.json).filter(r=>!urls.has(base(decodeURIComponent(r)).toLowerCase()));
     if(missing.length)throw new ModelError(`${file.name} refers to files that were not selected: ${missing.slice(0,4).join(', ')}${missing.length>4?', ...':''}. Select the .gltf together with its .bin and texture files.`);
    }
    const loader=new GLTFLoader(manager);loader.setMeshoptDecoder(MeshoptDecoder);
    const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;
    const gltf=await new Promise<{scene:THREE.Group;animations:unknown[];parser?:GltfParser}>((resolve,reject)=>loader.parse(header.format==='glb'?buffer:new TextDecoder().decode(bytes),'',g=>resolve(g as never),e=>reject(e instanceof Error?e:new Error(String((e as {message?:string})?.message??e)))));
    return{gltf,header,size:bytes.byteLength,notice,unitHint};
   }finally{for(const u of tmpUrls)setTimeout(()=>URL.revokeObjectURL(u),30_000);for(const u of urls.values())setTimeout(()=>URL.revokeObjectURL(u),30_000);}
  };
  // Transform gizmo: one undo step per drag.
  const gizmo=new TransformControls(camera,renderer.domElement);const gizmoHelper=gizmo.getHelper();scene.add(gizmoHelper);
  let dragBefore:{id:number;p:THREE.Vector3;r:THREE.Euler;s:THREE.Vector3}|null=null;let justDragged=false;
  gizmo.setMode(getStudio3DState().gizmo);
  gizmo.addEventListener('change',invalidate);
  // A group pivot carries the multi-selection: its movement is applied to every member (see applyGroupDrag).
  const groupPivot=new THREE.Object3D();groupPivot.name='group pivot';
  let group:{members:GroupDragMember[];p0:THREE.Matrix4;before:TransformSnapshot[]}|null=null;
  gizmo.addEventListener('dragging-changed',e=>{
   const on=!!(e as unknown as {value:boolean}).value;controls.enabled=!on;
   const o=gizmo.object;
   if(o===groupPivot){
    if(on){const ids=currentSet();groupPivot.updateMatrixWorld(true);group={members:beginGroupDrag(ids.map(id=>stage.find(id)!).filter(Boolean)),p0:groupPivot.matrixWorld.clone(),before:stage.snapshot(ids)};}
    else{justDragged=true;const g=group;group=null;if(g)stage.commitMany(g.before);}
    return;
   }
   if(on&&o)dragBefore={id:o.id,p:o.position.clone(),r:o.rotation.clone(),s:o.scale.clone()};
   if(!on){justDragged=true;const b=dragBefore;dragBefore=null;if(b&&stage.find(b.id))stage.commitTransform(b.id,{p:b.p,r:b.r,s:b.s});}
  });
  gizmo.addEventListener('objectChange',()=>{
   if(group){groupPivot.updateMatrixWorld(true);applyGroupDrag(group.members,group.p0,groupPivot.matrixWorld);for(const m of group.members)m.o.updateMatrixWorld(true);drawSelection();invalidate();return;}
   const id=getStudio3DState().selected;if(id!=null)patchStudio3D({selectedInfo:stage.info(id)});drawSelection();});
  /** The objects an edit acts on: the multi-selection, or the single selected object. */
  const currentSet=():number[]=>{const st=getStudio3DState();const m=st.marked.filter(x=>stage.find(x));return m.length?m:st.selected!=null&&stage.find(st.selected)?[st.selected]:[];};
  const syncGizmo=()=>{
   const ids=currentSet();
   if(ids.length>1){
    const box=new THREE.Box3();for(const id of ids)box.expandByObject(stage.find(id)!);
    groupPivot.position.copy(box.isEmpty()?new THREE.Vector3():box.getCenter(new THREE.Vector3()));groupPivot.quaternion.identity();groupPivot.scale.set(1,1,1);
    if(!groupPivot.parent)scene.add(groupPivot);groupPivot.updateMatrixWorld(true);gizmo.attach(groupPivot);return;
   }
   const id=getStudio3DState().selected;const o=id==null?null:stage.find(id);if(o)gizmo.attach(o);else gizmo.detach();
  };
  const helpers=new Map<number,THREE.CameraHelper>();
  const syncCameraHelpers=()=>{
   const live=new Set<number>();
   stage.root.traverse(o=>{const c=o as THREE.PerspectiveCamera;if(!c.isPerspectiveCamera)return;live.add(c.id);let h=helpers.get(c.id);if(!h){h=new THREE.CameraHelper(c);helpers.set(c.id,h);scene.add(h);}c.updateMatrixWorld(true);h.update();});
   for(const [id,h] of helpers)if(!live.has(id)){scene.remove(h);h.dispose();helpers.delete(id);}
  };
  syncHooks.push(()=>{syncGizmo();syncCameraHelpers();});
  const syncShadows=()=>{
   const r=bounds&&boundsValid(bounds)?Math.max(boundsRadius(bounds),1):5;
   holder.traverse(o=>{
    const m=o as THREE.Mesh;if(m.isMesh){m.castShadow=true;m.receiveShadow=true;}
    const l=o as THREE.DirectionalLight&THREE.SpotLight&THREE.PointLight;
    if(l.isLight&&l.shadow){l.shadow.mapSize.set(2048,2048);l.shadow.bias=-0.0005;l.shadow.normalBias=0.02;
     if((l as THREE.DirectionalLight).isDirectionalLight){const c=l.shadow.camera as THREE.OrthographicCamera;const e=r*1.6;c.left=-e;c.right=e;c.top=e;c.bottom=-e;c.near=0.1;c.far=Math.max(50,r*8);c.updateProjectionMatrix();}}
   });
  };
  syncHooks.push(syncShadows);
  const applySnap=()=>{const sn=getStudio3DState().snap;gizmo.setTranslationSnap(sn.on?sn.move:null);gizmo.setRotationSnap(sn.on?THREE.MathUtils.degToRad(sn.rotate):null);gizmo.setScaleSnap(sn.on?sn.scale:null);invalidate();};
  applySnap();
  const nudgeBy=(id:number,d:{x?:number;y?:number;z?:number})=>{
   const set=currentSet();if(set.length>1&&set.includes(id)){stage.translateMany(set,d);return;}
   const o=stage.find(id);if(!o)return;const sn=getStudio3DState().snap;
   const axis=(k:'x'|'y'|'z')=>d[k]===undefined?{}:{[k]:sn.on?snapTo(o.position[k]+d[k]!,sn.move):o.position[k]+d[k]!};
   stage.setTransform(id,{position:{...axis('x'),...axis('y'),...axis('z')}},{group:'nudge'});
  };
  let opening=0;
  const guard=(what:'open'|'new',files:File[],force:boolean|undefined,run:()=>void|Promise<void>)=>{
   if(!force&&stage.dirty){patchStudio3D({confirmReplace:{what,files}});return false;}
   patchStudio3D({confirmReplace:null});void run();return true;
  };
  /** Hands the clips of a loaded file to the stage, with the clip length and easing this studio wrote into the animation extras. */
  const clipsFrom=async(gltf:{animations:unknown[];parser?:GltfParser})=>{
   const json=gltf.parser?.json.animations;const metas:(ClipMeta|undefined)[]=json?json.map(a=>parseExtras(a.extras)):[];
   const nodes=new Map<number,THREE.Object3D>();
   for(const m of metas)for(const t of m?.tracks??[])if(!nodes.has(t.node)){try{nodes.set(t.node,await gltf.parser!.getDependency('node',t.node));}catch{/* the track keeps its samples */}}
   stage.setClips(gltf.animations as THREE.AnimationClip[],metas,i=>nodes.get(i));resetAnim();
  };
  const openNow=async(files:File[])=>{
   const primary=files.find(f=>/\.som3d$/i.test(f.name))??files.find(f=>modelFormatFor(f.name));const ticket=++opening;
   if(!primary){patchStudio3D({status:'error',error:'Choose a .glb, .gltf, .obj, .stl or .ply file.'});return;}
   patchStudio3D({status:'loading',name:primary.name,error:'',blank:false});
   if(/\.som3d$/i.test(primary.name)){
    try{
     const text=await primary.text();const doc=parseDocument(text);
     const bytes=await sceneBytes(doc,files.filter(f=>f!==primary).map(f=>({name:f.name,bytes:async()=>new Uint8Array(await f.arrayBuffer())})));
     const {gltf}=await loadParsed(new File([bytes as BlobPart],'scene.glb'),[]);
     if(ticket!==opening||disposed)return;
     const nodes=[...gltf.scene.children];const applied=applyNodeExtras(gltf.scene,doc.extras);
     selectionReset();stage.loadMany(nodes);await clipsFrom(gltf);
     if(doc.envMap){customEnv={name:doc.envMap.name,bytes:fromBase64(doc.envMap.data).slice().buffer};envCache.delete('custom');}
     let env=doc.env;let notice=applied.skipped?'Some saved light settings could not be restored.':'';
     if(env.preset==='custom'&&!(customEnv&&customEnv.name===env.customName)){notice=`The scene used the environment map ${env.customName}. Open it again with Open HDR; the studio lighting is used for now.`;env={...env,preset:'studio'};}
     patchStudio3D({status:'ready',name:primary.name,error:'',format:'SOM3D',bytes:primary.size,blank:false,confirmReplace:null,notice,unitHint:null,unit:doc.unit,env,snap:doc.snap});
     applySnap();void applyEnv();
     if(doc.view){camera.fov=doc.view.fov;camera.position.fromArray(doc.view.position);controls.target.fromArray(doc.view.target);camera.updateProjectionMatrix();controls.update();invalidate();}else frameAll();
    }catch(e){
     if(ticket!==opening)return;
     patchStudio3D({status:'error',error:e instanceof DocumentError||e instanceof ModelError||e instanceof Error?e.message:String(e),blank:false});
    }
    return;
   }
   try{
    const {gltf,header,size,notice,unitHint}=await loadParsed(primary,files.filter(f=>f!==primary));
    if(ticket!==opening||disposed){gltf.scene.traverse(o=>{(o as THREE.Mesh).geometry?.dispose?.();});return;}
    selectionReset();
    stage.load(gltf.scene);await clipsFrom(gltf);
    patchStudio3D({status:'ready',name:primary.name,error:'',format:header.format.toUpperCase(),bytes:size,blank:false,confirmReplace:null,notice,unitHint});loadUnit();
    frameAll();
   }catch(e){
    if(ticket!==opening)return;
    patchStudio3D({status:'error',error:e instanceof Error?e.message:String(e),blank:false});
   }
  };
  const selectionReset=()=>{patchStudio3D({selected:null,selectedInfo:null,marked:[],notice:'',unitHint:null});};
  const openFiles=async(files:File[],force?:boolean)=>{guard('open',files,force,()=>openNow(files));};
  const newScene=(force?:boolean)=>{guard('new',[],force,()=>{opening++;selectionReset();stage.clear();resetAnim();resetStudio3D({status:'ready',blank:true,name:''});sync();frameAll();});};
  /** Renders one PNG at the requested size and puts the viewport back the way it was. */
  const capture=async(cam:THREE.PerspectiveCamera,want:{width:number;height:number}|null,transparent:boolean):Promise<Blob>=>{
   const dom=renderer.domElement;const w0=dom.width,h0=dom.height;const pr=renderer.getPixelRatio();
   const aspect0=cam.aspect,bg=scene.background;
   const hidden:[THREE.Object3D,boolean][]=[grid,gizmoHelper,marks,...(selection?[selection]:[]),...helpers.values()].map(o=>[o,o.visible]);
   try{
    for(const [o] of hidden)o.visible=false;
    if(transparent){scene.background=null;renderer.setClearColor(0x000000,0);}
    renderer.setPixelRatio(1);
    const size=want??(cam===camera?{width:w0,height:h0}:{width:w0,height:Math.max(1,Math.round(w0/(cam.aspect||1)))});
    renderer.setSize(size.width,size.height,false);cam.aspect=size.width/size.height;cam.updateProjectionMatrix();
    renderer.render(scene,cam);
    const blob=await new Promise<Blob|null>(r=>dom.toBlob(r,'image/png'));
    if(!blob)throw new Error('The 3D view could not be captured.');
    return blob;
   }finally{
    for(const [o,v] of hidden)o.visible=v;
    scene.background=bg;if(transparent)renderer.setClearColor(0x000000,1);
    cam.aspect=aspect0;cam.updateProjectionMatrix();renderer.setPixelRatio(pr);renderer.setSize(w0/pr,h0/pr,false);invalidate();
   }
  };
  const maxSize=()=>{const gl=renderer.getContext();return Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number,gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,16384);};
  const renderStill=async(opts:{camera?:number;width?:number;height?:number;transparent?:boolean}={})=>{
   let cam:THREE.PerspectiveCamera=camera;
   if(opts.camera!==undefined){const c=stage.find(opts.camera) as THREE.PerspectiveCamera|undefined;if(!c||!c.isPerspectiveCamera)throw Object.assign(new Error('That object is not a camera.'),{expected:true});cam=c;}
   const want=opts.width||opts.height?clampRenderSize(opts.width??Math.round((opts.height!)*(cam.aspect||1)),opts.height??Math.round((opts.width!)/(cam.aspect||1)),maxSize()):null;
   download(await capture(cam,want,!!opts.transparent),`${stem(getStudio3DState().name||'scene')}-${cam===camera?'still':'camera'}.png`);
  };
  let cancelFlag=false;
  const renderTurntable=async(opts:{frames?:number;width?:number;height?:number;transparent?:boolean}={})=>{
   if(getStudio3DState().render)throw Object.assign(new Error('A render is already running.'),{expected:true});
   const size=clampRenderSize(opts.width??1280,opts.height??720,maxSize());
   const plan=turntablePlan(opts.frames??36,size.width,size.height);
   const {zipSync}=await import('fflate');
   const pos0=camera.position.clone(),enabled0=controls.enabled;const target=controls.target.clone();const off=pos0.clone().sub(target);
   const files:Record<string,Uint8Array>={};cancelFlag=false;patchStudio3D({render:{done:0,total:plan.frames}});controls.enabled=false;
   try{
    for(let i=0;i<plan.frames;i++){
     if(cancelFlag||disposed)throw Object.assign(new Error('Render cancelled.'),{expected:true});
     camera.position.copy(target).add(off.clone().applyAxisAngle(new THREE.Vector3(0,1,0),plan.step*i));camera.lookAt(target);camera.updateMatrixWorld(true);
     const blob=await capture(camera,size,!!opts.transparent);
     files[frameName(i,plan.frames)]=new Uint8Array(await blob.arrayBuffer());
     patchStudio3D({render:{done:i+1,total:plan.frames}});
     await new Promise(r=>setTimeout(r,0));
    }
    download(new Blob([zipSync(files,{level:0}) as BlobPart],{type:'application/zip'}),`${stem(getStudio3DState().name||'scene')}-turntable.zip`);
   }finally{
    camera.position.copy(pos0);camera.lookAt(target);controls.enabled=enabled0;patchStudio3D({render:null});invalidate();
   }
  };
  const exportMesh=async(format:'stl'|'obj')=>{
   let meshes=0;holder.traverse(o=>{if((o as THREE.Mesh).isMesh)meshes++;});
   if(!meshes)throw Object.assign(new Error('There is no mesh to export. Open a model or add a shape first.'),{expected:true});
   const unit=getStudio3DState().unit;const prev=holder.scale.clone();
   holder.scale.multiplyScalar(unitScale(unit));holder.updateMatrixWorld(true);
   let blob:Blob;
   try{
    if(format==='stl')blob=new Blob([new STLExporter().parse(holder,{binary:true}) as unknown as BlobPart],{type:'model/stl'});
    else blob=new Blob([new OBJExporter().parse(holder)],{type:'model/obj'});
   }finally{holder.scale.copy(prev);holder.updateMatrixWorld(true);invalidate();}
   download(blob,exportFileName(stem(getStudio3DState().name||'scene'),format,unit));
  };
  const deleteSelection=(ids?:number[])=>{
   const set=ids??currentSet();if(!set.length)throw Object.assign(new Error('Select something first.'),{expected:true});
   if(set.length===1)stage.remove(set[0]);else stage.removeMany(set);
   patchStudio3D({selected:null,marked:[],selectedInfo:null});sync();
  };
  const duplicateSelection=(ids?:number[])=>{
   const set=ids??currentSet();if(!set.length)throw Object.assign(new Error('Select something first.'),{expected:true});
   const copies=set.length===1?[stage.duplicate(set[0])]:stage.duplicateMany(set);
   applySet(copies.map(c=>c.id),copies[copies.length-1].id);return copies.map(c=>c.id);
  };
  /** Saves the scene as a .som3d document: settings as JSON, geometry as an embedded or separate GLB. */
  /** The scene as .som3d text. Autosave and recent files always embed the geometry so they open without a sidecar. */
  const sceneText=async(sidecar:string|undefined,embedEnv:boolean,glb:Uint8Array)=>{
   const st=getStudio3DState();
   return buildDocument({glb,sidecar,envMap:embedEnv&&customEnv?{name:customEnv.name,bytes:new Uint8Array(customEnv.bytes)}:undefined,unit:st.unit,env:st.env,snap:st.snap,extras:collectNodeExtras(holder),
    view:{position:camera.position.toArray() as [number,number,number],target:controls.target.toArray() as [number,number,number],fov:camera.fov}});
  };
  /** Images are embedded in the file; anything above the limit is scaled down, and a scene whose textures would not fit in memory is refused. */
  const exportOpts=(binary:boolean)=>{const why=exportBlocker(stage.measure().stats);if(why)throw Object.assign(new Error(why),{expected:true});return{binary,maxTextureSize:LIMITS.exportMaxTextureSize};};
  /** With clips the exporter gets a scene that lists the top-level nodes, so tracks find their nodes; without clips the input is unchanged. */
  const newExporter=()=>{const e=new GLTFExporter();e.register(stage.exporterPlugin() as never);return e;};
  const exportInput=(whole:boolean)=>{const animations=stage.exportClips();return animations.length?{input:stage.exportScene() as THREE.Object3D|THREE.Object3D[],animations}:{input:(whole?[...holder.children]:holder.children.length===1?holder.children[0]:holder) as THREE.Object3D|THREE.Object3D[],animations:undefined};};
  const sceneGlb=async()=>{const x=exportInput(true);return new Uint8Array(await newExporter().parseAsync(x.input,{...exportOpts(true),onlyVisible:false,...(x.animations?{animations:x.animations}:{})}) as ArrayBuffer);};
  /** Saves the scene as a .som3d document: settings as JSON, geometry as an embedded or separate GLB. */
  const saveDocument=async(sidecar=false,embedEnv=false)=>{
   if(!holder.children.length)throw Object.assign(new Error('There is nothing to save. Open a model or add a shape first.'),{expected:true});
   const st=getStudio3DState();const name=stem(st.name||'scene');const glbName=`${name}.scene.glb`;
   if(embedEnv&&!(st.env.preset==='custom'&&customEnv))throw Object.assign(new Error('There is no custom environment map to embed. Open an HDR first.'),{expected:true});
   const glb=await sceneGlb();const text=await sceneText(sidecar?glbName:undefined,embedEnv,glb);
   download(new Blob([text],{type:'application/json'}),`${name}.som3d`);
   if(sidecar)download(new Blob([glb as BlobPart],{type:'model/gltf-binary'}),glbName);
   patchStudio3D({name:`${name}.som3d`});stage.markSaved();
   // Keep a self-contained copy in this browser for the recent list. Never blocks or fails the save.
   void (async()=>{try{await rememberScene(`${name}.som3d`,sidecar?await sceneText(undefined,embedEnv,glb):text,false);}catch{/* no storage */}})();
  };
  /** Autosave: a quiet period after the last change, one replaceable slot, never while a render runs. */
  let lastChange=0,lastAuto=0,autoTimer:ReturnType<typeof setTimeout>|null=null,autoBusy=false;
  const runAutosave=async()=>{
   autoTimer=null;const st=getStudio3DState();
   if(disposed||autoBusy||!holder.children.length||st.status!=='ready'||st.render)return;
   if(!autosaveDue({dirty:stage.dirty,lastChange,lastSave:lastAuto,now:Date.now()})){if(stage.dirty&&lastChange>lastAuto)autoTimer=setTimeout(()=>void runAutosave(),1500);return;}
   autoBusy=true;
   try{
    const glb=await sceneGlb();const text=await sceneText(undefined,false,glb);lastAuto=Date.now();
    const r=await rememberScene(stem(st.name||'scene')+'.som3d',text,true);
    if(!r.ok&&r.reason==='too-large'&&!getStudio3DState().notice)patchStudio3D({notice:'This scene is too large to autosave in the browser. Use Save.'});
   }catch{/* autosave is best effort */}finally{autoBusy=false;}
  };
  const scheduleAutosave=()=>{if(!stage.dirty)return;lastChange=Date.now();if(autoTimer)clearTimeout(autoTimer);autoTimer=setTimeout(()=>void runAutosave(),4200);};
  const offAuto=stage.onChange(scheduleAutosave);
  const projectName=()=>{try{return getAppState().projectName||'';}catch{return '';}};
  const loadUnit=()=>{try{patchStudio3D({unit:readProjectUnit(localStorage,projectName())});}catch{/* keep current */}};
  loadUnit();
  const setUnit=(u:unknown)=>{if(!isUnit(u))throw Object.assign(new Error('Unit must be m, cm, mm or in.'),{expected:true});patchStudio3D({unit:u});try{writeProjectUnit(localStorage,projectName(),u);}catch{/* session only */}};
  const exportGlb=async()=>{
   if(!holder.children.length)throw Object.assign(new Error('There is nothing to export. Open a model first.'),{expected:true});
   const x=exportInput(false);const result=await newExporter().parseAsync(x.input,{...exportOpts(true),...(x.animations?{animations:x.animations}:{})});
   download(new Blob([result as ArrayBuffer],{type:'model/gltf-binary'}),`${stem(getStudio3DState().name||'scene')}.glb`);
   stage.markSaved();
  };
  /** glTF 2.0 as one self-contained .gltf file (buffers and images embedded as data URIs). */
  const exportGltf=async()=>{
   if(!holder.children.length)throw Object.assign(new Error('There is nothing to export. Open a model first.'),{expected:true});
   const x=exportInput(false);const result=await newExporter().parseAsync(x.input,{...exportOpts(false),...(x.animations?{animations:x.animations}:{})});
   download(new Blob([JSON.stringify(result)],{type:'model/gltf+json'}),`${stem(getStudio3DState().name||'scene')}.gltf`);
  };
  /** Reads an image the user chose for a texture slot. Type, size and pixel count are checked from the file header before anything decodes it. Nothing is fetched. */
  const setTextureFile=async(id:number,slot:TextureSlot,file:File|null)=>{
   if(!isTextureSlot(slot))throw Object.assign(new Error('Unknown texture slot.'),{expected:true});
   if(!file){stage.setTexture(id,slot,null);return;}
   try{inspectImage(file.name,file.size>MAX_TEXTURE_FILE_BYTES?new Uint8Array(MAX_TEXTURE_FILE_BYTES+1):new Uint8Array(await file.arrayBuffer()));}
   catch(e){if(e instanceof MaterialError)throw Object.assign(e,{expected:true});throw e;}
   const url=URL.createObjectURL(file);
   try{const tex=await new THREE.TextureLoader().loadAsync(url);tex.name=file.name;stage.setTexture(id,slot,tex);}
   finally{URL.revokeObjectURL(url);}
  };
  const mirrorSelection=(axis:'x'|'y'|'z',copy:boolean,ids?:number[])=>{
   const set=ids??currentSet();if(!set.length)throw Object.assign(new Error('Select something first.'),{expected:true});
   const out=stage.mirror(set,axis,copy);if(copy)applySet(out.map(o=>o.id),out[out.length-1].id);return out.map(o=>o.id);
  };
  const applyScaleSel=(ids?:number[])=>{const set=ids??currentSet();if(!set.length)throw Object.assign(new Error('Select something first.'),{expected:true});stage.applyScale(set);};
  const mergeSel=(ids?:number[])=>{
   const set=ids??currentSet();if(set.length<2)throw Object.assign(new Error('Tick at least two meshes in the scene list to merge them.'),{expected:true});
   const m=stage.merge(set);applySet([],m.id);return m.id;
  };
  const viewPreset=(preset:ViewPreset)=>{
   const id=getStudio3DState().selected;const obj=id==null?null:stage.find(id);
   const box=obj?new THREE.Box3().setFromObject(obj):null;
   const dir=new THREE.Vector3(...viewDirection(preset));
   if(box&&!box.isEmpty())place(dir,box.getCenter(new THREE.Vector3()),Math.max(box.getSize(new THREE.Vector3()).length()/2,1e-4));
   else if(bounds&&boundsValid(bounds))place(dir,new THREE.Vector3(...boundsCenter(bounds)),Math.max(boundsRadius(bounds),1e-4));
   else place(dir,new THREE.Vector3(0,0,0),5);
  };
  /** Animation clips live in the stage (so edits are undoable and get saved). Playback poses the nodes as a pure function of clip and time and never touches the undo history. */
  const anim=()=>getStudio3DState().anim;
  const ensureMixer=()=>{if(!mixer||mixerRev!==stage.clipRevision){mixer?.stopAllAction();mixer=new THREE.AnimationMixer(holder);mixerRev=stage.clipRevision;}return mixer;};
  const showPose=()=>{const sel=getStudio3DState().selected;if(sel!=null)patchStudio3D({selectedInfo:stage.info(sel)});};
  const pose=(clip:number,time:number)=>{
   const c=stage.playableClip(clip);if(!c)return;
   const m=ensureMixer();m.stopAllAction();const a=m.clipAction(c);a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;a.reset().play();m.setTime(time);
   holder.updateMatrixWorld(true);drawSelection();invalidate();
  };
  /** Back to the start of the first clip, e.g. after a new model was opened. */
  const resetAnim=()=>{stopAnim();mixer?.stopAllAction();mixer=null;patchStudio3D({clips:clipInfos(),anim:{clip:0,playing:false,time:0,loop:true,speed:1}});};
  const tick=(now:number)=>{
   animRaf=0;const a=anim();const c=stage.clips[a.clip];if(!a.playing||!c)return;
   const r=advance(a.time,(now-lastTick)/1000,c.duration,a.loop,a.speed);lastTick=now;
   pose(a.clip,r.time);state_time=r.time;
   // Publish about 15 times a second so the panel does not re-render every frame.
   if(r.ended||now-lastPublish>66){lastPublish=now;patchStudio3D({anim:{...a,time:r.time,playing:!r.ended}});showPose();}
   if(!r.ended)animRaf=requestAnimationFrame(tick);
  };
  const animPlay=(clip?:number)=>{
   const infos=clipInfos();const a=anim();const idx=clip===undefined?a.clip:checkClip(clip,infos);checkClip(idx,infos);
   const t=idx===a.clip?startTime(a.time,infos[idx].duration,a.loop):0;
   patchStudio3D({anim:{...a,clip:idx,time:t,playing:true}});stopAnim();lastTick=performance.now();lastPublish=lastTick;pose(idx,t);animRaf=requestAnimationFrame(tick);
  };
  const animPause=()=>{stopAnim();const a=anim();patchStudio3D({anim:{...a,playing:false,time:a.playing&&state_time?state_time:a.time}});showPose();};
  const animSeek=(time:number)=>{
   const infos=clipInfos();const a=anim();checkClip(a.clip,infos);if(typeof time!=='number'||!Number.isFinite(time))throw new AnimationError('Time must be a number.');
   const t=clampTime(time,infos[a.clip].duration);state_time=t;patchStudio3D({anim:{...a,time:t}});pose(a.clip,t);showPose();if(a.playing)lastTick=performance.now();
   sync();
  };
  const animLoop=(loop:boolean)=>patchStudio3D({anim:{...anim(),loop:!!loop}});
  const animSpeed=(speed:number)=>patchStudio3D({anim:{...anim(),speed:checkSpeed(speed)}});
  /** Clip editing. A new clip becomes the current one. */
  const clipAdd=(name?:string,duration?:number)=>{const i=stage.addClip(name,duration);stopAnim();patchStudio3D({anim:{...anim(),clip:i,playing:false,time:0}});return i;};
  const clipIndex=(clip?:number)=>clip===undefined?anim().clip:clip;
  const clipRemove=(clip?:number)=>{const i=clipIndex(clip);stopAnim();stage.removeClip(i);patchStudio3D({anim:{...anim(),clip:Math.max(0,Math.min(anim().clip,stage.clips.length-1)),playing:false,time:0}});};
  const clipRename=(name:string,clip?:number)=>stage.renameClip(clipIndex(clip),name);
  const clipDuration=(duration:number,clip?:number)=>{stage.setClipDuration(clipIndex(clip),duration);patchStudio3D({anim:{...anim(),time:Math.min(anim().time,duration)}});};
  const keyTarget=(id?:number)=>{const t=id??getStudio3DState().selected;if(t==null)throw Object.assign(new Error('Select an object first.'),{expected:true});return t;};
  const keySet=(path:KeyPath,time?:number,id?:number,value?:{x?:number;y?:number;z?:number})=>{
   if(!stage.clips.length)clipAdd();
   stage.setKey(anim().clip,keyTarget(id),path,time??anim().time,value);
  };
  const keyRemove=(path:KeyPath,time?:number,id?:number)=>stage.removeKey(anim().clip,keyTarget(id),path,time??anim().time);
  const keyMove=(path:KeyPath,from:number,to:number,id?:number)=>stage.moveKey(anim().clip,keyTarget(id),path,from,to);
  const keyEase=(path:KeyPath,time:number,ease:Ease,id?:number)=>stage.setKeyEase(anim().clip,keyTarget(id),path,time,ease);
  /** Auto-key records transform changes into the current clip at the playhead. Turning it on without a clip makes one. */
  const autoKey=(on:boolean)=>{if(on&&!stage.clips.length)clipAdd();patchStudio3D({autoKey:!!on});};
  stage.autoKeySource=()=>getStudio3DState().autoKey&&stage.clips.length?{clip:anim().clip,time:anim().time}:null;
  const off=registerStudio3DController({keyMove,keyEase,autoKey,clipAdd,clipRemove,clipRename,clipDuration,keySet,keyRemove,animPlay,animPause,animSeek,animLoop,animSpeed,setTextureTransform:(id,slot,p)=>stage.setTextureTransform(id,slot,p),exportGltf,setTextureFile,mirrorSelection,applyScale:applyScaleSel,mergeSelection:mergeSel,viewPreset,setPrimitive:(id,p)=>stage.setPrimitive(id,p),
   save:saveDocument,deleteSelection,duplicateSelection,exportMesh,renderTurntable,cancelRender:()=>{cancelFlag=true;},setUnit,openFiles,newScene,resetView:frameAll,frameSelection,select,renderStill,exportGlb,
   addPrimitive:k=>{const o=stage.addPrimitive(k);select(o.id);return o.id;},addLight:k=>{const o=stage.addLight(k);select(o.id);return o.id;},
   setTransform:(id,p)=>stage.setTransform(id,p),setMaterial:(id,p)=>stage.setMaterial(id,p),rename:(id,n)=>stage.rename(id,n),
   addCamera:fromView=>{
    const o=fromView?stage.addCamera({position:{x:camera.position.x,y:camera.position.y,z:camera.position.z},quaternion:camera.quaternion.toArray().slice(0,4) as [number,number,number,number]},camera.fov):stage.addCamera();
    select(o.id);return o.id;},
   setCamera:(id,p)=>stage.setCamera(id,p),
   viewFromCamera:id=>{
    const c=stage.find(id) as THREE.PerspectiveCamera|undefined;if(!c||!c.isPerspectiveCamera)throw Object.assign(new Error('Select a camera first.'),{expected:true});
    c.updateMatrixWorld(true);const pos=c.getWorldPosition(new THREE.Vector3());const dir=c.getWorldDirection(new THREE.Vector3());
    const dist=bounds&&boundsValid(bounds)?Math.max(boundsRadius(bounds),1):5;
    camera.fov=c.fov;camera.position.copy(pos);controls.target.copy(pos).addScaledVector(dir,dist);camera.near=0.05;camera.far=Math.max(500,dist*50);camera.updateProjectionMatrix();controls.update();invalidate();},
   setGizmo:mode=>{gizmo.setMode(mode);patchStudio3D({gizmo:mode});invalidate();},
   nudge:nudgeBy,
   setLight:(id,p)=>stage.setLight(id,p),setPivot:(id,at)=>stage.setPivot(id,at),align:(ids,a,t)=>stage.align(ids,a,t),distribute:(ids,a)=>stage.distribute(ids,a),
   setSnap:patch=>{patchStudio3D({snap:mergeSnap(getStudio3DState().snap,patch)});applySnap();},
   setEnv:patch=>{patchStudio3D({env:mergeEnv(getStudio3DState().env,patch)});void applyEnv();},
   openEnvFile:async file=>{
    if(!envFormatFor(file.name))throw new EnvError('Choose an .hdr or .exr file.');
    if(file.size>128*1024*1024)throw new EnvError(`${file.name} is larger than 128 MB.`);
    customEnv={name:file.name,bytes:await file.arrayBuffer()};envCache.delete('custom');
    patchStudio3D({env:mergeEnv(getStudio3DState().env,{preset:'custom',customName:file.name})});await applyEnv();},
   remove:id=>{stage.remove(id);},duplicate:id=>{const o=stage.duplicate(id);select(o.id);return o.id;},undo:()=>stage.undo(),redo:()=>stage.redo(),
   setGrid:on=>{grid.visible=on;patchStudio3D({grid:on});invalidate();},
   setWireframe:on=>{applyWire(on);patchStudio3D({wireframe:on});invalidate();},
  });
  // Pick by click (no drag) and keyboard orbit/zoom.
  let down:{x:number;y:number}|null=null;const ray=new THREE.Raycaster();
  let shiftDrag=false;let marquee:HTMLDivElement|null=null;
  const endMarquee=()=>{marquee?.remove();marquee=null;if(shiftDrag){shiftDrag=false;controls.enabled=true;}};
  // Capture phase, so orbit never starts when shift is held: shift+click toggles, shift+drag draws a marquee.
  const onDownCapture=(e:PointerEvent)=>{if(e.shiftKey&&e.button===0&&gizmo.axis===null){shiftDrag=true;controls.enabled=false;}};
  const onDown=(e:PointerEvent)=>{down=gizmo.axis!==null?null:{x:e.clientX,y:e.clientY};};
  const onMove=(e:PointerEvent)=>{
   if(!shiftDrag||!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)<=4)return;
   if(!marquee){marquee=document.createElement('div');marquee.style.cssText='position:fixed;pointer-events:none;border:1px dashed var(--focus-ring);background:var(--accent-soft);z-index:50';marquee.setAttribute('aria-hidden','true');document.body.appendChild(marquee);}
   const r=marqueeRect(down,{x:e.clientX,y:e.clientY});marquee.style.left=r.x0+'px';marquee.style.top=r.y0+'px';marquee.style.width=(r.x1-r.x0)+'px';marquee.style.height=(r.y1-r.y0)+'px';
  };
  const onUp=(e:PointerEvent)=>{
   const wasShift=shiftDrag;endMarquee();
   if(justDragged){justDragged=false;down=null;return;}
   if(!down){return;}
   const start=down;down=null;const rect=renderer.domElement.getBoundingClientRect();
   if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>4){
    if(!wasShift)return;
    const box=marqueeRect(start,{x:e.clientX,y:e.clientY});const ids:number[]=[];
    holder.traverse(o=>{if(!(o as THREE.Mesh).isMesh)return;const b=new THREE.Box3().setFromObject(o);if(b.isEmpty())return;
     const p=b.getCenter(new THREE.Vector3()).project(camera);if(p.z>1)return;
     if(inRect(box,{x:rect.left+(p.x+1)/2*rect.width,y:rect.top+(1-p.y)/2*rect.height}))ids.push(o.id);});
    applySet(ids,ids.length?ids[ids.length-1]:null);return;
   }
   ray.setFromCamera(new THREE.Vector2(((e.clientX-rect.left)/rect.width)*2-1,-(((e.clientY-rect.top)/rect.height)*2-1)),camera);
   const hit=ray.intersectObject(holder,true).find(h=>(h.object as THREE.Mesh).isMesh);
   const target=hit?.object??null;
   if(wasShift){if(target){const st=getStudio3DState();const t=toggleSelection(st.marked,st.selected,target.id);applySet(t.marked,t.selected);}return;}
   select(target?target.id:null);
  };
  const onKey=(e:KeyboardEvent)=>{
   const sel=getStudio3DState().selected;
   if(!e.ctrlKey&&!e.metaKey&&!e.altKey){
    if(e.key==='w'||e.key==='W'){gizmo.setMode('translate');patchStudio3D({gizmo:'translate'});invalidate();e.preventDefault();return;}
    if(e.key==='e'||e.key==='E'){gizmo.setMode('rotate');patchStudio3D({gizmo:'rotate'});invalidate();e.preventDefault();return;}
    if(e.key==='r'||e.key==='R'){gizmo.setMode('scale');patchStudio3D({gizmo:'scale'});invalidate();e.preventDefault();return;}
    if((e.key==='Delete'||e.key==='Backspace')&&currentSet().length){deleteSelection();e.preventDefault();return;}
    const stepNow=getStudio3DState().snap.on?getStudio3DState().snap.move:0.1;const n=e.shiftKey&&sel!=null?nudgeFor(e.key,stepNow):null;
    if(n&&sel!=null){nudgeBy(sel,n);e.preventDefault();return;}
   }
   const off=camera.position.clone().sub(controls.target);const sph=new THREE.Spherical().setFromVector3(off);const step=Math.PI/36;let used=true;
   if(e.key==='ArrowLeft')sph.theta-=step;else if(e.key==='ArrowRight')sph.theta+=step;
   else if(e.key==='ArrowUp')sph.phi=Math.max(0.05,sph.phi-step);else if(e.key==='ArrowDown')sph.phi=Math.min(Math.PI-0.05,sph.phi+step);
   else if(e.key==='+'||e.key==='=')sph.radius*=0.9;else if(e.key==='-')sph.radius/=0.9;
   else if(e.key==='Home')frameAll();else used=false;
   if(!used)return;e.preventDefault();
   if(e.key!=='Home'){sph.radius=Math.min(Math.max(sph.radius,controls.minDistance||1e-3),controls.maxDistance||Infinity);camera.position.copy(controls.target).add(off.setFromSpherical(sph));camera.lookAt(controls.target);controls.update();invalidate();}
  };
  const cv=renderer.domElement;cv.addEventListener('pointerdown',onDownCapture,true);cv.addEventListener('pointerdown',onDown);window.addEventListener('pointermove',onMove);window.addEventListener('pointercancel',endMarquee);cv.addEventListener('pointerup',onUp);cv.addEventListener('keydown',onKey);
  sync();frameAll();void applyEnv();
  return()=>{
   disposed=true;opening++;stopAnim();mixer?.stopAllAction();stage.autoKeySource=null;off();offAuto();if(autoTimer)clearTimeout(autoTimer);cancelAnimationFrame(frame);ro.disconnect();controls.dispose();
   cv.removeEventListener('pointerdown',onDownCapture,true);cv.removeEventListener('pointerdown',onDown);window.removeEventListener('pointermove',onMove);window.removeEventListener('pointercancel',endMarquee);endMarquee();cv.removeEventListener('pointerup',onUp);cv.removeEventListener('keydown',onKey);
   if(getStudio3DState().status==='loading')patchStudio3D({status:stage.root.children.length?'ready':'idle',confirmReplace:null});
   gizmo.detach();gizmo.dispose();offStage();clearSelection();for(const h of helpers.values())h.dispose();grid.geometry.dispose();(grid.material as THREE.Material).dispose();for(const t of envTargets)t.dispose();envCache.clear();pmrem.dispose();renderer.dispose();renderer.forceContextLoss();
   if(cv.parentNode===el)el.removeChild(cv);
  };
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 const s=useStudio3D();
 return <div className="relative flex min-h-0 flex-1 flex-col" data-testid="studio3d-viewport">
  <div ref={host} className="min-h-0 flex-1 overflow-hidden rounded-[25px]"/>
  {s.status==='loading'&&<StudioStatus className="pointer-events-none absolute left-4 top-3 m-0 rounded-md bg-surface px-2 py-1 text-xs">{t('studio3d.status.loading',{name:s.name})}</StudioStatus>}
  {s.status==='error'&&<StudioStatus tone="error" live="assertive" className="absolute left-4 top-3 m-0 max-w-[80%] rounded-md bg-surface px-2 py-1 text-xs">{t('studio3d.status.error')}: {s.error}</StudioStatus>}
  <p className="sr-only">{t('studio3d.keys.hint')}</p>
 </div>;
}
