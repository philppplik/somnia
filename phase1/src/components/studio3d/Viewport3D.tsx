import {useEffect,useRef} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import {PLYLoader} from 'three/addons/loaders/PLYLoader.js';
import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {RGBELoader} from 'three/addons/loaders/RGBELoader.js';
import {EXRLoader} from 'three/addons/loaders/EXRLoader.js';
import {Sky} from 'three/addons/objects/Sky.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {useT} from '../../lib/useT';
import {isMeshFormat,mergeEnv,envFormatFor,nudgeFor,EnvError,modelFormatFor,readModelHeader,externalResources,ModelError,boundsValid,boundsCenter,boundsRadius,frameDistance,clipPlanes} from '../../lib/studio3d/model';
import type {Bounds} from '../../lib/studio3d/model';
import {Stage} from '../../lib/studio3d/stage';
import {registerStudio3DController} from '../../lib/studio3d/commands';
import {patchStudio3D,resetStudio3D,getStudio3DState,useStudio3D} from '../../lib/studio3d/session';

const DEFAULT_DIR=new THREE.Vector3(1,0.75,1).normalize();
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
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;
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
  const clearSelection=()=>{if(selection){scene.remove(selection);selection.dispose();selection=null;}};
  const clearModel=()=>{clearSelection();stage.clear();bounds=null;};
  const applyWire=(on:boolean)=>holder.traverse(o=>{const m=o as THREE.Mesh;if(!m.isMesh)return;for(const mat of Array.isArray(m.material)?m.material:[m.material])(mat as THREE.MeshBasicMaterial).wireframe=on;});
  const drawSelection=()=>{
   clearSelection();const id=getStudio3DState().selected;const obj=id==null?null:stage.find(id);
   if(obj){const box=new THREE.Box3().setFromObject(obj);if(!box.isEmpty()){selection=new THREE.Box3Helper(box,0x6d4aff);scene.add(selection);}}
  };
  const select=(id:number|null)=>{patchStudio3D({selected:id!=null&&stage.find(id)?id:null});sync();};
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
      const group=new OBJLoader().parse(new TextDecoder().decode(bytes));
      group.traverse(o=>{const m=o as THREE.Mesh;if(!m.isMesh)return;if(!m.geometry.getAttribute('normal'))m.geometry.computeVertexNormals();m.material=solid();});
      if(!group.children.length)throw new ModelError(`${file.name} contains no geometry.`);
      scene.add(...group.children);
     }
     return{gltf:{scene,animations:[]},header,size:bytes.byteLength};
    }
    if(header.format==='gltf'){
     const missing=externalResources(header.json).filter(r=>!urls.has(base(decodeURIComponent(r)).toLowerCase()));
     if(missing.length)throw new ModelError(`${file.name} refers to files that were not selected: ${missing.slice(0,4).join(', ')}${missing.length>4?', ...':''}. Select the .gltf together with its .bin and texture files.`);
    }
    const loader=new GLTFLoader(manager);loader.setMeshoptDecoder(MeshoptDecoder);
    const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;
    const gltf=await new Promise<{scene:THREE.Group;animations:unknown[]}>((resolve,reject)=>loader.parse(header.format==='glb'?buffer:new TextDecoder().decode(bytes),'',g=>resolve(g as never),e=>reject(e instanceof Error?e:new Error(String((e as {message?:string})?.message??e)))));
    return{gltf,header,size:bytes.byteLength};
   }finally{for(const u of urls.values())setTimeout(()=>URL.revokeObjectURL(u),30_000);}
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
    const {gltf,header,size}=await loadParsed(primary,files.filter(f=>f!==primary));
    if(ticket!==opening||disposed){gltf.scene.traverse(o=>{(o as THREE.Mesh).geometry?.dispose?.();});return;}
    animationCount=gltf.animations.length;selectionReset();
    stage.load(gltf.scene);
    patchStudio3D({status:'ready',name:primary.name,error:'',format:header.format.toUpperCase(),bytes:size,blank:false,confirmReplace:null});
    frameAll();
   }catch(e){
    if(ticket!==opening)return;
    patchStudio3D({status:'error',error:e instanceof Error?e.message:String(e),blank:false});
   }
  };
  const selectionReset=()=>{patchStudio3D({selected:null,selectedInfo:null});};
  const openFiles=async(files:File[],force?:boolean)=>{guard('open',files,force,()=>openNow(files));};
  const newScene=(force?:boolean)=>{guard('new',[],force,()=>{opening++;animationCount=0;selectionReset();stage.clear();resetStudio3D({status:'ready',blank:true,name:''});sync();frameAll();});};
  const renderStill=async()=>{
   renderer.render(scene,camera);
   const blob=await new Promise<Blob|null>(r=>renderer.domElement.toBlob(r,'image/png'));
   if(!blob)throw new Error('The 3D view could not be captured.');
   download(blob,`${stem(getStudio3DState().name||'scene')}-still.png`);
  };
  const exportGlb=async()=>{
   if(!holder.children.length)throw Object.assign(new Error('There is nothing to export. Open a model first.'),{expected:true});
   const result=await new GLTFExporter().parseAsync(holder.children.length===1?holder.children[0]:holder,{binary:true});
   download(new Blob([result as ArrayBuffer],{type:'model/gltf-binary'}),`${stem(getStudio3DState().name||'scene')}.glb`);
   stage.markSaved();
  };
  const off=registerStudio3DController({
   openFiles,newScene,resetView:frameAll,frameSelection,select,renderStill,exportGlb,
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
   nudge:(id,d)=>{const o=stage.find(id);if(!o)return;stage.setTransform(id,{position:{...(d.x!==undefined?{x:o.position.x+d.x}:{}),...(d.y!==undefined?{y:o.position.y+d.y}:{}),...(d.z!==undefined?{z:o.position.z+d.z}:{})}},{group:'nudge'});},
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
  const onDown=(e:PointerEvent)=>{down=gizmo.axis!==null?null:{x:e.clientX,y:e.clientY};};
  const onUp=(e:PointerEvent)=>{
   if(justDragged){justDragged=false;down=null;return;}
   if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>4){down=null;return;}down=null;
   const r=renderer.domElement.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2(((e.clientX-r.left)/r.width)*2-1,-(((e.clientY-r.top)/r.height)*2-1)),camera);
   const hit=ray.intersectObject(holder,true).find(h=>(h.object as THREE.Mesh).isMesh);
   const target=hit?.object??null;select(target?target.id:null);
  };
  const onKey=(e:KeyboardEvent)=>{
   const sel=getStudio3DState().selected;
   if(!e.ctrlKey&&!e.metaKey&&!e.altKey){
    if(e.key==='w'||e.key==='W'){gizmo.setMode('translate');patchStudio3D({gizmo:'translate'});invalidate();e.preventDefault();return;}
    if(e.key==='e'||e.key==='E'){gizmo.setMode('rotate');patchStudio3D({gizmo:'rotate'});invalidate();e.preventDefault();return;}
    if(e.key==='r'||e.key==='R'){gizmo.setMode('scale');patchStudio3D({gizmo:'scale'});invalidate();e.preventDefault();return;}
    if((e.key==='Delete'||e.key==='Backspace')&&sel!=null){stage.remove(sel);e.preventDefault();return;}
    const n=e.shiftKey&&sel!=null?nudgeFor(e.key):null;
    if(n&&sel!=null){const o=stage.find(sel);if(o){stage.setTransform(sel,{position:{...(n.x!==undefined?{x:o.position.x+n.x}:{}),...(n.y!==undefined?{y:o.position.y+n.y}:{}),...(n.z!==undefined?{z:o.position.z+n.z}:{})}},{group:'nudge'});}e.preventDefault();return;}
   }
   const off=camera.position.clone().sub(controls.target);const sph=new THREE.Spherical().setFromVector3(off);const step=Math.PI/36;let used=true;
   if(e.key==='ArrowLeft')sph.theta-=step;else if(e.key==='ArrowRight')sph.theta+=step;
   else if(e.key==='ArrowUp')sph.phi=Math.max(0.05,sph.phi-step);else if(e.key==='ArrowDown')sph.phi=Math.min(Math.PI-0.05,sph.phi+step);
   else if(e.key==='+'||e.key==='=')sph.radius*=0.9;else if(e.key==='-')sph.radius/=0.9;
   else if(e.key==='Home')frameAll();else used=false;
   if(!used)return;e.preventDefault();
   if(e.key!=='Home'){sph.radius=Math.min(Math.max(sph.radius,controls.minDistance||1e-3),controls.maxDistance||Infinity);camera.position.copy(controls.target).add(off.setFromSpherical(sph));camera.lookAt(controls.target);controls.update();invalidate();}
  };
  const cv=renderer.domElement;cv.addEventListener('pointerdown',onDown);cv.addEventListener('pointerup',onUp);cv.addEventListener('keydown',onKey);
  sync();frameAll();void applyEnv();
  return()=>{
   disposed=true;opening++;off();cancelAnimationFrame(frame);ro.disconnect();controls.dispose();
   cv.removeEventListener('pointerdown',onDown);cv.removeEventListener('pointerup',onUp);cv.removeEventListener('keydown',onKey);
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
