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
import {Stage} from '../../lib/studio3d/stage';
import {registerStudio3DController} from '../../lib/studio3d/commands';
import {patchStudio3D,resetStudio3D,getStudio3DState,useStudio3D} from '../../lib/studio3d/session';

const DEFAULT_DIR=new THREE.Vector3(1,0.75,1).normalize();
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
  const syncHooks:(()=>void)[]=[];
  /** Pushes the stage into the session: outline, stats, selection info and undo state. */
  const sync=()=>{
   const m=stage.measure(animationCount);bounds=m.bounds;
   const sel=getStudio3DState().selected;const info=sel==null?null:stage.info(sel);
   patchStudio3D({stats:m.stats,outline:m.outline,bounds:m.bounds,selected:info?sel:null,selectedInfo:info,dirty:stage.dirty,canUndo:stage.canUndo,canRedo:stage.canRedo,undoLabel:stage.undoLabel});
   drawSelection();applyWire(getStudio3DState().wireframe);for(const h of syncHooks)h();invalidate();
  };
  let animationCount=0;
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
   manager.setURLModifier(u=>{if(u.startsWith('data:')||u.startsWith('blob:'))return u;const hit=urls.get(base(decodeURIComponent(u)).toLowerCase());return hit??u;});
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
       const BLANK='data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
       const tm=new THREE.LoadingManager();
       tm.setURLModifier(u=>u.startsWith('data:')||u.startsWith('blob:')?u:blobs.get(base(safeDecode(u)).toLowerCase())??BLANK);
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
    if(header.format==='gltf'){
     const missing=externalResources(header.json).filter(r=>!urls.has(base(decodeURIComponent(r)).toLowerCase()));
     if(missing.length)throw new ModelError(`${file.name} refers to files that were not selected: ${missing.slice(0,4).join(', ')}${missing.length>4?', ...':''}. Select the .gltf together with its .bin and texture files.`);
    }
    const loader=new GLTFLoader(manager);loader.setMeshoptDecoder(MeshoptDecoder);
    const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;
    const gltf=await new Promise<{scene:THREE.Group;animations:unknown[]}>((resolve,reject)=>loader.parse(header.format==='glb'?buffer:new TextDecoder().decode(bytes),'',g=>resolve(g as never),e=>reject(e instanceof Error?e:new Error(String((e as {message?:string})?.message??e)))));
    return{gltf,header,size:bytes.byteLength,notice,unitHint};
   }finally{for(const u of tmpUrls)setTimeout(()=>URL.revokeObjectURL(u),30_000);for(const u of urls.values())setTimeout(()=>URL.revokeObjectURL(u),30_000);}
  };
  // Transform gizmo: one undo step per drag.
  const gizmo=new TransformControls(camera,renderer.domElement);const gizmoHelper=gizmo.getHelper();scene.add(gizmoHelper);
  let dragBefore:{id:number;p:THREE.Vector3;r:THREE.Euler;s:THREE.Vector3}|null=null;let justDragged=false;
  gizmo.setMode(getStudio3DState().gizmo);
  gizmo.addEventListener('change',invalidate);
  gizmo.addEventListener('dragging-changed',e=>{
   const on=!!(e as unknown as {value:boolean}).value;controls.enabled=!on;
   const o=gizmo.object;
   if(on&&o)dragBefore={id:o.id,p:o.position.clone(),r:o.rotation.clone(),s:o.scale.clone()};
   if(!on){justDragged=true;const b=dragBefore;dragBefore=null;if(b&&stage.find(b.id))stage.commitTransform(b.id,{p:b.p,r:b.r,s:b.s});}
  });
  gizmo.addEventListener('objectChange',()=>{const id=getStudio3DState().selected;if(id!=null)patchStudio3D({selectedInfo:stage.info(id)});drawSelection();});
  const syncGizmo=()=>{const id=getStudio3DState().selected;const o=id==null?null:stage.find(id);if(o)gizmo.attach(o);else gizmo.detach();};
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
   const o=stage.find(id);if(!o)return;const sn=getStudio3DState().snap;
   const axis=(k:'x'|'y'|'z')=>d[k]===undefined?{}:{[k]:sn.on?snapTo(o.position[k]+d[k]!,sn.move):o.position[k]+d[k]!};
   stage.setTransform(id,{position:{...axis('x'),...axis('y'),...axis('z')}},{group:'nudge'});
  };
  let opening=0;
  const guard=(what:'open'|'new',files:File[],force:boolean|undefined,run:()=>void|Promise<void>)=>{
   if(!force&&stage.dirty){patchStudio3D({confirmReplace:{what,files}});return false;}
   patchStudio3D({confirmReplace:null});void run();return true;
  };
  const openNow=async(files:File[])=>{
   const primary=files.find(f=>modelFormatFor(f.name));const ticket=++opening;
   if(!primary){patchStudio3D({status:'error',error:'Choose a .glb, .gltf, .obj, .stl or .ply file.'});return;}
   patchStudio3D({status:'loading',name:primary.name,error:'',blank:false});
   try{
    const {gltf,header,size,notice,unitHint}=await loadParsed(primary,files.filter(f=>f!==primary));
    if(ticket!==opening||disposed){gltf.scene.traverse(o=>{(o as THREE.Mesh).geometry?.dispose?.();});return;}
    animationCount=gltf.animations.length;selectionReset();
    stage.load(gltf.scene);
    patchStudio3D({status:'ready',name:primary.name,error:'',format:header.format.toUpperCase(),bytes:size,blank:false,confirmReplace:null,notice,unitHint});loadUnit();
    frameAll();
   }catch(e){
    if(ticket!==opening)return;
    patchStudio3D({status:'error',error:e instanceof Error?e.message:String(e),blank:false});
   }
  };
  const selectionReset=()=>{patchStudio3D({selected:null,selectedInfo:null,marked:[],notice:'',unitHint:null});};
  const openFiles=async(files:File[],force?:boolean)=>{guard('open',files,force,()=>openNow(files));};
  const newScene=(force?:boolean)=>{guard('new',[],force,()=>{opening++;animationCount=0;selectionReset();stage.clear();resetStudio3D({status:'ready',blank:true,name:''});sync();frameAll();});};
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
  const projectName=()=>{try{return getAppState().projectName||'';}catch{return '';}};
  const loadUnit=()=>{try{patchStudio3D({unit:readProjectUnit(localStorage,projectName())});}catch{/* keep current */}};
  loadUnit();
  const setUnit=(u:unknown)=>{if(!isUnit(u))throw Object.assign(new Error('Unit must be m, cm, mm or in.'),{expected:true});patchStudio3D({unit:u});try{writeProjectUnit(localStorage,projectName(),u);}catch{/* session only */}};
  const exportGlb=async()=>{
   if(!holder.children.length)throw Object.assign(new Error('There is nothing to export. Open a model first.'),{expected:true});
   const result=await new GLTFExporter().parseAsync(holder.children.length===1?holder.children[0]:holder,{binary:true});
   download(new Blob([result as ArrayBuffer],{type:'model/gltf-binary'}),`${stem(getStudio3DState().name||'scene')}.glb`);
   stage.markSaved();
  };
  const off=registerStudio3DController({
   exportMesh,renderTurntable,cancelRender:()=>{cancelFlag=true;},setUnit,openFiles,newScene,resetView:frameAll,frameSelection,select,renderStill,exportGlb,
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
   if(!marquee){marquee=document.createElement('div');marquee.style.cssText='position:fixed;pointer-events:none;border:1px dashed #6d4aff;background:rgba(109,74,255,0.12);z-index:50';marquee.setAttribute('aria-hidden','true');document.body.appendChild(marquee);}
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
    if((e.key==='Delete'||e.key==='Backspace')&&sel!=null){stage.remove(sel);e.preventDefault();return;}
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
   disposed=true;opening++;off();cancelAnimationFrame(frame);ro.disconnect();controls.dispose();
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
  {s.status==='loading'&&<p role="status" className="pointer-events-none absolute left-4 top-3 m-0 rounded-md bg-surface px-2 py-1 text-xs text-ink-2">{t('studio3d.status.loading',{name:s.name})}</p>}
  {s.status==='error'&&<p role="alert" className="absolute left-4 top-3 m-0 max-w-[80%] rounded-md bg-surface px-2 py-1 text-xs text-ink">{t('studio3d.status.error')}: {s.error}</p>}
  <p className="sr-only">{t('studio3d.keys.hint')}</p>
 </div>;
}
