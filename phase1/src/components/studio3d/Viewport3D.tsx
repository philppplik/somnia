import {useEffect,useRef} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {useT} from '../../lib/useT';
import {
 modelFormatFor,readModelHeader,externalResources,ModelError,emptyBounds,boundsValid,boundsCenter,boundsRadius,frameDistance,clipPlanes,emptyStats,
 type ModelStats,type OutlineEntry,type Bounds,
} from '../../lib/studio3d/model';
import {registerStudio3DController} from '../../lib/studio3d/commands';
import {patchStudio3D,resetStudio3D,getStudio3DState,useStudio3D} from '../../lib/studio3d/session';

const DEFAULT_DIR=new THREE.Vector3(1,0.75,1).normalize();
const base=(name:string)=>name.replace(/^.*[\\/]/,'');
const download=(blob:Blob,name:string)=>{const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
const stem=(name:string)=>base(name).replace(/\.[^.]+$/,'')||'scene';
function disposeTree(root:THREE.Object3D){
 root.traverse(o=>{
  const m=o as THREE.Mesh;if(m.geometry)m.geometry.dispose();
  const mats=Array.isArray(m.material)?m.material:m.material?[m.material]:[];
  for(const mat of mats){for(const v of Object.values(mat as unknown as Record<string,unknown>))if(v instanceof THREE.Texture)v.dispose();mat.dispose();}
 });
}
function measure(root:THREE.Object3D,animations:number):{stats:ModelStats;outline:OutlineEntry[];bounds:Bounds|null;ids:Map<number,THREE.Object3D>}{
 const stats=emptyStats();stats.animations=animations;const outline:OutlineEntry[]=[];const ids=new Map<number,THREE.Object3D>();
 const mats=new Set<THREE.Material>(),texs=new Set<THREE.Texture>();
 const walk=(o:THREE.Object3D,depth:number)=>{
  const mesh=o as THREE.Mesh;const kind:OutlineEntry['kind']=mesh.isMesh?'mesh':(o as THREE.Light).isLight?'light':(o as THREE.Camera).isCamera?'camera':'group';
  if(depth>0){stats.nodes++;outline.push({id:o.id,name:o.name||`${kind} ${o.id}`,depth:depth-1,kind});ids.set(o.id,o);}
  if(kind==='camera')stats.cameras++;
  if(mesh.isMesh&&mesh.geometry){
   stats.meshes++;const pos=mesh.geometry.getAttribute('position');const count=pos?pos.count:0;const index=mesh.geometry.getIndex();
   stats.vertices+=count;stats.triangles+=Math.floor((index?index.count:count)/3);
   const list=Array.isArray(mesh.material)?mesh.material:[mesh.material];stats.draws+=Math.max(1,list.length);
   for(const mat of list){if(!mat)continue;mats.add(mat);for(const v of Object.values(mat as unknown as Record<string,unknown>))if(v instanceof THREE.Texture)texs.add(v);}
  }
  for(const c of o.children)walk(c,depth+1);
 };
 walk(root,0);stats.materials=mats.size;stats.textures=texs.size;
 const box=new THREE.Box3().setFromObject(root);
 const bounds:Bounds|null=box.isEmpty()?null:{min:box.min.toArray() as [number,number,number],max:box.max.toArray() as [number,number,number]};
 return{stats,outline,bounds,ids};
}
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
  const pmrem=new THREE.PMREMGenerator(renderer);const envTarget=pmrem.fromScene(new RoomEnvironment(),0.04);scene.environment=envTarget.texture;
  const camera=new THREE.PerspectiveCamera(45,1,0.01,1000);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;
  const grid=new THREE.GridHelper(20,20,0x8a8f9c,0xc3c7d0);grid.visible=getStudio3DState().grid;scene.add(grid);
  const holder=new THREE.Group();holder.name='model';scene.add(holder);
  let ids=new Map<number,THREE.Object3D>();let selection:THREE.Box3Helper|null=null;let bounds:Bounds|null=null;let disposed=false;let frame=0;
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
   if(bounds&&boundsValid(bounds)){const c=boundsCenter(bounds);place(DEFAULT_DIR,new THREE.Vector3(...c),Math.max(boundsRadius(bounds),1e-4));}
   else place(DEFAULT_DIR,new THREE.Vector3(0,0,0),5);
  };
  const clearSelection=()=>{if(selection){scene.remove(selection);selection.dispose();selection=null;}};
  const clearModel=()=>{clearSelection();for(const c of [...holder.children]){holder.remove(c);disposeTree(c);}ids=new Map();bounds=null;};
  const applyWire=(on:boolean)=>holder.traverse(o=>{const m=o as THREE.Mesh;if(!m.isMesh)return;for(const mat of Array.isArray(m.material)?m.material:[m.material])(mat as THREE.MeshBasicMaterial).wireframe=on;});
  const select=(id:number|null)=>{
   clearSelection();const obj=id==null?null:ids.get(id)??null;
   if(!obj){patchStudio3D({selected:null});invalidate();return;}
   const box=new THREE.Box3().setFromObject(obj);if(!box.isEmpty()){selection=new THREE.Box3Helper(box,0x6d4aff);scene.add(selection);}
   patchStudio3D({selected:obj.id});invalidate();
  };
  const frameSelection=()=>{
   const id=getStudio3DState().selected;const obj=id==null?null:ids.get(id);if(!obj)return frameAll();
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
  let opening=0;
  const openFiles=async(files:File[])=>{
   const primary=files.find(f=>modelFormatFor(f.name));const ticket=++opening;
   if(!primary){patchStudio3D({status:'error',error:'Choose a .glb or .gltf file.'});return;}
   patchStudio3D({status:'loading',name:primary.name,error:'',blank:false});
   try{
    const {gltf,header,size}=await loadParsed(primary,files.filter(f=>f!==primary));
    if(ticket!==opening||disposed){disposeTree(gltf.scene);return;}
    clearModel();holder.add(gltf.scene);const m=measure(holder,gltf.animations.length);ids=m.ids;bounds=m.bounds;
    // measure() walks `holder`, so the model root counts as depth 0 and its children start the outline.
    applyWire(getStudio3DState().wireframe);
    patchStudio3D({status:'ready',name:primary.name,error:'',stats:m.stats,outline:m.outline,bounds:m.bounds,selected:null,format:header.format.toUpperCase(),bytes:size,blank:false});
    frameAll();
   }catch(e){
    if(ticket!==opening)return;
    const msg=e instanceof Error?e.message:String(e);
    patchStudio3D({status:'error',error:msg,blank:false});
   }
  };
  const newScene=()=>{opening++;clearModel();resetStudio3D({status:'ready',blank:true,name:''});frameAll();};
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
  };
  const off=registerStudio3DController({
   openFiles,newScene,resetView:frameAll,frameSelection,select,renderStill,exportGlb,
   setGrid:on=>{grid.visible=on;patchStudio3D({grid:on});invalidate();},
   setWireframe:on=>{applyWire(on);patchStudio3D({wireframe:on});invalidate();},
  });
  // Pick by click (no drag) and keyboard orbit/zoom.
  let down:{x:number;y:number}|null=null;const ray=new THREE.Raycaster();
  const onDown=(e:PointerEvent)=>{down={x:e.clientX,y:e.clientY};};
  const onUp=(e:PointerEvent)=>{
   if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>4){down=null;return;}down=null;
   const r=renderer.domElement.getBoundingClientRect();ray.setFromCamera(new THREE.Vector2(((e.clientX-r.left)/r.width)*2-1,-(((e.clientY-r.top)/r.height)*2-1)),camera);
   const hit=ray.intersectObject(holder,true).find(h=>(h.object as THREE.Mesh).isMesh);
   const target=hit?.object??null;select(target&&ids.has(target.id)?target.id:null);
  };
  const onKey=(e:KeyboardEvent)=>{
   const off=camera.position.clone().sub(controls.target);const sph=new THREE.Spherical().setFromVector3(off);const step=Math.PI/36;let used=true;
   if(e.key==='ArrowLeft')sph.theta-=step;else if(e.key==='ArrowRight')sph.theta+=step;
   else if(e.key==='ArrowUp')sph.phi=Math.max(0.05,sph.phi-step);else if(e.key==='ArrowDown')sph.phi=Math.min(Math.PI-0.05,sph.phi+step);
   else if(e.key==='+'||e.key==='=')sph.radius*=0.9;else if(e.key==='-')sph.radius/=0.9;
   else if(e.key==='Home')frameAll();else used=false;
   if(!used)return;e.preventDefault();
   if(e.key!=='Home'){sph.radius=Math.min(Math.max(sph.radius,controls.minDistance||1e-3),controls.maxDistance||Infinity);camera.position.copy(controls.target).add(off.setFromSpherical(sph));camera.lookAt(controls.target);controls.update();invalidate();}
  };
  const cv=renderer.domElement;cv.addEventListener('pointerdown',onDown);cv.addEventListener('pointerup',onUp);cv.addEventListener('keydown',onKey);
  frameAll();
  return()=>{
   disposed=true;opening++;off();cancelAnimationFrame(frame);ro.disconnect();controls.dispose();
   cv.removeEventListener('pointerdown',onDown);cv.removeEventListener('pointerup',onUp);cv.removeEventListener('keydown',onKey);
   clearModel();grid.geometry.dispose();(grid.material as THREE.Material).dispose();envTarget.dispose();pmrem.dispose();renderer.dispose();renderer.forceContextLoss();
   if(cv.parentNode===el)el.removeChild(cv);
   resetStudio3D();
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
