import {StudioStatus} from '../studios/StudioStatus';
import {useEffect,useRef} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {STLLoader} from 'three/addons/loaders/STLLoader.js';
import {PLYLoader} from 'three/addons/loaders/PLYLoader.js';
import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';
import {MTLLoader} from 'three/addons/loaders/MTLLoader.js';
import {RectAreaLightUniformsLib} from 'three/addons/lights/RectAreaLightUniformsLib.js';
import {RectAreaLightHelper} from 'three/addons/helpers/RectAreaLightHelper.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone as skeletonClone} from 'three/addons/utils/SkeletonUtils.js';
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
import {checkPreset,presetPatch,readPresets,removePreset,savePreset,MaterialPresetError,type MaterialPreset} from '../../lib/studio3d/materialPresets';
import type {MaterialSnapshot} from '../../lib/studio3d/stage';
import {ASSET_MIME,parseAssetDrag} from '../../lib/studio3d/assetDrag';
import {toggleSelection,marqueeRect,inRect,turntablePlan,frameName,exportFileName,unitScale,isUnit,isMeshFormat,mergeSnap,snapTo,snapMeasurePoint,measureInfo,formatMeasure,stlUnitHint,mtlReferences,mtlTextures,externalGltfNeeds,clampRenderSize,shadowMapSize,formatPerf,webmMime,MAX_MTL_BYTES,MAX_TEXTURE_BYTES,MAX_TEXTURE_FILES,SnapError,mergeEnv,envFormatFor,isShadowQuality,isShadowType,nudgeFor,EnvError,modelFormatFor,readModelHeader,ModelError,boundsValid,boundsCenter,boundsRadius,frameDistance,clipPlanes,pickClips,extractGltfTextures,GLTF_TEXTURE_MODES} from '../../lib/studio3d/model';
import type {Bounds} from '../../lib/studio3d/model';
import {checkSkins,bonePickRadius,pickBone} from '../../lib/studio3d/skeleton';
import {weightColor} from '../../lib/studio3d/skinning';
import {Stage,beginGroupDrag,applyGroupDrag,collectNodeExtras,applyNodeExtras,exportClone,applyImportOptions,type CameraKind,type GroupDragMember,type TransformSnapshot} from '../../lib/studio3d/stage';
import {parseDocument,buildDocument,sceneBytes,fromBase64,DocumentError} from '../../lib/studio3d/document';
import {registerStudio3DController,registerStudio3DTextureDrop} from '../../lib/studio3d/commands';
import {parseExtras,type ClipMeta} from '../../lib/studio3d/clipMeta';
import {nextViewName,updateView,renameView,viewSlotIndex} from '../../lib/studio3d/views';
import {SHORTCUT_HINTS} from '../../lib/studio3d/shortcuts';
import {X} from 'lucide-react';
import {Button} from '../ui/button';
import {tweenPose,CAMERA_FLY_MS,type CameraPose} from '../../lib/studio3d/cameraTween';
import {easeAt,type Ease} from '../../lib/studio3d/ease';
import type {KeyPath} from '../../lib/studio3d/clips';
import type {KeyRef,KeyData} from '../../lib/studio3d/keyEdit';
import {advance,clampTime,checkClip,checkRange,checkSpeed,startTime,rangeFits,AnimationError,type ClipInfo,type LoopRange} from '../../lib/studio3d/animation';
import {exportBlocker,LIMITS,validateScene} from '../../lib/studio3d/validate';
import {SLOT_CONFIG,DEFAULT_PRESET_EMISSIVE,inspectImage,isTextureSlot,MAX_TEXTURE_FILE_BYTES,MaterialError,type TextureSlot} from '../../lib/studio3d/materials';
import {generateTexture as generateTexturePixels,type TexgenSpec} from '../../lib/studio3d/texgen';
import {viewDirection,orthoHalfHeight,type ViewPreset} from '../../lib/studio3d/viewPresets';
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;RectAreaLightUniformsLib.init();renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.VSMShadowMap; // VSM honours shadow.radius, so the softness slider really works.
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
   else if(preset==='outdoor'){const sc=new THREE.Scene();const sky=new Sky();sky.scale.setScalar(450000);sc.add(sky);const u=sky.material.uniforms;u.turbidity.value=6;u.rayleigh.value=2;u.sunPosition.value.setFromSphericalCoords(1,THREE.MathUtils.degToRad(35),THREE.MathUtils.degToRad(200));const ground=new THREE.Mesh(new THREE.CircleGeometry(400000,32),new THREE.MeshBasicMaterial({color:0x3a4a35}));ground.rotation.x=-Math.PI/2;sc.add(ground);tex=bake(sc);}
   else if(preset==='dark'){const sc=new THREE.Scene();sc.background=new THREE.Color(0x07070a);const top=new THREE.Mesh(new THREE.PlaneGeometry(4,4),new THREE.MeshBasicMaterial({color:0x555560}));top.position.y=3;top.rotation.x=Math.PI/2;sc.add(top);const rim=new THREE.Mesh(new THREE.PlaneGeometry(2,1),new THREE.MeshBasicMaterial({color:0x30364a}));rim.position.set(-3,1,-2);rim.lookAt(0,0,0);sc.add(rim);tex=bake(sc);}
   else if(preset==='neutral'){const sc=new THREE.Scene();sc.background=new THREE.Color(0xd0d3da);tex=bake(sc);}
   else if(preset==='custom'&&customEnv){
    const fmt=envFormatFor(customEnv.name);const url=URL.createObjectURL(new Blob([customEnv.bytes]));
    try{const t=await (fmt==='exr'?new EXRLoader():new RGBELoader()).loadAsync(url);t.mapping=THREE.EquirectangularReflectionMapping;tex=t;envTargets.push({dispose:()=>t.dispose()} as THREE.WebGLRenderTarget);}
    finally{URL.revokeObjectURL(url);}
   }
   if(tex)envCache.set(preset,tex);return tex;
  };
  let envTicket=0;
  const bgCache=new Map<string,THREE.Texture>();
  const gradientBackground=(top:string,bottom:string)=>{
   const key=top+'|'+bottom;const hit=bgCache.get(key);if(hit)return hit;
   const cv=document.createElement('canvas');cv.width=1;cv.height=256;
   const ctx=cv.getContext('2d')!;const g=ctx.createLinearGradient(0,0,0,256);g.addColorStop(0,top);g.addColorStop(1,bottom);ctx.fillStyle=g;ctx.fillRect(0,0,1,256);
   const t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;bgCache.set(key,t);return t;
  };
  const applyEnv=async()=>{
   const e=getStudio3DState().env;const ticket=++envTicket;
   let tex:THREE.Texture|null=null;
   try{tex=await presetTexture(e.preset);}catch(err){if(ticket===envTicket)patchStudio3D({env:{...e,preset:'studio'},error:err instanceof Error?err.message:String(err)});return;}
   if(ticket!==envTicket||disposed)return;
   scene.environment=tex;scene.environmentIntensity=e.intensity;scene.environmentRotation.set(0,THREE.MathUtils.degToRad(e.rotation),0);
   scene.backgroundIntensity=e.intensity;scene.backgroundRotation.set(0,THREE.MathUtils.degToRad(e.rotation),0);
   scene.background=e.bg==='env'&&tex?tex:e.bg==='color'?new THREE.Color(e.bgColor):e.bg==='gradient'?gradientBackground(e.bgColor,e.bgColor2):new THREE.Color(0xe9ebf0);invalidate();
  };
  /** The viewport keeps one camera per projection and swaps the active one; the pose is copied across on a switch. The perspective fov is the view state's viewFov. */
  const perspCam=new THREE.PerspectiveCamera(45,1,0.01,1000);
  const orthoCam=new THREE.OrthographicCamera(-1,1,1,-1,0.01,1000);
  let camera:THREE.PerspectiveCamera|THREE.OrthographicCamera=perspCam;
  const controls=new OrbitControls<THREE.PerspectiveCamera|THREE.OrthographicCamera>(camera,renderer.domElement);controls.enableDamping=false;
  const grid=new THREE.GridHelper(20,20,0x8a8f9c,0xc3c7d0);grid.visible=getStudio3DState().grid;scene.add(grid);
  const stage=sharedStage??(sharedStage=new Stage());const holder=stage.root;scene.add(holder);
  const previewCache=new Map<string,string>();
  let selection:THREE.Box3Helper|null=null;let bounds:Bounds|null=null;let disposed=false;let frame=0;
  /** Ambient occlusion: a composer chain (render + GTAO + output) replaces the direct render while on. Preview only - stills, turntables and exports keep the plain renderer. */
  let composer:EffectComposer|null=null;let renderPass:RenderPass|null=null;let gtaoPass:GTAOPass|null=null;
  let perfFrames=0,perfLast=0;
  /** Live overlay numbers, published at most once a second while the overlay is on. */
  const samplePerf=()=>{
   if(!getStudio3DState().perf)return;
   perfFrames++;const now=performance.now();if(!perfLast){perfLast=now;return;}
   const dt=now-perfLast;if(dt<1000)return;
   patchStudio3D({perf:{fps:Math.round(perfFrames*1000/dt),calls:renderer.info.render.calls,tris:renderer.info.render.triangles}});perfFrames=0;perfLast=now;
  };
  /** CSS overlay: one small label per annotation pin with text, projected to screen space each frame. */
  const pinLabelHost=document.createElement('div');
  pinLabelHost.className='pointer-events-none absolute inset-0 overflow-hidden';
  pinLabelHost.setAttribute('aria-hidden','true');
  el.append(pinLabelHost);
  const pinLabels=new Map<number,HTMLDivElement>();
  const pinLabelPos=new THREE.Vector3();
  const updatePinLabels=()=>{
   const seen=new Set<number>();const w=el.clientWidth,h=el.clientHeight;
   for(const p of stage.pins()){
    seen.add(p.id);
    let lbl=pinLabels.get(p.id);
    if(!lbl){
     lbl=document.createElement('div');
     lbl.className='absolute max-w-[160px] truncate rounded-md border border-subtle bg-surface px-1.5 py-0.5 text-xs text-ink';
     lbl.style.transform='translate(-50%,calc(-100% - 8px))';
     lbl.setAttribute('data-pin-label',String(p.id));
     pinLabelHost.append(lbl);pinLabels.set(p.id,lbl);
    }
    if(lbl.textContent!==p.text)lbl.textContent=p.text;
    pinLabelPos.set(p.position.x,p.position.y,p.position.z).project(camera);
    if(pinLabelPos.z>1){lbl.style.display='none';continue;}
    lbl.style.display='';
    lbl.style.left=((pinLabelPos.x*0.5+0.5)*w)+'px';
    lbl.style.top=((-pinLabelPos.y*0.5+0.5)*h)+'px';
   }
   for(const [id,lbl] of pinLabels){if(!seen.has(id)){lbl.remove();pinLabels.delete(id);}}
  };
  const renderFrame=()=>{
   updatePinLabels();
   const ao=getStudio3DState().ao;
   if(!ao.on){renderer.render(scene,camera);samplePerf();return;}
   if(!composer){
    const w=Math.max(1,el.clientWidth),h=Math.max(1,el.clientHeight);
    composer=new EffectComposer(renderer);composer.setSize(w,h);
    renderPass=new RenderPass(scene,camera);composer.addPass(renderPass);
    gtaoPass=new GTAOPass(scene,camera,w,h);composer.addPass(gtaoPass);
    composer.addPass(new OutputPass());
   }
   renderPass!.camera=camera;gtaoPass!.camera=camera;gtaoPass!.blendIntensity=ao.strength;
   composer.render();
   samplePerf();
  };
  const invalidate=()=>{if(frame||disposed)return;frame=requestAnimationFrame(()=>{frame=0;if(!disposed)renderFrame();});};
  controls.addEventListener('change',invalidate);
  const resize=()=>{const w=Math.max(1,el.clientWidth),h=Math.max(1,el.clientHeight);renderer.setSize(w,h,false);const a=w/h;perspCam.aspect=a;perspCam.updateProjectionMatrix();orthoCam.left=-orthoCam.top*a;orthoCam.right=orthoCam.top*a;orthoCam.updateProjectionMatrix();composer?.setSize(w,h);invalidate();};
  const ro=new ResizeObserver(resize);ro.observe(el);resize();
  /** Smooth camera flights between poses. Reduced-motion users and the orthographic projection get instant jumps. */
  let flyRaf=0;
  const cancelFly=()=>{if(flyRaf){cancelAnimationFrame(flyRaf);flyRaf=0;}};
  const reducedMotion=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  const setPose=(p:CameraPose)=>{camera.position.set(...p.position);controls.target.set(...p.target);camera.updateMatrixWorld(true);controls.update();};
  const flyTo=(to:CameraPose,prepare?:()=>void)=>{
   cancelFly();
   prepare?.();
   if(reducedMotion()||(camera as THREE.OrthographicCamera).isOrthographicCamera){setPose(to);invalidate();return;}
   const from:CameraPose={position:[camera.position.x,camera.position.y,camera.position.z],target:[controls.target.x,controls.target.y,controls.target.z]};
   const start=performance.now();
   const step=()=>{
    if(disposed){flyRaf=0;return;}
    const u=Math.min(1,(performance.now()-start)/CAMERA_FLY_MS);
    setPose(tweenPose(from,to,easeAt('easeInOut',u)));
    renderFrame();
    flyRaf=u<1?requestAnimationFrame(step):0;
   };
   flyRaf=requestAnimationFrame(step);
  };
  controls.addEventListener('start',cancelFly);
  const place=(dir:THREE.Vector3,center:THREE.Vector3,radius:number)=>{
   const d=frameDistance(radius,perspCam.fov,perspCam.aspect);const {near,far}=clipPlanes(d,radius);
   camera.near=near;camera.far=far;camera.position.copy(center).addScaledVector(dir,d);
   if((camera as THREE.OrthographicCamera).isOrthographicCamera){const halfH=Math.max(radius*1.25,1e-4),a=perspCam.aspect||1;orthoCam.top=halfH;orthoCam.bottom=-halfH;orthoCam.left=-halfH*a;orthoCam.right=halfH*a;orthoCam.zoom=1;}
   cancelFly();
   camera.updateProjectionMatrix();
   controls.target.copy(center);controls.minDistance=radius*0.05;controls.maxDistance=d*20;controls.update();invalidate();
  };
  const frameAll=()=>{
   if(perspCam.fov!==45){perspCam.fov=45;perspCam.updateProjectionMatrix();}
   if(getStudio3DState().viewFov!==45)patchStudio3D({viewFov:45});
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
   if(obj){const box=new THREE.Box3().setFromObject(obj);
   if(box.isEmpty()&&(obj as THREE.Bone).isBone){const p=obj.getWorldPosition(new THREE.Vector3());const r=bounds&&boundsValid(bounds)?boundsRadius(bounds):1;const half=Math.max(0.02,r*0.03);box.setFromCenterAndSize(p,new THREE.Vector3(half*2,half*2,half*2));}
   if(!box.isEmpty()){selection=new THREE.Box3Helper(box,0x6d4aff);scene.add(selection);}}
   for(const m of getStudio3DState().marked){if(m===id)continue;const o=stage.find(m);if(!o)continue;const b=new THREE.Box3().setFromObject(o);if(!b.isEmpty())marks.add(new THREE.Box3Helper(b,0xa28bff));}
  };
  const select=(id:number|null)=>{patchStudio3D({selected:id!=null&&stage.find(id)?id:null,marked:[]});sync();};
  const applySet=(marked:number[],selected:number|null)=>{const live=marked.filter(m=>stage.find(m));patchStudio3D({marked:live,selected:selected!=null&&stage.find(selected)?selected:null});sync();};
  const patchEdit=()=>{const ed=getStudio3DState().edit;if(!ed)return;const sel=stage.editSelection();patchStudio3D({edit:{...ed,verts:sel.verts.length,edges:sel.edges.length,faces:sel.faces.length}});};
  const afterEditOp=()=>{patchEdit();const ed=getStudio3DState().edit;if(ed!=null)patchStudio3D({selectedInfo:stage.info(ed.id)});sync();invalidate();};
  let mixer:THREE.AnimationMixer|null=null;let mixerRev=-1;let animRaf=0;let lastTick=0;let lastPublish=0;let state_time=0;
  function clipInfos():ClipInfo[]{return stage.clips.map((c,i)=>({name:c.name||`Clip ${i+1}`,duration:c.duration}));}
  function stopAnim(){if(animRaf)cancelAnimationFrame(animRaf);animRaf=0;}
  const syncHooks:(()=>void)[]=[];
  /** Pushes the stage into the session: outline, stats, selection info and undo state. */
  const sync=()=>{
   const m=stage.measure();bounds=m.bounds;
   const sel=getStudio3DState().selected;const info=sel==null?null:stage.info(sel);
   const infos=clipInfos();const an=getStudio3DState().anim;const keys=sel==null||!infos[an.clip]?[]:stage.keysOf(an.clip,sel);
   if(an.clip>=infos.length&&an.clip>0){stopAnim();patchStudio3D({anim:{clip:0,playing:false,time:0,loop:true,speed:1,range:null}});}
   const head=sel==null?null:stage.ikChainHead(sel);const ik=head?{...stage.ikState(head.id)!,root:head.id}:null;
   const fhead=sel==null?null:stage.fabrikChainHead(sel);const fabrik=fhead?{...stage.fabrikState(fhead.id)!,root:fhead.id}:null;
   patchStudio3D({clips:infos,clipKeys:keys,stats:m.stats,outline:m.outline,materialList:stage.materialUsage(),bones:stage.bones(),bounds:m.bounds,selected:info?sel:null,selectedInfo:info,poses:sel==null?[]:stage.poseList(sel),ik,fabrik,rigs:stage.bones().filter(b=>b.depth===0).map(b=>({id:b.id,name:b.name})),boneLimits:sel==null?null:stage.boneLimitsOf(sel),uvView:sel==null?null:stage.uvLayout(sel),dirty:stage.dirty,canUndo:stage.canUndo,canRedo:stage.canRedo,undoLabel:stage.undoLabel,history:stage.historyLabels()});
   syncIk();syncFabrik();syncOnion();syncMotionPath();
   drawSelection();applyWire(getStudio3DState().wireframe);applyShadowQuality();syncSkeleton();syncWeightPreview();syncMaskOverlay();syncUvChecker();syncSeams();for(const h of syncHooks)h();updatePinLabels();invalidate();
  };
  /** Turntable preview: the orbit controls auto-rotate while a rAF loop renders. View only - it never touches the stage, documents or exports. */
  let previewRaf=0;
  const stopPreview=()=>{cancelFly();if(previewRaf){cancelAnimationFrame(previewRaf);previewRaf=0;}controls.autoRotate=false;if(getStudio3DState().turntable)patchStudio3D({turntable:false});};
  const setTurntable=(on:boolean):boolean=>{
   if(on){
    if(previewRaf)return true;
    controls.autoRotate=true;
    const tick=()=>{if(disposed){previewRaf=0;return;}controls.update();renderFrame();previewRaf=requestAnimationFrame(tick);};
    previewRaf=requestAnimationFrame(tick);
    if(!getStudio3DState().turntable)patchStudio3D({turntable:true});
   }
   else stopPreview();
   return on;
  };
  const offStage=stage.onChange(()=>{if(!disposed)sync();});
  const frameSelection=()=>{
   const id=getStudio3DState().selected;const obj=id==null?null:stage.find(id);if(!obj)return frameAll();
   const box=new THREE.Box3().setFromObject(obj);if(box.isEmpty())return frameAll();
   const c=box.getCenter(new THREE.Vector3()),r=box.getSize(new THREE.Vector3()).length()/2;
   place(camera.position.clone().sub(controls.target).normalize(),c,Math.max(r,1e-4));
  };
  const applyViewByName=(name:string)=>{
   const v=getStudio3DState().views.find(x=>x.name===name);if(!v)throw Object.assign(new Error(`There is no saved view named ${name}.`),{expected:true});
   flyTo({position:v.position,target:v.target});
  };
  const loadParsed=async(file:File,extras:File[])=>{
   const tmpUrls:string[]=[];let notice='';let unitHint:{id:number;factor:number}|null=null;
   const bytes=new Uint8Array(await file.arrayBuffer());const header=readModelHeader(file.name,bytes);
   patchStudio3D({loadPhase:'parse'});
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
     const io={unit:getStudio3DState().importUnit,upAxis:getStudio3DState().importUpAxis};
     applyImportOptions(scene,io);
     // The unit hint only makes sense while no explicit import unit is applied; it measures the post-scale size.
     if(header.format==='stl'&&io.unit==='m'){const sz=new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3());const hint=stlUnitHint([sz.x,sz.y,sz.z]);if(hint)unitHint={id:scene.id,factor:hint.factor};}
     return{gltf:{scene,animations:[]},header,size:bytes.byteLength,notice,unitHint};
    }
    if(header.format==='gltf'||header.format==='glb'){
     checkSkins(file.name,header.json);
     const needs=externalGltfNeeds(header.json,r=>urls.has(base(decodeURIComponent(r)).toLowerCase()));
     if(needs.missing.length)throw new ModelError(`${file.name} refers to files that were not selected: ${needs.missing.slice(0,4).join(', ')}${needs.missing.length>4?', ...':''}. Select the .gltf together with its .bin and texture files.`);
     if(needs.missingTextures.length)notice=`Textures not found: ${needs.missingTextures.slice(0,4).join(', ')}${needs.missingTextures.length>4?', ...':''}. Select them together with the .gltf.`;
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
  // IK: a target and a pole marker, each with its own translate gizmo; visible while a chain has IK on.
  const ikMarker=(color:number)=>{const m=new THREE.Mesh(new THREE.SphereGeometry(0.045,16,12),new THREE.MeshBasicMaterial({color,depthTest:false,transparent:true,opacity:0.9}));m.renderOrder=20;m.name='ik marker';return m;};
  const ikTarget=ikMarker(0x22d3ee),ikPoleM=ikMarker(0xf59e0b);
  const ikGizmo=new TransformControls(camera,renderer.domElement);ikGizmo.setMode('translate');
  const poleGizmo=new TransformControls(camera,renderer.domElement);poleGizmo.setMode('translate');
  const ikHelpers=[ikGizmo.getHelper(),poleGizmo.getHelper()];for(const h of ikHelpers){h.visible=false;scene.add(h);}
  let ikDrag:{root:number;before:ReturnType<Stage['ikBegin']>;kind:'studio3d.hist.ikTarget'|'studio3d.hist.ikPole'}|null=null;
  const ikRoot=():number|null=>getStudio3DState().ik?.root??null;
  const ikDragStart=(kind:'studio3d.hist.ikTarget'|'studio3d.hist.ikPole')=>{const r=ikRoot();if(r==null)return;ikDrag={root:r,before:stage.ikBegin(r),kind};controls.enabled=false;gizmo.enabled=false;};
  const ikDragEnd=()=>{const d=ikDrag;ikDrag=null;controls.enabled=true;gizmo.enabled=true;if(d)stage.ikCommit(d.root,d.before,{key:d.kind});};
  ikGizmo.addEventListener('dragging-changed',e=>{if(!!(e as unknown as {value:boolean}).value)ikDragStart('studio3d.hist.ikTarget');else ikDragEnd();});
  poleGizmo.addEventListener('dragging-changed',e=>{if(!!(e as unknown as {value:boolean}).value)ikDragStart('studio3d.hist.ikPole');else ikDragEnd();});
  ikGizmo.addEventListener('change',()=>{if(ikDrag?.kind==='studio3d.hist.ikTarget'){const r=ikDrag.root;stage.ikDragTarget(r,[ikTarget.position.x,ikTarget.position.y,ikTarget.position.z]);}invalidate();});
  poleGizmo.addEventListener('change',()=>{if(ikDrag?.kind==='studio3d.hist.ikPole'){const r=ikDrag.root;stage.ikDragPole(r,[ikPoleM.position.x,ikPoleM.position.y,ikPoleM.position.z]);}invalidate();});
  /** Shows or hides the IK markers from the session state; their positions follow the chain state. */
  const syncIk=()=>{
   const ik=getStudio3DState().ik;const on=!!ik?.on;
   for(const h of ikHelpers)h.visible=on;
   if(on&&ik){
    if(!ikTarget.parent){scene.add(ikTarget);scene.add(ikPoleM);ikGizmo.attach(ikTarget);poleGizmo.attach(ikPoleM);}
    if(!ikDrag){ikTarget.position.fromArray(ik.target);ikPoleM.position.fromArray(ik.pole);}
   }else if(ikTarget.parent){scene.remove(ikTarget);scene.remove(ikPoleM);ikGizmo.detach();poleGizmo.detach();}
  };
  // FABRIK: a target and a look-at marker for 3+ segment chains, each with its own translate gizmo; visible while a chain has FABRIK on (the look marker only while look-at is on).
  const fkTarget=ikMarker(0x4ade80),fkLook=ikMarker(0xf472b6);fkTarget.name='fabrik target';fkLook.name='fabrik look';
  const fkGizmo=new TransformControls(camera,renderer.domElement);fkGizmo.setMode('translate');
  const lookGizmo=new TransformControls(camera,renderer.domElement);lookGizmo.setMode('translate');
  /** Swaps the active viewport camera between perspective and orthographic, keeping pose, distance and framing. View state only: nothing here is undoable or saved. */
  const applyProjection=(kind:CameraKind)=>{
   const next=kind==='perspective'?perspCam:orthoCam;
   if(camera!==next){
    const dist=Math.max(camera.position.distanceTo(controls.target),1e-3);
    next.position.copy(camera.position);next.quaternion.copy(camera.quaternion);next.near=camera.near;next.far=camera.far;
    if(next===orthoCam){const halfH=orthoHalfHeight(perspCam.fov,dist),a=perspCam.aspect||1;orthoCam.top=halfH;orthoCam.bottom=-halfH;orthoCam.left=-halfH*a;orthoCam.right=halfH*a;orthoCam.zoom=1;}
    next.updateProjectionMatrix();camera=next;controls.object=next;
    for(const g of [gizmo,ikGizmo,poleGizmo,fkGizmo,lookGizmo])g.camera=next;
    controls.update();
   }
   if(getStudio3DState().viewKind!==kind)patchStudio3D({viewKind:kind});
   invalidate();
  };
  const fkHelpers=[fkGizmo.getHelper(),lookGizmo.getHelper()];for(const h of fkHelpers){h.visible=false;scene.add(h);}
  let fkDrag:{root:number;before:ReturnType<Stage['fabrikBegin']>;kind:'studio3d.hist.fabrikTarget'|'studio3d.hist.fabrikLook'}|null=null;
  const fkRoot=():number|null=>getStudio3DState().fabrik?.root??null;
  const fkDragStart=(kind:'studio3d.hist.fabrikTarget'|'studio3d.hist.fabrikLook')=>{const r=fkRoot();if(r==null)return;fkDrag={root:r,before:stage.fabrikBegin(r),kind};controls.enabled=false;gizmo.enabled=false;};
  const fkDragEnd=()=>{const d=fkDrag;fkDrag=null;controls.enabled=true;gizmo.enabled=true;if(d)stage.fabrikCommit(d.root,d.before,{key:d.kind});};
  fkGizmo.addEventListener('dragging-changed',e=>{if(!!(e as unknown as {value:boolean}).value)fkDragStart('studio3d.hist.fabrikTarget');else fkDragEnd();});
  lookGizmo.addEventListener('dragging-changed',e=>{if(!!(e as unknown as {value:boolean}).value)fkDragStart('studio3d.hist.fabrikLook');else fkDragEnd();});
  fkGizmo.addEventListener('change',()=>{if(fkDrag?.kind==='studio3d.hist.fabrikTarget'){const r=fkDrag.root;stage.fabrikDragTarget(r,[fkTarget.position.x,fkTarget.position.y,fkTarget.position.z]);}invalidate();});
  lookGizmo.addEventListener('change',()=>{if(fkDrag?.kind==='studio3d.hist.fabrikLook'){const r=fkDrag.root;stage.fabrikDragLook(r,[fkLook.position.x,fkLook.position.y,fkLook.position.z]);}invalidate();});
  /** Shows or hides the FABRIK markers from the session state; their positions follow the chain state. */
  const syncFabrik=()=>{
   const fk=getStudio3DState().fabrik;const on=!!fk?.on;const lookOn=on&&!!fk?.look.on;
   fkHelpers[0].visible=on;fkHelpers[1].visible=lookOn;
   if(on&&fk){
    if(!fkTarget.parent){scene.add(fkTarget);fkGizmo.attach(fkTarget);}
    if(!fkDrag)fkTarget.position.fromArray(fk.target);
   }else if(fkTarget.parent){scene.remove(fkTarget);fkGizmo.detach();}
   if(lookOn&&fk){
    if(!fkLook.parent){scene.add(fkLook);lookGizmo.attach(fkLook);}
    if(!fkDrag)fkLook.position.fromArray(fk.look.target);
   }else if(fkLook.parent){scene.remove(fkLook);lookGizmo.detach();}
  };
  // Onion skin: tinted ghost clones of every skinned rig at frames around the playhead. Kept out of the stage root so they never export or alter bounds.
  const ghosts=new THREE.Group();ghosts.name='onion skin';scene.add(ghosts);
  let ghostKey='';
  const clearGhosts=()=>{for(const g of[...ghosts.children]){ghosts.remove(g);g.traverse(o=>{const m=o as THREE.Mesh;if(m.isMesh)for(const mat of Array.isArray(m.material)?m.material:[m.material])(mat as THREE.Material).dispose();});}};
  const syncOnion=()=>{
   const st=getStudio3DState();const o=st.onion;const clip=st.clips[st.anim.clip];
   const key=o.on&&clip?`${st.anim.clip}|${Math.round(st.anim.time*24)}|${o.before}|${o.after}|${stage.clipRevision}|${stage.bones().length}`:'';
   if(key===ghostKey)return;ghostKey=key;clearGhosts();
   if(!key||!clip)return;
   const rigs:THREE.Object3D[]=[];
   stage.root.traverse(x=>{const m=x as THREE.SkinnedMesh;if(!m.isSkinnedMesh)return;let top:THREE.Object3D=m;while(top.parent&&top.parent!==stage.root)top=top.parent;if(!rigs.includes(top))rigs.push(top);});
   const step=Math.max(clip.duration/16,1/24);if(!(step>0))return;
   const times:{t:number;before:boolean}[]=[];
   for(let k=1;k<=o.before;k++){const t=st.anim.time-k*step;if(t>=0)times.push({t,before:true});}
   for(let k=1;k<=o.after;k++){const t=st.anim.time+k*step;if(t<=clip.duration)times.push({t,before:false});}
   for(const{t,before}of times){
    const pose=stage.poseAt(st.anim.clip,t);
    for(const rig of rigs){
     const clone=skeletonClone(rig) as THREE.Object3D;
     const srcNodes:THREE.Object3D[]=[],dstNodes:THREE.Object3D[]=[];
     rig.traverse(n=>{srcNodes.push(n);});clone.traverse(n=>{dstNodes.push(n);});
     srcNodes.forEach((n,idx)=>{const c=dstNodes[idx];if(!c)return;const tr=pose.get(n.uuid);if(!tr)return;if(tr.p)c.position.fromArray(tr.p);if(tr.q)c.quaternion.fromArray(tr.q);if(tr.s)c.scale.fromArray(tr.s);});
     clone.traverse(n=>{const mesh=n as THREE.Mesh;if(!mesh.isMesh)return;mesh.material=new THREE.MeshBasicMaterial({color:before?0x38bdf8:0xfb923c,transparent:true,opacity:0.35,depthWrite:false});mesh.renderOrder=15;});
     clone.updateMatrixWorld(true);ghosts.add(clone);
    }
   }
  };
  // Motion path: the selected bone's world positions across the current clip as a polyline. Kept out of the stage root.
  let pathLine:THREE.Line|null=null;let pathKey='';
  const syncMotionPath=()=>{
   const st=getStudio3DState();const clip=st.clips[st.anim.clip];
   const bone=st.selected==null?null:stage.find(st.selected) as THREE.Bone|null;
   const on=!!(st.motionPath&&clip&&bone?.isBone);
   const key=on?`${st.selected}|${st.anim.clip}|${stage.clipRevision}`:'';
   if(key===pathKey)return;pathKey=key;
   if(pathLine){scene.remove(pathLine);pathLine.geometry.dispose();(pathLine.material as THREE.Material).dispose();pathLine=null;}
   if(on&&clip&&bone){
    const pts=stage.motionPathOf(bone.id,st.anim.clip,64).map(p=>new THREE.Vector3(...p));
    pathLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0xc084fc,transparent:true,opacity:0.9}));
    pathLine.renderOrder=16;pathLine.name='motion path';scene.add(pathLine);
   }
  };
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
   const id=getStudio3DState().selected;
   const sn=getStudio3DState().snap;
   if(id!=null&&sn.on&&sn.mode!=='grid'&&getStudio3DState().gizmo==='translate'){
    const o=stage.find(id);
    if(o&&o.parent){o.updateMatrixWorld(true);const w=o.getWorldPosition(new THREE.Vector3());
     const hit=stage.snapPoint({x:w.x,y:w.y,z:w.z},sn.mode,[id],Math.max(sn.move,0.05));
     if(hit){o.position.copy(o.parent.worldToLocal(new THREE.Vector3(hit.x,hit.y,hit.z)));o.updateMatrixWorld(true);drawSelection();invalidate();}}
   }
   if(id!=null)patchStudio3D({selectedInfo:stage.info(id)});drawSelection();syncLightHelper();});
  /** The objects an edit acts on: the multi-selection, or the single selected object. */
  const currentSet=():number[]=>{const st=getStudio3DState();const m=st.marked.filter(x=>stage.find(x));return m.length?m:st.selected!=null&&stage.find(st.selected)?[st.selected]:[];};
  // The transform pivot: the selection centre (default), the world origin, or the 3D cursor.
  const pivotPoint=(box?:THREE.Box3):THREE.Vector3=>{const st=getStudio3DState();
   if(st.pivot==='origin')return new THREE.Vector3();
   if(st.pivot==='cursor')return new THREE.Vector3(st.cursor.x,st.cursor.y,st.cursor.z);
   return box&&!box.isEmpty()?box.getCenter(new THREE.Vector3()):new THREE.Vector3();};
  const syncGizmo=()=>{
   const ids=currentSet();
   if(ids.length>1){
    const box=new THREE.Box3();for(const id of ids)box.expandByObject(stage.find(id)!);
    groupPivot.position.copy(pivotPoint(box));groupPivot.quaternion.identity();groupPivot.scale.set(1,1,1);
    if(!groupPivot.parent)scene.add(groupPivot);groupPivot.updateMatrixWorld(true);gizmo.attach(groupPivot);return;
   }
   const id=getStudio3DState().selected;const o=id==null?null:stage.find(id);
   // Bones rotate only: moving or scaling a joint would break the bind pose, so the gizmo steps back in those modes.
   if(o&&(o as THREE.Bone).isBone&&gizmo.mode!=='rotate'){gizmo.detach();return;}
   // A bone an IK chain drives is posed through the target gizmo, not directly.
   if(o&&(o as THREE.Bone).isBone&&(stage.ikDriven(o.id)||stage.fabrikDriven(o.id))){gizmo.detach();return;}
   // A non-centre pivot rotates and scales a single object about the origin or the cursor, so it rides the group pivot too.
   if(o&&getStudio3DState().pivot!=='center'){
    groupPivot.position.copy(pivotPoint());groupPivot.quaternion.identity();groupPivot.scale.set(1,1,1);
    if(!groupPivot.parent)scene.add(groupPivot);groupPivot.updateMatrixWorld(true);gizmo.attach(groupPivot);return;
   }
   if(o)gizmo.attach(o);else gizmo.detach();
  };
  /** 3D cursor marker: an axes cross in the outer scene, shown while the cursor is the transform pivot. Never exported. */
  const cursorGeo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.15,0,0),new THREE.Vector3(0.15,0,0),new THREE.Vector3(0,-0.15,0),new THREE.Vector3(0,0.15,0),new THREE.Vector3(0,0,-0.15),new THREE.Vector3(0,0,0.15)]);
  const cursorMat=new THREE.LineBasicMaterial({color:0xffaa33});
  const cursorMark=new THREE.LineSegments(cursorGeo,cursorMat);cursorMark.name='3d cursor';scene.add(cursorMark);
  const syncCursorMark=()=>{const st=getStudio3DState();cursorMark.visible=st.pivot==='cursor';cursorMark.position.set(st.cursor.x,st.cursor.y,st.cursor.z);};
  syncCursorMark();
  /** Measure overlay: endpoint dots and a segment line in the outer scene. Ephemeral, never exported and never saved. */
  const measureGroup=new THREE.Group();measureGroup.name='measure';scene.add(measureGroup);
  const mLineGeo=new THREE.BufferGeometry();const mLineMat=new THREE.LineBasicMaterial({color:0x44ccff});
  const mLine=new THREE.Line(mLineGeo,mLineMat);mLine.visible=false;measureGroup.add(mLine);
  const mDotGeo=new THREE.SphereGeometry(0.03,12,8);const mDotMat=new THREE.MeshBasicMaterial({color:0x44ccff});
  const mDotA=new THREE.Mesh(mDotGeo,mDotMat);const mDotB=new THREE.Mesh(mDotGeo,mDotMat);mDotA.visible=false;mDotB.visible=false;measureGroup.add(mDotA,mDotB);
  const syncMeasure=()=>{const m=getStudio3DState().measure;
   mDotA.visible=!!m?.a;if(m?.a)mDotA.position.set(m.a.x,m.a.y,m.a.z);
   mDotB.visible=!!m?.b;if(m?.b)mDotB.position.set(m.b.x,m.b.y,m.b.z);
   mLine.visible=!!(m?.a&&m?.b);
   if(m?.a&&m?.b)mLineGeo.setFromPoints([new THREE.Vector3(m.a.x,m.a.y,m.a.z),new THREE.Vector3(m.b.x,m.b.y,m.b.z)]);
  };
  syncMeasure();
  /** Skeleton overlay: rebuilt when the set of bones changes, shown when the session toggle is on. Kept out of the stage root so it never exports or alters bounds. */
  let skelHelper:THREE.SkeletonHelper|null=null;let skelKey='';
  const syncSkeleton=()=>{
   const list=stage.bones();const key=list.map(b=>b.id).join(',');
   if(key!==skelKey){
    skelKey=key;
    if(painting){painting=false;}const openSel=getStudio3DState().selected;if(openSel!=null)stage.skinPaintEnd(openSel);if(lightHelper){scene.remove(lightHelper);(lightHelper as HelperObj).dispose?.();lightHelper=null;}if(skelHelper){scene.remove(skelHelper);skelHelper.geometry.dispose();(skelHelper.material as THREE.Material).dispose();skelHelper=null;}if(weightOverlay){scene.remove(weightOverlay);weightOverlay.geometry.dispose();(weightOverlay.material as THREE.Material).dispose();weightOverlay=null;}if(maskOverlay){scene.remove(maskOverlay);maskOverlay.geometry.dispose();(maskOverlay.material as THREE.Material).dispose();maskOverlay=null;}
    if(list.length)skelHelper=new THREE.SkeletonHelper(stage.root);
    if(skelHelper)scene.add(skelHelper);
   }
   if(skelHelper)skelHelper.visible=getStudio3DState().skeleton;
  };
  /** Weight preview: an overlay copy of the selected skinned mesh, vertex-coloured by one bone's influence. Lives in the outer scene so exports never see it; rebuilt when the mesh, the bone or the weights change. */
  let weightOverlay:THREE.Mesh|null=null;let weightKey='';
  const syncWeightPreview=()=>{
   const st=getStudio3DState();const mesh=st.selected==null?null:stage.find(st.selected) as THREE.SkinnedMesh|null;
   const ok=!!(mesh&&mesh.isSkinnedMesh&&st.weightPreview!=null&&mesh.skeleton.bones.some(b=>b.id===st.weightPreview));
   const si=ok?mesh!.geometry.getAttribute('skinIndex'):null,sw=ok?mesh!.geometry.getAttribute('skinWeight'):null;
   const key=ok?`${mesh!.id}:${st.weightPreview}`:'';
   if(weightOverlay&&(key!==weightKey||weightOverlay.userData.srcWeight!==sw||weightOverlay.userData.srcIndex!==si)){
    scene.remove(weightOverlay);weightOverlay.geometry.dispose();(weightOverlay.material as THREE.Material).dispose();weightOverlay=null;
   }
   weightKey=key;
   if(ok&&!weightOverlay){
    const boneIdx=mesh!.skeleton.bones.findIndex(b=>b.id===st.weightPreview);
    const pos=mesh!.geometry.getAttribute('position');const colors=new Float32Array(pos.count*3);
    for(let p=0;p<pos.count;p++){let w=0;for(let k=0;k<4;k++)if(si!.getComponent(p,k)===boneIdx)w+=sw!.getComponent(p,k);
     const c=weightColor(w);colors[p*3]=c[0];colors[p*3+1]=c[1];colors[p*3+2]=c[2];}
    const geo=mesh!.geometry.clone();geo.setAttribute('color',new THREE.BufferAttribute(colors,3));
    const mat=new THREE.MeshBasicMaterial({vertexColors:true});mat.polygonOffset=true;mat.polygonOffsetFactor=-2;
    weightOverlay=new THREE.Mesh(geo,mat);weightOverlay.userData={srcIndex:si,srcWeight:sw};
    weightOverlay.position.copy(mesh!.position);weightOverlay.quaternion.copy(mesh!.quaternion);weightOverlay.scale.copy(mesh!.scale);weightOverlay.visible=mesh!.visible;
    scene.add(weightOverlay);
   }
  };
  let maskOverlay:THREE.Mesh|null=null;let maskKey='';let maskVer=-1;
  const syncMaskOverlay=()=>{
   const st=getStudio3DState();const mesh=st.selected==null?null:stage.find(st.selected) as THREE.Mesh|null;
   const attr=mesh&&mesh.isMesh?mesh.geometry.getAttribute('somniaMask') as THREE.BufferAttribute|undefined:undefined;
   const ok=!!(st.sculpt.on&&mesh&&mesh.isMesh&&attr);
   const key=ok?`${mesh!.id}`:'';
   const ver=ok?attr!.version:-1;
   if(maskOverlay&&(key!==maskKey||ver!==maskVer||maskOverlay.userData.srcMask!==attr)){
    scene.remove(maskOverlay);maskOverlay.geometry.dispose();(maskOverlay.material as THREE.Material).dispose();maskOverlay=null;
   }
   maskKey=key;maskVer=ver;
   if(ok&&!maskOverlay){
    const pos=mesh!.geometry.getAttribute('position');const colors=new Float32Array(pos.count*3);
    for(let p=0;p<pos.count;p++){const c=weightColor(Math.min(1,Math.max(0,attr!.getX(p))));colors[p*3]=c[0];colors[p*3+1]=c[1];colors[p*3+2]=c[2];}
    const geo=mesh!.geometry.clone();geo.setAttribute('color',new THREE.BufferAttribute(colors,3));
    const mat=new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:0.85});mat.polygonOffset=true;mat.polygonOffsetFactor=-2;
    maskOverlay=new THREE.Mesh(geo,mat);maskOverlay.userData={srcMask:attr};
    maskOverlay.position.copy(mesh!.position);maskOverlay.quaternion.copy(mesh!.quaternion);maskOverlay.scale.copy(mesh!.scale);maskOverlay.visible=mesh!.visible;
    scene.add(maskOverlay);
   }
   if(maskOverlay&&mesh){maskOverlay.position.copy(mesh.position);maskOverlay.quaternion.copy(mesh.quaternion);maskOverlay.scale.copy(mesh.scale);}
  };
  // UV checker preview: swaps the selected mesh's material map for a checker texture (view state, restored on off).
  let checkerTex:THREE.CanvasTexture|null=null;
  const checkerDone=new Set<THREE.MeshStandardMaterial>();
  const makeChecker=()=>{
   const c=document.createElement('canvas');c.width=c.height=128;
   const ctx=c.getContext('2d')!;const n=8,sq=c.width/n;
   for(let y=0;y<n;y++)for(let x=0;x<n;x++){ctx.fillStyle=(x+y)%2?'rgb(122,122,122)':'rgb(200,200,200)';ctx.fillRect(x*sq,y*sq,sq,sq);}
   const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.NearestFilter;return t;
  };
  const syncUvChecker=()=>{
   const st=getStudio3DState();
   const mesh=st.selected==null?null:stage.find(st.selected) as THREE.Mesh|null;
   const target=st.uvChecker&&mesh&&mesh.isMesh&&!Array.isArray(mesh.material)&&(mesh.material as THREE.MeshStandardMaterial).isMeshStandardMaterial?mesh.material as THREE.MeshStandardMaterial:null;
   for(const m of[...checkerDone])if(m!==target){
    m.map=(m.userData.somniaUvPrevMap as THREE.Texture|null|undefined)??null;delete m.userData.somniaUvPrevMap;m.needsUpdate=true;checkerDone.delete(m);
   }
   if(target&&!checkerDone.has(target)){
    if(!checkerTex)checkerTex=makeChecker();
    target.userData.somniaUvPrevMap=target.map;target.map=checkerTex;target.needsUpdate=true;checkerDone.add(target);
   }
  };
  // UV seam display: amber lines along the marked seam edges of the mesh in edit mode.
  let seamLines:THREE.LineSegments|null=null;let seamKey='';
  const syncSeams=()=>{
   const ed=getStudio3DState().edit;
   const mesh=ed==null?null:stage.find(ed.id) as THREE.Mesh|null;
   const seams=mesh&&mesh.isMesh?stage.seamsOf(mesh):[];
   const ok=!!(mesh&&seams.length);
   const key=ok?`${mesh!.id}:${mesh!.geometry.uuid}:${seams.map(e=>e.join('-')).join('|')}`:'';
   if(seamLines&&key!==seamKey){scene.remove(seamLines);seamLines.geometry.dispose();(seamLines.material as THREE.Material).dispose();seamLines=null;}
   seamKey=key;
   if(ok&&!seamLines){
    const pos=mesh!.geometry.getAttribute('position');
    const pts=new Float32Array(seams.length*6);
    for(let i=0;i<seams.length;i++){
     const[a,b]=seams[i];
     pts[i*6]=pos.getX(a);pts[i*6+1]=pos.getY(a);pts[i*6+2]=pos.getZ(a);
     pts[i*6+3]=pos.getX(b);pts[i*6+4]=pos.getY(b);pts[i*6+5]=pos.getZ(b);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pts,3));
    seamLines=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:0xffb020,depthTest:false,transparent:true,opacity:0.95}));
    seamLines.renderOrder=999;
    scene.add(seamLines);
   }
   if(seamLines&&mesh){seamLines.position.copy(mesh.position);seamLines.quaternion.copy(mesh.quaternion);seamLines.scale.copy(mesh.scale);seamLines.visible=mesh.visible;}
  };
  const helpers=new Map<number,THREE.CameraHelper>();
  const syncCameraHelpers=()=>{
   const live=new Set<number>();
   stage.root.traverse(o=>{const c=o as THREE.PerspectiveCamera;if(!c.isPerspectiveCamera)return;live.add(c.id);let h=helpers.get(c.id);if(!h){h=new THREE.CameraHelper(c);helpers.set(c.id,h);scene.add(h);}c.updateMatrixWorld(true);h.update();});
   for(const [id,h] of helpers)if(!live.has(id)){scene.remove(h);h.dispose();helpers.delete(id);}
  };
  /** Helper for the selected light (directional, point, spot or area). Lives in the outer scene, so exports and bounds never see it. */
  let lightHelper:THREE.Object3D|null=null;let lightHelperId=-1;
  type HelperObj=THREE.Object3D&{update?:()=>void;dispose?:()=>void};
  const syncLightHelper=()=>{
   const id=getStudio3DState().selected;const o=id==null?null:stage.find(id) as THREE.Light|null;
   const ok=!!o&&!!o.isLight&&!(o as THREE.AmbientLight).isAmbientLight&&getStudio3DState().lightHelpers;
   if(lightHelper&&(!ok||lightHelperId!==o!.id)){scene.remove(lightHelper);(lightHelper as HelperObj).dispose?.();lightHelper=null;lightHelperId=-1;}
   if(!ok)return;
   if(!lightHelper){
    if((o as THREE.DirectionalLight).isDirectionalLight)lightHelper=new THREE.DirectionalLightHelper(o as THREE.DirectionalLight,0.6);
    else if((o as THREE.PointLight).isPointLight)lightHelper=new THREE.PointLightHelper(o as THREE.PointLight,0.35);
    else if((o as THREE.SpotLight).isSpotLight)lightHelper=new THREE.SpotLightHelper(o as THREE.SpotLight);
    else if((o as THREE.RectAreaLight).isRectAreaLight)lightHelper=new RectAreaLightHelper(o as THREE.RectAreaLight);
    if(lightHelper){scene.add(lightHelper);lightHelperId=o!.id;}
   }
   (lightHelper as HelperObj|null)?.update?.();
  };
  syncHooks.push(()=>{syncGizmo();syncCameraHelpers();syncLightHelper();});
  /** Applies the shadow quality (off/low/medium/high) and algorithm (VSM/PCF) to the renderer and every shadow-casting light. Runs from sync: it only mutates on change, so new lights pick the quality up as they appear. */
  const applyShadowQuality=()=>{
   const sh=getStudio3DState().shadows;
   const on=sh.quality!=='off';
   const toggled=renderer.shadowMap.enabled!==on;
   if(toggled)renderer.shadowMap.enabled=on;
   const type=sh.type==='vsm'?THREE.VSMShadowMap:THREE.PCFSoftShadowMap;
   const typed=renderer.shadowMap.type!==type;
   if(typed)renderer.shadowMap.type=type;
   let resized=false;
   if(on){const size=shadowMapSize(sh.quality as Exclude<typeof sh.quality,'off'>);
    stage.root.traverse(o=>{const l=o as THREE.DirectionalLight;if(!l.isLight||!l.castShadow||!l.shadow)return;
     if(l.shadow.mapSize.x!==size){l.shadow.mapSize.set(size,size);if(l.shadow.map){l.shadow.map.dispose();l.shadow.map=null;}l.shadow.needsUpdate=true;resized=true;}});}
   if(toggled||typed||resized)stage.root.traverse(o=>{const m=o as THREE.Mesh;if(!m.isMesh)return;for(const mat of Array.isArray(m.material)?m.material:[m.material])(mat as THREE.Material).needsUpdate=true;});
  };
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
  const applySnap=()=>{const sn=getStudio3DState().snap;gizmo.setTranslationSnap(sn.on&&sn.mode==='grid'?sn.move:null);gizmo.setRotationSnap(sn.on?THREE.MathUtils.degToRad(sn.rotate):null);gizmo.setScaleSnap(sn.on?sn.scale:null);invalidate();};
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
   if(!primary){patchStudio3D({status:'error',error:'Choose a .som3d, .glb, .gltf, .obj, .stl or .ply file.'});return;}
   patchStudio3D({status:'loading',name:primary.name,error:'',blank:false,loadPhase:'read',imported:null});
   if(/\.som3d$/i.test(primary.name)){
    try{
     const text=await primary.text();const doc=parseDocument(text);
     const bytes=await sceneBytes(doc,files.filter(f=>f!==primary).map(f=>({name:f.name,bytes:async()=>new Uint8Array(await f.arrayBuffer())})));
     const {gltf}=await loadParsed(new File([bytes as BlobPart],'scene.glb'),[]);
     if(ticket!==opening||disposed)return;
     const nodes=[...gltf.scene.children];const applied=applyNodeExtras(gltf.scene,doc.extras);
     selectionReset();patchStudio3D({loadPhase:'build'});
    await stage.loadMany(nodes,async()=>{await clipsFrom(gltf);});
     if(doc.envMap){customEnv={name:doc.envMap.name,bytes:fromBase64(doc.envMap.data).slice().buffer};envCache.delete('custom');}
     let env=doc.env;let notice=applied.skipped?'Some saved light settings could not be restored.':'';
     if(env.preset==='custom'&&!(customEnv&&customEnv.name===env.customName)){notice=`The scene used the environment map ${env.customName}. Open it again with Open HDR; the studio lighting is used for now.`;env={...env,preset:'studio'};}
     patchStudio3D({status:'ready',name:primary.name,error:'',format:'SOM3D',bytes:primary.size,blank:false,confirmReplace:null,notice,unitHint:null,loadPhase:null,unit:doc.unit,env,snap:doc.snap,views:doc.views});
     applySnap();void applyEnv();
     if(doc.view){perspCam.fov=doc.view.fov;perspCam.updateProjectionMatrix();camera.position.fromArray(doc.view.position);controls.target.fromArray(doc.view.target);camera.updateProjectionMatrix();controls.update();if(getStudio3DState().viewFov!==doc.view.fov)patchStudio3D({viewFov:doc.view.fov});invalidate();}else frameAll();
    }catch(e){
     if(ticket!==opening)return;
     patchStudio3D({status:'error',loadPhase:null,error:e instanceof DocumentError||e instanceof ModelError||e instanceof Error?e.message:String(e),blank:false});
    }
    return;
   }
   try{
    const {gltf,header,size,notice,unitHint}=await loadParsed(primary,files.filter(f=>f!==primary));
    if(ticket!==opening||disposed){gltf.scene.traverse(o=>{(o as THREE.Mesh).geometry?.dispose?.();});return;}
    selectionReset();patchStudio3D({loadPhase:'build'});
    await stage.load(gltf.scene,async()=>{await clipsFrom(gltf);});
    const im=stage.measure().stats;
    const bigScene=validateScene(im).filter(w=>w.level==='warn').length;
    const loadNotice=bigScene?[notice,`${bigScene} performance warning${bigScene>1?'s':''} (see Checks).`].filter(Boolean).join(' '):notice;
    patchStudio3D({status:'ready',name:primary.name,error:'',format:header.format.toUpperCase(),bytes:size,blank:false,confirmReplace:null,notice:loadNotice,unitHint,loadPhase:null,imported:{triangles:im.triangles,materials:im.materials,animations:im.animations}});loadUnit();
    frameAll();
   }catch(e){
    if(ticket!==opening)return;
    patchStudio3D({status:'error',loadPhase:null,error:e instanceof Error?e.message:String(e),blank:false});
   }
  };
  const selectionReset=()=>{patchStudio3D({selected:null,selectedInfo:null,marked:[],notice:'',unitHint:null});};
  const openFiles=async(files:File[],force?:boolean)=>{guard('open',files,force,()=>{stopPreview();return openNow(files);});};
  const newScene=(force?:boolean)=>{guard('new',[],force,()=>{opening++;stopPreview();selectionReset();stage.clear();resetAnim();resetStudio3D({status:'ready',blank:true,name:''});sync();frameAll();});};
  /** Sets the renderer up for an off-screen-quality frame at the requested size, runs fn, and puts the viewport back the way it was. */
  const withCaptureFrame:<R>(cam:THREE.PerspectiveCamera|THREE.OrthographicCamera,want:{width:number;height:number}|null,transparent:boolean,fn:()=>Promise<R>)=>Promise<R>=async(cam,want,transparent,fn)=>{
   const dom=renderer.domElement;const w0=dom.width,h0=dom.height;const pr=renderer.getPixelRatio();
   const persp=(cam as THREE.PerspectiveCamera).isPerspectiveCamera;
   const ortho0=persp?null:{left:(cam as THREE.OrthographicCamera).left,right:(cam as THREE.OrthographicCamera).right,top:(cam as THREE.OrthographicCamera).top,bottom:(cam as THREE.OrthographicCamera).bottom};
   const aspect0=persp?(cam as THREE.PerspectiveCamera).aspect:0,bg=scene.background;
   const hidden:[THREE.Object3D,boolean][]=[grid,gizmoHelper,marks,...(selection?[selection]:[]),...(weightOverlay?[weightOverlay]:[]),...helpers.values()].map(o=>[o,o.visible]);
   try{
    for(const [o] of hidden)o.visible=false;
    if(transparent){scene.background=null;renderer.setClearColor(0x000000,0);}
    renderer.setPixelRatio(1);
    const size=want??(cam===camera?{width:w0,height:h0}:{width:w0,height:Math.max(1,Math.round(w0/((persp?(cam as THREE.PerspectiveCamera).aspect:((cam as THREE.OrthographicCamera).right-(cam as THREE.OrthographicCamera).left)/((cam as THREE.OrthographicCamera).top-(cam as THREE.OrthographicCamera).bottom))||1)))});
    renderer.setSize(size.width,size.height,false);
    if(persp)(cam as THREE.PerspectiveCamera).aspect=size.width/size.height;
    else{const o=cam as THREE.OrthographicCamera;const h=(o.top-o.bottom)/2,cy=(o.top+o.bottom)/2,cx=(o.left+o.right)/2,w2=h*(size.width/size.height);o.left=cx-w2;o.right=cx+w2;}
    cam.updateProjectionMatrix();
    return await fn();
   }finally{
    for(const [o,v] of hidden)o.visible=v;
    scene.background=bg;if(transparent)renderer.setClearColor(0x000000,1);
    if(persp)(cam as THREE.PerspectiveCamera).aspect=aspect0;
    else if(ortho0){const o=cam as THREE.OrthographicCamera;o.left=ortho0.left;o.right=ortho0.right;o.top=ortho0.top;o.bottom=ortho0.bottom;}
    cam.updateProjectionMatrix();renderer.setPixelRatio(pr);renderer.setSize(w0/pr,h0/pr,false);invalidate();
   }
  };
  const readCanvasBlob=async():Promise<Blob>=>{
   const blob=await new Promise<Blob|null>(r=>renderer.domElement.toBlob(r,'image/png'));
   if(!blob)throw new Error('The 3D view could not be captured.');
   return blob;
  };
  /** Renders one PNG at the requested size. */
  const capture=async(cam:THREE.PerspectiveCamera|THREE.OrthographicCamera,want:{width:number;height:number}|null,transparent:boolean):Promise<Blob>=>
   withCaptureFrame(cam,want,transparent,async()=>{renderer.render(scene,cam);return readCanvasBlob();});
  const maxSize=()=>{const gl=renderer.getContext();return Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number,gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,16384);};
  const renderStill=async(opts:{camera?:number;width?:number;height?:number;transparent?:boolean}={})=>{
   let cam:THREE.PerspectiveCamera|THREE.OrthographicCamera=camera;
   if(opts.camera!==undefined){const c=stage.find(opts.camera) as THREE.PerspectiveCamera|THREE.OrthographicCamera|undefined;if(!c||!(c as THREE.PerspectiveCamera).isPerspectiveCamera&&!(c as THREE.OrthographicCamera).isOrthographicCamera)throw Object.assign(new Error('That object is not a camera.'),{expected:true});cam=c;}
   const aspect=(cam as THREE.PerspectiveCamera).isPerspectiveCamera?(cam as THREE.PerspectiveCamera).aspect:((cam as THREE.OrthographicCamera).right-(cam as THREE.OrthographicCamera).left)/((cam as THREE.OrthographicCamera).top-(cam as THREE.OrthographicCamera).bottom);
   const want=opts.width||opts.height?clampRenderSize(opts.width??Math.round((opts.height!)*(aspect||1)),opts.height??Math.round((opts.width!)/(aspect||1)),maxSize()):null;
   download(await capture(cam,want,!!opts.transparent),`${stem(getStudio3DState().name||'scene')}-${cam===camera?'still':'camera'}.png`);
  };
  let cancelFlag=false;
  const renderTurntable=async(opts:{frames?:number;width?:number;height?:number;transparent?:boolean;out?:'zip'|'folder'|'webm';fps?:number}={})=>{
   stopPreview();
   if(getStudio3DState().render)throw Object.assign(new Error('A render is already running.'),{expected:true});
   const size=clampRenderSize(opts.width??1280,opts.height??720,maxSize());
   const plan=turntablePlan(opts.frames??36,size.width,size.height);
   const webm=opts.out==='webm';
   if(webm&&opts.transparent)throw Object.assign(new Error('A WebM video keeps the background. Turn transparent off or choose the ZIP output for transparent frames.'),{expected:true});
   if(webm&&typeof MediaRecorder==='undefined')throw Object.assign(new Error('This browser cannot record WebM video. Use the ZIP output instead.'),{expected:true});
   let dir:{getFileHandle(name:string,opts:{create:boolean}):Promise<{createWritable():Promise<{write(data:Blob):Promise<void>;close():Promise<void>}>}>}|null=null;
   if(opts.out==='folder'){
    const picker=(window as unknown as {showDirectoryPicker?: (o:{mode:string})=>Promise<typeof dir>}).showDirectoryPicker;
    if(!picker)throw Object.assign(new Error('This browser cannot write to a folder. Use the zip output instead.'),{expected:true});
    dir=await picker.call(window,{mode:'readwrite'}).catch(()=>{throw Object.assign(new Error('No folder was chosen.'),{expected:true});});
   }
   const {zipSync}=dir||webm?{zipSync:null}:await import('fflate');
   const pos0=camera.position.clone(),enabled0=controls.enabled;const target=controls.target.clone();const off=pos0.clone().sub(target);
   const files:Record<string,Uint8Array>={};cancelFlag=false;patchStudio3D({render:{done:0,total:plan.frames}});controls.enabled=false;
   let recorder:MediaRecorder|null=null;let track:MediaStreamTrack|null=null;const chunks:Blob[]=[];
   try{
    await withCaptureFrame(camera,size,!!opts.transparent,async()=>{
     if(webm){
      const stream=renderer.domElement.captureStream(0);
      track=stream.getVideoTracks()[0]??null;
      recorder=new MediaRecorder(stream,{mimeType:webmMime(m=>MediaRecorder.isTypeSupported(m))});
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      recorder.start();
     }
     const frameMs=1000/Math.min(60,Math.max(1,opts.fps??30));
     for(let i=0;i<plan.frames;i++){
      if(cancelFlag||disposed)throw Object.assign(new Error('Render cancelled.'),{expected:true});
      camera.position.copy(target).add(off.clone().applyAxisAngle(new THREE.Vector3(0,1,0),plan.step*i));camera.lookAt(target);camera.updateMatrixWorld(true);
      renderer.render(scene,camera);
      if(webm){(track as MediaStreamTrack&{requestFrame?:()=>void}|null)?.requestFrame?.();await new Promise(r=>setTimeout(r,frameMs));}
      else{
       const blob=await readCanvasBlob();
       if(dir){const fh=await dir.getFileHandle(frameName(i,plan.frames),{create:true});const w=await fh.createWritable();await w.write(blob);await w.close();}
       else files[frameName(i,plan.frames)]=new Uint8Array(await blob.arrayBuffer());
       await new Promise(r=>setTimeout(r,0));
      }
      patchStudio3D({render:{done:i+1,total:plan.frames}});
     }
    });
    // Assigned inside the capture callback above, so the control-flow analysis still sees null here.
    const rec=recorder as MediaRecorder|null;
    if(webm){
     if(rec&&rec.state!=='inactive')await new Promise<void>(r=>{rec.addEventListener('stop',()=>r(),{once:true});rec.stop();});
     download(new Blob(chunks,{type:'video/webm'}),`${stem(getStudio3DState().name||'scene')}-turntable.webm`);
    }else if(!dir)download(new Blob([zipSync!(files,{level:0}) as BlobPart],{type:'application/zip'}),`${stem(getStudio3DState().name||'scene')}-turntable.zip`);
   }finally{
    const rec=recorder as MediaRecorder|null,tr=track as MediaStreamTrack|null;
    if(rec&&rec.state!=='inactive')rec.stop();
    tr?.stop();
    camera.position.copy(pos0);camera.lookAt(target);controls.enabled=enabled0;patchStudio3D({render:null});invalidate();
   }
  };
  const exportMesh=async(format:'stl'|'obj')=>{
   const target=selRoot()??holder;
   let meshes=0;target.traverse(o=>{if((o as THREE.Mesh).isMesh)meshes++;});
   if(!meshes)throw Object.assign(new Error('There is no mesh to export. Open a model or add a shape first.'),{expected:true});
   const unit=getStudio3DState().unit;const prev=target.scale.clone();
   target.scale.multiplyScalar(unitScale(unit));target.updateMatrixWorld(true);
   let blob:Blob;
   try{
    if(format==='stl')blob=new Blob([new STLExporter().parse(target,{binary:true}) as unknown as BlobPart],{type:'model/stl'});
    else blob=new Blob([new OBJExporter().parse(target)],{type:'model/obj'});
   }finally{target.scale.copy(prev);target.updateMatrixWorld(true);invalidate();}
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
    views:st.views,view:{position:camera.position.toArray() as [number,number,number],target:controls.target.toArray() as [number,number,number],fov:perspCam.fov}});
  };
  /** Images are embedded in the file; anything above the limit is scaled down, and a scene whose textures would not fit in memory is refused. */
  const exportOpts=(binary:boolean)=>{const why=exportBlocker(stage.measure().stats);if(why)throw Object.assign(new Error(why),{expected:true});return{binary,maxTextureSize:LIMITS.exportMaxTextureSize};};
  /** With clips the exporter gets a scene that lists the top-level nodes, so tracks find their nodes; without clips the input is unchanged. */
  const newExporter=()=>{const e=new GLTFExporter();e.register(stage.exporterPlugin() as never);return e;};
  /** Clip names for export: an explicit pick wins over the session setting; null exports everything. */
  const clipsFor=(pick?:string[]|null):THREE.AnimationClip[]=>{
   const all=stage.exportClips();const want=pickClips(all.map(c=>c.name),pick===undefined?getStudio3DState().exportClips:pick);
   return all.filter(c=>want.includes(c.name));
  };
  /** Selection-only export: a throwaway clone subtree with world transforms, or null when exporting the whole scene. Clips are skipped for a selection: their tracks would point at nodes outside the exported subtree. */
  const selRoot=():THREE.Object3D|null=>{
   if(!getStudio3DState().exportSelection)return null;
   const ids=currentSet();if(!ids.length)throw Object.assign(new Error('Nothing is selected. Select objects or turn off selection-only export.'),{expected:true});
   return exportClone(holder,ids);
  };
  const exportInput=(whole:boolean,clips?:string[]|null)=>{const animations=clipsFor(clips);return animations.length?{input:stage.exportScene() as THREE.Object3D|THREE.Object3D[],animations}:{input:(whole?[...holder.children]:holder.children.length===1?holder.children[0]:holder) as THREE.Object3D|THREE.Object3D[],animations:undefined};};
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
  try{patchStudio3D({materialPresets:readPresets(localStorage)});}catch{/* keep current */}
  const setUnit=(u:unknown)=>{if(!isUnit(u))throw Object.assign(new Error('Unit must be m, cm, mm or in.'),{expected:true});patchStudio3D({unit:u});try{writeProjectUnit(localStorage,projectName(),u);}catch{/* session only */}};
  const exportGlb=async(opts?:{clips?:string[]|null})=>{
   if(!holder.children.length)throw Object.assign(new Error('There is nothing to export. Open a model first.'),{expected:true});
   const sel=selRoot();const x=sel?{input:sel as THREE.Object3D,animations:undefined}:exportInput(false,opts?.clips);
   const result=await newExporter().parseAsync(x.input,{...exportOpts(true),...(x.animations?{animations:x.animations}:{})});
   download(new Blob([result as ArrayBuffer],{type:'model/gltf-binary'}),`${stem(getStudio3DState().name||'scene')}.glb`);
   stage.markSaved();
  };
  /** glTF 2.0 as one self-contained .gltf file, or as a ZIP with the .gltf and its textures as separate files. */
  const exportGltf=async(opts?:{textures?:'embed'|'external';clips?:string[]|null})=>{
   if(!holder.children.length)throw Object.assign(new Error('There is nothing to export. Open a model first.'),{expected:true});
   const sel=selRoot();const x=sel?{input:sel as THREE.Object3D,animations:undefined}:exportInput(false,opts?.clips);
   const result=await newExporter().parseAsync(x.input,{...exportOpts(false),...(x.animations?{animations:x.animations}:{})}) as {images?:{uri?:string;mimeType?:string}[]};
   const mode=opts?.textures??getStudio3DState().exportTextures;const name=stem(getStudio3DState().name||'scene');
   if(mode==='external'){
    const {files}=extractGltfTextures(result);const {zipSync,strToU8}=await import('fflate');
    const zip=zipSync({[`${name}.gltf`]:strToU8(JSON.stringify(result)),...Object.fromEntries([...files].map(([n,b])=>[n,b]))});
    download(new Blob([zip.buffer as ArrayBuffer],{type:'application/zip'}),`${name}.gltf.zip`);
   }else download(new Blob([JSON.stringify(result)],{type:'model/gltf+json'}),`${name}.gltf`);
   stage.markSaved();
  };
  /** Export options live in the session so the buttons and the commands agree. */
  const setExportOptions=(p:{textures?:'embed'|'external';clips?:string[]|null;selection?:boolean})=>{
   if(p.textures&&!(GLTF_TEXTURE_MODES as readonly string[]).includes(p.textures))throw Object.assign(new Error(`Textures must be one of ${GLTF_TEXTURE_MODES.join(', ')}.`),{expected:true});
   if(p.clips)pickClips(stage.clips.map(c=>c.name),p.clips);
   patchStudio3D({...(p.textures?{exportTextures:p.textures}:{}),...(p.clips!==undefined?{exportClips:p.clips&&p.clips.length===stage.clips.length?null:p.clips}:{})});
   if(p.selection!==undefined)patchStudio3D({exportSelection:p.selection});
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
  const generateTextureC=(id:number,slot:TextureSlot,spec:TexgenSpec)=>{
   let img;try{img=generateTexturePixels(spec);}catch(e){throw Object.assign(e instanceof Error?e:new Error(String(e)),{expected:true});}
   const tex=new THREE.DataTexture(img.data,img.width,img.height,THREE.RGBAFormat);
   tex.name=`${spec.kind}-${img.width}`;
   stage.setTexture(id,slot,tex);
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
   const center=box&&!box.isEmpty()?box.getCenter(new THREE.Vector3()):bounds&&boundsValid(bounds)?new THREE.Vector3(...boundsCenter(bounds)):new THREE.Vector3(0,0,0);
   const radius=box&&!box.isEmpty()?Math.max(box.getSize(new THREE.Vector3()).length()/2,1e-4):bounds&&boundsValid(bounds)?Math.max(boundsRadius(bounds),1e-4):5;
   const d=frameDistance(radius,perspCam.fov,perspCam.aspect);
   flyTo({position:[center.x+dir.x*d,center.y+dir.y*d,center.z+dir.z*d],target:[center.x,center.y,center.z]},()=>{
    const {near,far}=clipPlanes(d,radius);
    camera.near=near;camera.far=far;
    if((camera as THREE.OrthographicCamera).isOrthographicCamera){const halfH=Math.max(radius*1.25,1e-4),a=perspCam.aspect||1;orthoCam.top=halfH;orthoCam.bottom=-halfH;orthoCam.left=-halfH*a;orthoCam.right=halfH*a;orthoCam.zoom=1;}
    camera.updateProjectionMatrix();
    controls.minDistance=radius*0.05;controls.maxDistance=d*20;
   });
  };
  /** Animation clips live in the stage (so edits are undoable and get saved). Playback poses the nodes as a pure function of clip and time and never touches the undo history. */
  const anim=()=>getStudio3DState().anim;
  const ensureMixer=()=>{if(!mixer||mixerRev!==stage.clipRevision){mixer?.stopAllAction();mixer=new THREE.AnimationMixer(holder);mixerRev=stage.clipRevision;}return mixer;};
  const showPose=()=>{const sel=getStudio3DState().selected;if(sel!=null)patchStudio3D({selectedInfo:stage.info(sel)});};
  const pose=(clip:number,time:number)=>{
   const c=stage.playableClip(clip);if(!c)return;
   const m=ensureMixer();m.stopAllAction();const a=m.clipAction(c);a.setLoop(THREE.LoopOnce,1);a.clampWhenFinished=true;a.reset().play();m.setTime(time);
   holder.updateMatrixWorld(true);drawSelection();syncOnion();invalidate();
  };
  /** Back to the start of the first clip, e.g. after a new model was opened. */
  const resetAnim=()=>{stopAnim();mixer?.stopAllAction();mixer=null;patchStudio3D({clips:clipInfos(),anim:{clip:0,playing:false,time:0,loop:true,speed:1,range:null}});};
  const tick=(now:number)=>{
   animRaf=0;const a=anim();const c=stage.clips[a.clip];if(!a.playing||!c)return;
   const r=advance(a.time,(now-lastTick)/1000,c.duration,a.loop,a.speed,a.range);lastTick=now;
   pose(a.clip,r.time);state_time=r.time;
   // Publish about 15 times a second so the panel does not re-render every frame.
   if(r.ended||now-lastPublish>66){lastPublish=now;patchStudio3D({anim:{...a,time:r.time,playing:!r.ended}});showPose();}
   if(!r.ended)animRaf=requestAnimationFrame(tick);
  };
  const animPlay=(clip?:number)=>{
   const infos=clipInfos();const a=anim();const idx=clip===undefined?a.clip:checkClip(clip,infos);checkClip(idx,infos);
   const range=idx===a.clip&&rangeFits(a.range,infos[idx].duration)?a.range:null;
   let t=idx===a.clip?startTime(a.time,infos[idx].duration,a.loop):0;
   if(range&&(t<range.start||t>=range.end))t=range.start;
   patchStudio3D({anim:{...a,clip:idx,time:t,playing:true,range}});stopAnim();lastTick=performance.now();lastPublish=lastTick;pose(idx,t);animRaf=requestAnimationFrame(tick);
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
  const clipRemove=(clip?:number)=>{const i=clipIndex(clip);stopAnim();stage.removeClip(i);patchStudio3D({anim:{...anim(),clip:Math.max(0,Math.min(anim().clip,stage.clips.length-1)),playing:false,time:0,range:null}});};
  const clipRename=(name:string,clip?:number)=>stage.renameClip(clipIndex(clip),name);
  const clipDuration=(duration:number,clip?:number)=>{stage.setClipDuration(clipIndex(clip),duration);const a=anim();patchStudio3D({anim:{...a,time:Math.min(a.time,duration),range:rangeFits(a.range,duration)?a.range:null}});};
  const keyTarget=(id?:number)=>{const t=id??getStudio3DState().selected;if(t==null)throw Object.assign(new Error('Select an object first.'),{expected:true});return t;};
  const keySet=(path:KeyPath,time?:number,id?:number,value?:{x?:number;y?:number;z?:number})=>{
   if(!stage.clips.length)clipAdd();
   stage.setKey(anim().clip,keyTarget(id),path,time??anim().time,value);
  };
  const keyRemove=(path:KeyPath,time?:number,id?:number)=>stage.removeKey(anim().clip,keyTarget(id),path,time??anim().time);
  const keyMove=(path:KeyPath,from:number,to:number,id?:number)=>stage.moveKey(anim().clip,keyTarget(id),path,from,to);
  const keyEase=(path:KeyPath,time:number,ease:Ease,id?:number)=>stage.setKeyEase(anim().clip,keyTarget(id),path,time,ease);
  /** The material clipboard lives with the viewport: it survives undo and selection changes, and dies with the scene. */
  let materialClipboard:MaterialSnapshot|null=null;
  /** The key clipboard lives with the viewport: it survives undo and clip switches, and dies with the scene. */
  let keyClipboard:KeyData[]=[];
  const keyCopy=(keys:KeyRef[],id?:number)=>{const data=stage.copyKeys(anim().clip,keyTarget(id),keys);keyClipboard=data;return data.length;};
  const keyPaste=(time?:number,id?:number)=>{
   if(!keyClipboard.length)throw Object.assign(new Error('Copy keys first.'),{expected:true});
   return stage.pasteKeys(anim().clip,keyTarget(id),keyClipboard,time??anim().time);
  };
  const keyShift=(keys:KeyRef[],delta:number,id?:number)=>stage.shiftKeys(anim().clip,keyTarget(id),keys,delta);
  const clipDuplicate=(clip?:number)=>{const i=stage.duplicateClip(clipIndex(clip));stopAnim();patchStudio3D({anim:{...anim(),clip:i,playing:false,time:0,range:null}});return i;};
  const selectBone=(id:number)=>{
   if(!stage.isBone(id))throw Object.assign(new Error('That is not a bone.'),{expected:true});
   select(id);
  };
  const setSkeleton=(on:boolean)=>{patchStudio3D({skeleton:!!on});syncSkeleton();invalidate();};
  const skinBind=(id:number,bone:number,mode:'smooth'|'rigid')=>{const sk=stage.skinBind(id,bone,mode);patchStudio3D({selected:sk.id,marked:[],weightPreview:null});sync();};
  const skinRebind=(id:number,mode:'smooth'|'rigid')=>{const reset=stage.skinRebind(id,mode);if(reset)patchStudio3D({notice:'Posed joints were reset to the bind pose before weighting.'});};
  const setWeightPreview=(bone:number|null)=>{patchStudio3D({weightPreview:bone});syncWeightPreview();invalidate();};
  const setWeightBrush=(patch:Partial<{on:boolean;mode:'add'|'subtract'|'smooth';radius:number;strength:number;falloff:'smooth'|'linear'|'constant'}>)=>{
   const cur=getStudio3DState().weightBrush;const next={...cur,...patch};
   // Turning the brush on needs a bone to paint: default the preview to the first bone of the selected mesh's skeleton.
   if(next.on&&getStudio3DState().weightPreview==null){
    const sel=getStudio3DState().selected;const mesh=sel==null?null:stage.find(sel) as THREE.SkinnedMesh|null;
    const first=mesh?.isSkinnedMesh?mesh.skeleton.bones[0]:null;
    if(first)patchStudio3D({weightPreview:first.id});
   }
   patchStudio3D({weightBrush:next});syncWeightPreview();invalidate();
  };
  const poseTarget=():number=>{const sel=getStudio3DState().selected;if(sel==null)throw Object.assign(new Error('Select a bone or a skinned mesh first.'),{expected:true});return sel;};
  const ikToggle=(on:boolean,id?:number)=>{stage.ikToggle(id??poseTarget(),on);};
  const ikSetTarget=(p:readonly[number,number,number],id?:number)=>{stage.ikSetTarget(id??poseTarget(),p);};
  const ikSetPole=(p:readonly[number,number,number],id?:number)=>{stage.ikSetPole(id??poseTarget(),p);};
  const recordPose=(all?:boolean,id?:number,clip?:number,time?:number)=>{
   const st=getStudio3DState();const i=clip??st.anim.clip;const t=time??st.anim.time;
   const ids=all?stage.bones().map(b=>b.id):id!=null?[id]:[...new Set([...st.marked,st.selected].filter((x):x is number=>x!=null&&!!stage.find(x)))];
   if(!ids.length)throw Object.assign(new Error(all?'This scene has no bones.':'Select at least one bone to record.'),{expected:true});
   return stage.recordPose(i,t,ids);
  };
  const onionSkin=(on?:boolean,before?:number,after?:number)=>{const o=getStudio3DState().onion;patchStudio3D({onion:{on:on??!o.on,before:Math.min(Math.max(Math.round(before??o.before),0),4),after:Math.min(Math.max(Math.round(after??o.after),0),4)}});syncOnion();invalidate();};
  const motionPathToggle=(on?:boolean)=>{patchStudio3D({motionPath:on??!getStudio3DState().motionPath});syncMotionPath();invalidate();};
  const retargetPreviewC=(source:number,target?:number,clip?:number)=>stage.retargetPreview(source,target??poseTarget(),clip??getStudio3DState().anim.clip,getStudio3DState().anim.time);
  const retargetApplyC=(source:number,target?:number,clip?:number,name?:string)=>stage.retargetApply(source,target??poseTarget(),clip??getStudio3DState().anim.clip,name);
  const fabrikToggle=(on:boolean,id?:number)=>{stage.fabrikToggle(id??poseTarget(),on);};
  const fabrikSetTarget=(p:readonly[number,number,number],id?:number)=>{stage.fabrikSetTarget(id??poseTarget(),p);};
  const fabrikLookToggle=(on:boolean,id?:number)=>{stage.fabrikLookToggle(id??poseTarget(),on);};
  const fabrikSetLook=(p:readonly[number,number,number],id?:number)=>{stage.fabrikSetLook(id??poseTarget(),p);};
  const setBoneLimits=(min:(number|null)[]|null,max:(number|null)[]|null,id?:number)=>{const rad=(a:(number|null)[]|null)=>(a??[null,null,null]).map(x=>x==null?Number.NaN:x) as [number,number,number];stage.setBoneLimits(id??poseTarget(),min?rad(min):null,max?rad(max):null);};
  const poseId=(id?:number)=>id??poseTarget();
  const poseSave=(name:string,id?:number)=>{stage.poseSave(poseId(id),name);};
  const poseApply=(name:string,id?:number)=>{stage.poseApply(poseId(id),name);};
  const poseRemove=(name:string,id?:number)=>{stage.poseRemove(poseId(id),name);};
  const poseMirror=(name:string,id?:number)=>{stage.poseMirror(poseId(id),name);};
  const poseBlend=(a:string,b:string,t:number,id?:number)=>{stage.poseBlend(poseId(id),a,b,t);};
  const dab=(mesh:THREE.SkinnedMesh,local:THREE.Vector3,opts?:{bone?:number;mode?:'add'|'subtract'|'smooth';radius?:number;strength?:number;falloff?:'smooth'|'linear'|'constant'}):number=>{
   const st=getStudio3DState();const bone=opts?.bone??st.weightPreview;
   if(bone==null)throw Object.assign(new Error('Pick a bone for the weight preview first.'),{expected:true});
   return stage.skinPaint(mesh.id,bone,[local.x,local.y,local.z],{mode:opts?.mode??st.weightBrush.mode,radius:opts?.radius??st.weightBrush.radius,strength:opts?.strength??st.weightBrush.strength,falloff:opts?.falloff??st.weightBrush.falloff});
  };
  const paintDab=(x:number,y:number,z:number,opts?:{bone?:number;mode?:'add'|'subtract'|'smooth';radius?:number;strength?:number;falloff?:'smooth'|'linear'|'constant'}):number=>{
   const sel=getStudio3DState().selected;const mesh=sel==null?null:stage.find(sel) as THREE.SkinnedMesh|null;
   if(!mesh||!mesh.isSkinnedMesh)throw Object.assign(new Error('Select a skinned mesh first.'),{expected:true});
   stage.skinPaintStart(mesh.id);let n=0;
   try{n=dab(mesh,new THREE.Vector3(x,y,z),opts);}finally{stage.skinPaintEnd(mesh.id);}
   return n;
  };
  const animRange=(range:LoopRange|null)=>{
   const infos=clipInfos();const a=anim();checkClip(a.clip,infos);
   if(range===null){patchStudio3D({anim:{...a,range:null}});return;}
   const r=checkRange(range.start,range.end,infos[a.clip].duration);
   patchStudio3D({anim:{...a,range:r}});if(a.playing)lastTick=performance.now();
  };
  /** Auto-key records transform changes into the current clip at the playhead. Turning it on without a clip makes one. */
  const autoKey=(on:boolean)=>{if(on&&!stage.clips.length)clipAdd();patchStudio3D({autoKey:!!on});};
  stage.autoKeySource=()=>getStudio3DState().autoKey&&stage.clips.length?{clip:anim().clip,time:anim().time}:null;
  const offDrop=registerStudio3DTextureDrop((slot,file)=>{
   const id=getStudio3DState().selected;
   if(id==null||getStudio3DState().selectedInfo?.material==null)return;
   void setTextureFile(id,slot,file).catch((e:unknown)=>patchStudio3D({error:e instanceof Error?e.message:String(e)})).then(()=>{const sel=getStudio3DState().selected;if(sel!=null)patchStudio3D({selectedInfo:stage.info(sel)});sync();invalidate();});
  });
  /** Applies a user-saved or built-in material preset by name. */
  const applyPresetByName=(id:number,name:string)=>{
   const user=getStudio3DState().materialPresets.find(p=>p.name===name);
   stage.setMaterial(id,user?presetPatch(user):{preset:name});
  };

  const off=registerStudio3DController({keyMove,keyEase,keyCopy,keyShift,clipDuplicate,animRange,selectBone,setSkeleton,skinBind,skinRebind,setWeightPreview,setWeightBrush,paintDab,poseSave,poseApply,poseRemove,poseMirror,poseBlend,ikToggle,ikSetTarget,ikSetPole,recordPose,onionSkin,motionPathToggle,retargetPreview:retargetPreviewC,retargetApply:retargetApplyC,fabrikToggle,fabrikSetTarget,fabrikLookToggle,fabrikSetLook,setBoneLimits,keyPaste,autoKey,clipAdd,clipRemove,clipRename,clipDuration,keySet,keyRemove,animPlay,animPause,animSeek,animLoop,animSpeed,setTextureTransform:(id,slot,p)=>stage.setTextureTransform(id,slot,p),exportGltf,setTextureFile,generateTexture:generateTextureC,mirrorSelection,applyScale:applyScaleSel,mergeSelection:mergeSel,viewPreset,setPrimitive:(id,p)=>stage.setPrimitive(id,p),simplify:(id,keep)=>stage.simplify(id,keep),symmetrize:(axis,side,merge,ids)=>{const set=ids??currentSet();if(!set.length)throw Object.assign(new Error('Select something first.'),{expected:true});return stage.symmetrize(axis,side,merge,set);},subdivide:(iterations,ids)=>{const set=ids??currentSet();if(!set.length)throw Object.assign(new Error('Select something first.'),{expected:true});return stage.subdivide(iterations,set);},cleanup:(weld,ids)=>{const set=ids??currentSet();if(!set.length)throw Object.assign(new Error('Select something first.'),{expected:true});return stage.cleanup(weld,set);},normals:(op,angle,ids)=>{const set=ids??currentSet();if(!set.length)throw Object.assign(new Error('Select something first.'),{expected:true});return stage.normalsOp(op,angle,set);},separate:(ids)=>{const set=ids??currentSet();if(!set.length)throw Object.assign(new Error('Select something first.'),{expected:true});return stage.separate(set);},solidify:(thickness,offset,ids)=>{const set=ids??currentSet();if(!set.length)throw Object.assign(new Error('Select something first.'),{expected:true});return stage.solidify(thickness,offset,set);},fillHoles:(ids)=>{const set=ids??currentSet();if(!set.length)throw Object.assign(new Error('Select something first.'),{expected:true});return stage.fillHoles(set);},setVertexColors:(on,color,ids)=>{const set=ids??currentSet();if(!set.length)throw Object.assign(new Error('Select something first.'),{expected:true});return stage.setVertexColors(on,color,set);},relax:(iterations,factor,ids)=>{const set=ids??currentSet();if(!set.length)throw Object.assign(new Error('Select something first.'),{expected:true});return stage.relax(iterations,factor,set);},fatten:(amount,ids)=>{const set=ids??currentSet();if(!set.length)throw Object.assign(new Error('Select something first.'),{expected:true});return stage.fatten(amount,set);},bisect:(axis,offset,fill,ids)=>{const set=ids??currentSet();if(!set.length)throw Object.assign(new Error('Select something first.'),{expected:true});return stage.bisect(axis,offset,fill,set);},bend:(axis,degrees,ids)=>{const set=ids??currentSet();if(!set.length)throw Object.assign(new Error('Select something first.'),{expected:true});return stage.bend(axis,degrees,set);},twist:(axis,degrees,ids)=>{const set=ids??currentSet();if(!set.length)throw Object.assign(new Error('Select something first.'),{expected:true});return stage.twist(axis,degrees,set);},taper:(axis,factor,ids)=>{const set=ids??currentSet();if(!set.length)throw Object.assign(new Error('Select something first.'),{expected:true});return stage.taper(axis,factor,set);},spin:(axis,degrees,steps,center,ids)=>{const set=ids??currentSet();if(!set.length)throw Object.assign(new Error('Select something first.'),{expected:true});return stage.spin(axis,degrees,steps,center,set);},screw:(axis,degrees,steps,center,rise,ids)=>{const set=ids??currentSet();if(!set.length)throw Object.assign(new Error('Select something first.'),{expected:true});return stage.screw(axis,degrees,steps,center,rise,set);},bridge:(ids,twist)=>{const set=ids??currentSet();if(set.length!==2)throw Object.assign(new Error('Select exactly two meshes to bridge.'),{expected:true});return stage.bridge(set,twist);},booleanOp:(op,ids)=>{const set=ids??currentSet();if(set.length!==2)throw Object.assign(new Error('Select exactly two meshes for a boolean.'),{expected:true});return stage.booleanOp(op,set);},remesh:(resolution,ids)=>{const set=ids??currentSet();if(!set.length)throw Object.assign(new Error('Select something first.'),{expected:true});return stage.remesh(resolution,set);},
   save:saveDocument,deleteSelection,duplicateSelection,exportMesh,setExportOptions,renderTurntable,cancelRender:()=>{cancelFlag=true;},setUnit,openFiles,newScene,resetView:frameAll,frameSelection,select,renderStill,exportGlb,
   addPrimitive:k=>{const o=stage.addPrimitive(k);select(o.id);return o.id;},addLight:k=>{const o=stage.addLight(k);select(o.id);return o.id;},addLightRig:preset=>{const l=stage.addLightRig(preset);select(l[0].id);return l.map(x=>x.id);},
   addPin:at=>{const o=stage.addPin(at??getStudio3DState().cursor);select(o.id);return o.id;},
   setPinText:(id,text)=>{stage.setPinText(id,text);const sel=getStudio3DState().selected;if(sel!=null)patchStudio3D({selectedInfo:stage.info(sel)});sync();invalidate();},
   setTransform:(id,p)=>stage.setTransform(id,p),setMaterial:(id,p)=>stage.setMaterial(id,p),rename:(id,n)=>stage.rename(id,n),
   setObjectVisible:(id,on)=>{stage.setHidden(id,!on);sync();invalidate();},setObjectLocked:(id,on)=>{stage.setLocked(id,on);sync();},reparent:(ids,parent)=>{stage.reparent(ids,parent);sync();invalidate();},reorder:(ids,target,where)=>{stage.reorder(ids,target,where);sync();invalidate();},
   addCamera:(fromView,kind)=>{
    const o=fromView?stage.addCamera({position:{x:camera.position.x,y:camera.position.y,z:camera.position.z},quaternion:camera.quaternion.toArray().slice(0,4) as [number,number,number,number]},perspCam.fov,kind):stage.addCamera(undefined,40,kind);
    select(o.id);return o.id;},
   viewSave:name=>{
    const views=getStudio3DState().views;const n=(name??'').trim().slice(0,60)||nextViewName(views);
    if(views.some(v=>v.name===n))throw Object.assign(new Error(`A view named ${n} already exists.`),{expected:true});
    patchStudio3D({views:[...views,{name:n,position:[camera.position.x,camera.position.y,camera.position.z],quaternion:camera.quaternion.toArray() as [number,number,number,number],target:[controls.target.x,controls.target.y,controls.target.z]}]});return n;},
   viewApply:applyViewByName,
   viewUpdate:name=>{
    const views=getStudio3DState().views;
    patchStudio3D({views:updateView(views,name,{position:[camera.position.x,camera.position.y,camera.position.z],quaternion:camera.quaternion.toArray() as [number,number,number,number],target:[controls.target.x,controls.target.y,controls.target.z]})});
   },
   viewRename:(name,to)=>{patchStudio3D({views:renameView(getStudio3DState().views,name,to)});},
   viewRemove:name=>{
    const views=getStudio3DState().views;if(!views.some(v=>v.name===name))throw Object.assign(new Error(`There is no saved view named ${name}.`),{expected:true});
    patchStudio3D({views:views.filter(v=>v.name!==name)});},
   materialPresetSave:(name,id)=>{
    const target=id??getStudio3DState().selected;
    if(target==null)throw Object.assign(new Error('Select a mesh first.'),{expected:true});
    const m=stage.info(target)?.material;
    if(!m)throw Object.assign(new Error('Select a mesh with an editable PBR material.'),{expected:true});
    let p:MaterialPreset;
    try{p=checkPreset({name,color:m.color,metalness:m.metalness,roughness:m.roughness,emissive:m.emissive??DEFAULT_PRESET_EMISSIVE,emissiveIntensity:m.emissiveIntensity??1,opacity:m.opacity??1,alphaMode:m.alphaMode??'opaque',alphaCutoff:m.alphaCutoff??0.5,doubleSided:!!m.doubleSided});}
    catch(e){throw Object.assign(new Error(e instanceof Error?e.message:String(e)),{expected:true});}
    let list:MaterialPreset[];
    try{list=savePreset(localStorage,p);}
    catch(e){if(e instanceof MaterialPresetError)throw Object.assign(new Error(e.message),{expected:true});list=[...getStudio3DState().materialPresets.filter(x=>x.name!==p.name),p];}
    patchStudio3D({materialPresets:list});},
   materialPresetApply:(id,name)=>{
    applyPresetByName(id,name);
    const sel=getStudio3DState().selected;if(sel!=null)patchStudio3D({selectedInfo:stage.info(sel)});
    sync();invalidate();},
   materialPresetRemove:name=>{
    let list:MaterialPreset[];
    try{list=removePreset(localStorage,name);}
    catch(e){if(e instanceof MaterialPresetError)throw Object.assign(new Error(e.message),{expected:true});list=getStudio3DState().materialPresets.filter(x=>x.name!==name);}
    patchStudio3D({materialPresets:list});},
   materialCopy:id=>{
    const target=id??getStudio3DState().selected;
    if(target==null)throw Object.assign(new Error('Select a mesh first.'),{expected:true});
    materialClipboard=stage.copyMaterial(target);},
   materialPaste:id=>{
    if(!materialClipboard)throw Object.assign(new Error('Copy a material first.'),{expected:true});
    const target=id??getStudio3DState().selected;
    if(target==null)throw Object.assign(new Error('Select a mesh first.'),{expected:true});
    stage.pasteMaterial(target,materialClipboard);
    const sel=getStudio3DState().selected;if(sel!=null)patchStudio3D({selectedInfo:stage.info(sel)});
    sync();invalidate();},
   setCamera:(id,p)=>stage.setCamera(id,p),
   /** A 64px centre-cropped preview of a texture slot as a data URL, cached per texture. */
   texturePreview:(id,slot)=>{
    const o=stage.find(id) as THREE.Mesh|undefined;if(!o||!(o as THREE.Mesh).isMesh)return null;
    const mats=Array.isArray(o.material)?o.material:[o.material];
    let tex:THREE.Texture|null=null;
    for(const m of mats){const t=(m as THREE.MeshStandardMaterial)[SLOT_CONFIG[slot].prop] as THREE.Texture|null;if(t){tex=t;break;}}
    if(!tex)return null;
    const hit=previewCache.get(tex.uuid);if(hit)return hit;
    const img=tex.image as (CanvasImageSource&{width?:number;height?:number})|undefined;
    if(!img||!img.width||!img.height)return null;
    const c=document.createElement('canvas');c.width=64;c.height=64;const ctx=c.getContext('2d');if(!ctx)return null;
    const side=Math.min(img.width,img.height);
    ctx.drawImage(img,(img.width-side)/2,(img.height-side)/2,side,side,0,0,64,64);
    const url=c.toDataURL('image/png');
    if(previewCache.size>200)previewCache.clear();
    previewCache.set(tex.uuid,url);
    return url;
   },
   setShadows:patch=>{const cur=getStudio3DState().shadows;const next={quality:patch.quality&&isShadowQuality(patch.quality)?patch.quality:cur.quality,type:patch.type&&isShadowType(patch.type)?patch.type:cur.type};patchStudio3D({shadows:next});applyShadowQuality();invalidate();},
   setLightHelpers:on=>{patchStudio3D({lightHelpers:on});syncLightHelper();invalidate();},
   setAo:patch=>{const cur=getStudio3DState().ao;patchStudio3D({ao:{on:patch.on??cur.on,strength:Math.min(1,Math.max(0,patch.strength??cur.strength))}});invalidate();},
   setPerf:on=>{patchStudio3D({perf:on?{fps:0,calls:0,tris:0}:null});invalidate();},
   setProjection:applyProjection,
   setViewFov:fov=>{const f=Math.min(120,Math.max(1,fov));if(perspCam.fov!==f){perspCam.fov=f;perspCam.updateProjectionMatrix();invalidate();}if(getStudio3DState().viewFov!==f)patchStudio3D({viewFov:f});},
   setTurntable,
   editStart:(id,mode)=>{stage.editStart(id);patchStudio3D({edit:{id,mode:mode??'face',verts:0,edges:0,faces:0},selected:id,marked:[],selectedInfo:stage.info(id)});invalidate();},
   editEnd:()=>{stage.editEnd();patchStudio3D({edit:null});invalidate();},
   editMode:mode=>{const ed=getStudio3DState().edit;if(ed)patchStudio3D({edit:{...ed,mode}});},
   editSelect:(kind,ids,toggle)=>{stage.editSelect(kind,ids,toggle);patchEdit();invalidate();},
   editSelectAll:(op,kind)=>{stage.editSelectAll(op,kind??getStudio3DState().edit?.mode??'face');patchEdit();invalidate();},
   editSelectBoundary:(kind)=>{stage.editSelectBoundary(kind??'edge');patchEdit();invalidate();},
   editSelectLinked:(kind)=>{stage.editSelectLinked(kind??getStudio3DState().edit?.mode??'face');patchEdit();invalidate();},
   editSelectGrow:(steps,shrink,kind)=>{stage.editSelectGrow(steps??1,shrink??false,kind??getStudio3DState().edit?.mode??'face');patchEdit();invalidate();},
   editDelete:(kind)=>{stage.editDelete(kind??getStudio3DState().edit?.mode??'face');patchEdit();invalidate();},
   editWeld:()=>{stage.editWeld();patchEdit();invalidate();},
   editSubdivide:()=>{stage.editSubdivide();patchEdit();invalidate();},
   editPoke:()=>{stage.editPoke();patchEdit();invalidate();},
   editDuplicate:()=>{stage.editDuplicate();patchEdit();invalidate();},
   editFatten:(amount)=>{stage.editFatten(amount);patchEdit();invalidate();},
   editRelax:(iterations,factor)=>{stage.editRelax(iterations,factor);patchEdit();invalidate();},
   editFlip:()=>{stage.editFlip();patchEdit();invalidate();},
   editDissolve:()=>{stage.editDissolve();patchEdit();invalidate();},
   editFill:()=>{stage.editFill();patchEdit();invalidate();},
   editGridFill:()=>{stage.editGridFill();patchEdit();invalidate();},
   editCollapse:()=>{stage.editCollapse();patchEdit();invalidate();},
   editToSphere:(factor)=>{stage.editToSphere(factor);patchEdit();invalidate();},
   editRandomize:(amount,seed)=>{stage.editRandomize(amount,seed);patchEdit();invalidate();},
   editMove:(offset,prop)=>{stage.editMove(offset,prop);patchEdit();invalidate();},
   editRip:()=>{stage.editRip();patchEdit();invalidate();},
   editSeparate:()=>{stage.editSeparate();patchEdit();invalidate();},
   editSelectSharp:degrees=>{stage.editSelectSharp(degrees);patchEdit();invalidate();},
   editRotate:(axis,degrees,prop,pivot)=>{stage.editRotate(axis,degrees,prop,pivot);patchEdit();invalidate();},
   editScale:(factors,prop,pivot)=>{stage.editScale(factors,prop,pivot);patchEdit();invalidate();},
   editSelectSimilar:degrees=>{stage.editSelectSimilar(degrees);patchEdit();invalidate();},
   editShear:(along,by,factor,prop,pivot)=>{stage.editShear(along,by,factor,prop,pivot);patchEdit();invalidate();},
   editFlipEdge:()=>{stage.editFlipEdge();patchEdit();invalidate();},
   editMergeByDistance:distance=>{stage.editMergeByDistance(distance);patchEdit();invalidate();},
   editBisect:(axis,offset,fill)=>{stage.editBisect(axis,offset,fill);patchEdit();invalidate();},
   editKnife:(px,py,pz,nx,ny,nz)=>{stage.editKnife(px,py,pz,nx,ny,nz);patchEdit();invalidate();},
   editSelectPath:(from,to,kind)=>{stage.editSelectPath(from,to,kind);patchEdit();invalidate();},
   editSelectChecker:(kind,nth,offset)=>{stage.editSelectChecker(kind,nth,offset);patchEdit();invalidate();},
   editSelectRandom:(kind,ratio,seed)=>{stage.editSelectRandom(kind,ratio,seed);patchEdit();invalidate();},
   editSelectMirror:(axis,extend)=>{stage.editSelectMirror(axis,extend);patchEdit();invalidate();},
   editSelectFacing:(dir,degrees)=>{stage.editSelectFacing(dir,degrees);patchEdit();invalidate();},
   editSelectLoop:()=>{stage.editSelectLoop();patchEdit();invalidate();},
   editSelectRing:()=>{stage.editSelectRing();patchEdit();invalidate();},
   editUvTransform:(du,dv,rotate,scale)=>{stage.editUvTransform(du,dv,rotate,scale);patchEdit();invalidate();},
  editBridgeFaces:(twist)=>{stage.editBridgeFaces(twist);patchEdit();invalidate();},
  editVertSlide:(edge,factor)=>{stage.editVertSlide(edge,factor);patchEdit();invalidate();},
  editSnapToCursor:(c,off)=>{stage.editSnapToCursor(c,off);patchEdit();invalidate();},
  editSelectNonManifold:()=>{stage.editSelectNonManifold();patchEdit();invalidate();},
  editConvexHull:()=>{stage.editConvexHull();patchEdit();invalidate();},
  editSymmetrize:(axis,side,merge)=>{stage.editSymmetrize(axis,side,merge);patchEdit();invalidate();},
  editShrinkwrap:(target,offset)=>{stage.editShrinkwrap(target,offset);patchEdit();invalidate();},
   editExtrude:o=>{stage.editExtrude(o);afterEditOp();},
   editExtrudeIndividual:offset=>{stage.editExtrudeIndividual(offset);patchEdit();invalidate();},
   editInset:a=>{stage.editInset(a);afterEditOp();},
   editBevel:w=>{stage.editBevel(w);afterEditOp();},
   editLoopCut:()=>{stage.editLoopCut();afterEditOp();},
   editBevelEdge:w=>{stage.editBevelEdge(w);afterEditOp();},
   editLoopSlide:f=>{stage.editLoopSlide(f);afterEditOp();},
   mirrorMod:(id,axis,merge,on,bisect)=>{stage.mirrorMod(id,axis,merge,on,!!bisect);const sel=getStudio3DState().selected;if(sel!=null)patchStudio3D({selectedInfo:stage.info(sel)});sync();invalidate();},
   sculptMaskClear:id=>{stage.sculptMaskClear(id);invalidate();},
   sculptMaskInvert:id=>{stage.sculptMaskInvert(id);invalidate();},
   sculptMaskGrow:(id,steps)=>{stage.sculptMaskGrow(id,steps);invalidate();},
   sculptMaskFromSelection:()=>{stage.sculptMaskFromSelection();invalidate();},
   sculptMaskSmooth:(id,amount)=>{stage.sculptMaskSmooth(id,amount);invalidate();},
   editMaskToSelection:(threshold)=>{stage.editMaskToSelection(threshold);patchEdit();invalidate();},
   sculptBrush:patch=>{patchStudio3D({sculpt:{...getStudio3DState().sculpt,...patch}});},
   setProportional:patch=>{patchStudio3D({proportional:{...getStudio3DState().proportional,...patch}});},
   setEditMirror:axis=>{stage.setEditMirror(axis);patchStudio3D({editMirror:axis??'none'});},
   sculptBegin:id=>stage.sculptBegin(id),
   sculptDab:(id,center,delta,erase)=>{const b=getStudio3DState().sculpt;stage.sculptDabAt(id,center,{brush:b.brush,radius:b.radius,strength:b.strength,falloff:b.falloff,symmetry:b.symmetry,delta},!!erase);if(b.brush==='mask'){syncMaskOverlay();}invalidate();},
   sculptEnd:()=>{stage.sculptEnd();sync();invalidate();},
   group:ids=>{const g=stage.group(ids);select(g.id);return g.id;},
   ungroup:id=>{const g=stage.find(id);const first=g?.children[0]?.id??null;stage.ungroup(id);if(first!=null)select(first);else sync();},
   arrayDuplicate:(ids,spec)=>{const copies=stage.arrayDuplicate(ids,spec);applySet(copies.map(c=>c.id),copies.length?copies[copies.length-1].id:null);return copies.map(c=>c.id);},
   viewFromCamera:id=>{
    const c=stage.find(id) as THREE.PerspectiveCamera|THREE.OrthographicCamera|undefined;if(!c||!(c as THREE.PerspectiveCamera).isPerspectiveCamera&&!(c as THREE.OrthographicCamera).isOrthographicCamera)throw Object.assign(new Error('Select a camera first.'),{expected:true});
    c.updateMatrixWorld(true);const pos=c.getWorldPosition(new THREE.Vector3());const dir=c.getWorldDirection(new THREE.Vector3());
    const dist=bounds&&boundsValid(bounds)?Math.max(boundsRadius(bounds),1):5;
    if((c as THREE.PerspectiveCamera).isPerspectiveCamera){applyProjection('perspective');perspCam.fov=(c as THREE.PerspectiveCamera).fov;perspCam.updateProjectionMatrix();if(getStudio3DState().viewFov!==perspCam.fov)patchStudio3D({viewFov:perspCam.fov});}
    else{applyProjection('orthographic');const sc=c as THREE.OrthographicCamera,a=perspCam.aspect||1;const halfH=Math.max((sc.top-sc.bottom)/2/Math.max(sc.zoom,1e-3),1e-4);orthoCam.top=halfH;orthoCam.bottom=-halfH;orthoCam.left=-halfH*a;orthoCam.right=halfH*a;orthoCam.zoom=1;orthoCam.updateProjectionMatrix();}
    camera.position.copy(pos);controls.target.copy(pos).addScaledVector(dir,dist);camera.near=0.05;camera.far=Math.max(500,dist*50);camera.updateProjectionMatrix();controls.update();invalidate();},
   setGizmo:mode=>{gizmo.setMode(mode);patchStudio3D({gizmo:mode});invalidate();},
   nudge:nudgeBy,
   setLight:(id,p)=>stage.setLight(id,p),setPivot:(id,at)=>stage.setPivot(id,at),align:(ids,a,t)=>stage.align(ids,a,t),distribute:(ids,a)=>stage.distribute(ids,a),snapToGround:(ids)=>stage.snapToGround(ids),moveCenterTo:(ids,at)=>stage.moveCenterTo(ids,at),moveEachTo:(ids,at)=>stage.moveEachTo(ids,at),randomizeTransform:(ids,seed,move,rotate,scale)=>stage.randomizeTransform(ids,seed,move,rotate,scale),
   setSnap:patch=>{patchStudio3D({snap:mergeSnap(getStudio3DState().snap,patch)});applySnap();},
   setPivotMode:mode=>{patchStudio3D({pivot:mode});syncCursorMark();syncGizmo();invalidate();},
   setCursor:p=>{patchStudio3D({cursor:p});syncCursorMark();if(getStudio3DState().pivot==='cursor')syncGizmo();invalidate();},
   cursorToSelection:()=>{const a=getStudio3DState().edit!=null?stage.editSelectionCenter():stage.objectsCenter(currentSet());const p={x:a[0],y:a[1],z:a[2]};patchStudio3D({cursor:p});syncCursorMark();if(getStudio3DState().pivot==='cursor')syncGizmo();invalidate();},
   setMeasure:on=>{patchStudio3D({measure:on?{a:null,b:null}:null});syncMeasure();invalidate();},
   setEnv:patch=>{patchStudio3D({env:mergeEnv(getStudio3DState().env,patch)});void applyEnv();},
   openEnvFile:async file=>{
    if(!envFormatFor(file.name))throw new EnvError('Choose an .hdr or .exr file.');
    if(file.size>128*1024*1024)throw new EnvError(`${file.name} is larger than 128 MB.`);
    customEnv={name:file.name,bytes:await file.arrayBuffer()};envCache.delete('custom');
    patchStudio3D({env:mergeEnv(getStudio3DState().env,{preset:'custom',customName:file.name})});await applyEnv();},
   remove:id=>{stage.remove(id);},duplicate:id=>{const o=stage.duplicate(id);select(o.id);return o.id;},undo:()=>stage.undo(),redo:()=>stage.redo(),
   setGrid:on=>{grid.visible=on;patchStudio3D({grid:on});invalidate();},
   setWireframe:on=>{applyWire(on);patchStudio3D({wireframe:on});invalidate();},
   setUvChecker:on=>{patchStudio3D({uvChecker:on});syncUvChecker();invalidate();},
   uvSeamMark:mark=>{stage.uvSeamMark(mark);afterEditOp();},
   uvSeamsFromIslands:()=>{stage.uvSeamsFromIslands();afterEditOp();},
   uvUnwrap:(id,opts)=>{stage.uvUnwrap(id,opts);const sel=getStudio3DState().selected;if(sel!=null)patchStudio3D({selectedInfo:stage.info(sel)});sync();invalidate();},
   uvPlanar:(id,axis)=>{stage.uvPlanar(id,axis);const sel=getStudio3DState().selected;if(sel!=null)patchStudio3D({selectedInfo:stage.info(sel)});sync();invalidate();},
  });
  // Pick by click (no drag) and keyboard orbit/zoom.
  let down:{x:number;y:number}|null=null;const ray=new THREE.Raycaster();
  // Picking skips hidden and locked objects (locked parents lock their whole subtree).
  const chainOk=(o:THREE.Object3D):boolean=>{for(let n:THREE.Object3D|null=o;n;n=n.parent){if(!n.visible)return false;if(n.userData.somniaLocked===true)return false;}return true;};
  // Assets dragged from the panels: primitives land on the ground plane, materials and presets apply to the mesh under the cursor.
  const onAssetDragOver=(e:DragEvent)=>{if(e.dataTransfer&&Array.from(e.dataTransfer.types).includes(ASSET_MIME)){e.preventDefault();e.dataTransfer.dropEffect='copy';}};
  const onAssetDrop=(e:DragEvent)=>{
   const data=parseAssetDrag(e.dataTransfer?.getData(ASSET_MIME)??'');if(!data)return;
   e.preventDefault();e.stopPropagation();
   try{
    const rect=renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX-rect.left)/rect.width)*2-1,-(((e.clientY-rect.top)/rect.height)*2-1)),camera);
    if(data.kind==='primitive'){
     const hit=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),new THREE.Vector3());
     const b=stage.measure().bounds;const c=b&&boundsValid(b)?boundsCenter(b):[0,0,0] as [number,number,number];
     stage.addPrimitive(data.primitive,hit?{x:hit.x,z:hit.z}:{x:c[0],z:c[2]});
    }else{
     const hit=ray.intersectObject(holder,true).find(h=>(h.object as THREE.Mesh).isMesh&&chainOk(h.object));
     if(!hit){patchStudio3D({notice:'Drop it onto a mesh in the viewport to use it.'});return;}
     if(data.kind==='material')stage.assignMaterial(hit.object.id,data.key);
     else applyPresetByName(hit.object.id,data.kind==='preset'?data.preset:data.name);
    }
   }catch(err){patchStudio3D({notice:err instanceof Error?err.message:String(err)});}
  };
  el.addEventListener('dragover',onAssetDragOver);el.addEventListener('drop',onAssetDrop);
  let shiftDrag=false;let marquee:HTMLDivElement|null=null;
  const endMarquee=()=>{marquee?.remove();marquee=null;if(shiftDrag){shiftDrag=false;controls.enabled=true;}};
  // Capture phase, so orbit never starts when shift is held: shift+click toggles, shift+drag draws a marquee.
  // Weight painting: with the brush on and a preview bone set, dragging on the mesh paints instead of orbiting.
  let painting=false;
  let sculpting:{id:number;last:THREE.Vector3}|null=null;
  const paintHit=(e:PointerEvent):boolean=>{
   const rect=renderer.domElement.getBoundingClientRect();
   ray.setFromCamera(new THREE.Vector2(((e.clientX-rect.left)/rect.width)*2-1,-(((e.clientY-rect.top)/rect.height)*2-1)),camera);
   const hit=weightOverlay?ray.intersectObject(weightOverlay,false)[0]??null:null;
   if(!hit)return false;
   const mesh=stage.find(getStudio3DState().selected!) as THREE.SkinnedMesh;
   dab(mesh,mesh.worldToLocal(hit.point.clone()));
   return true;
  };
  const onDownCapture=(e:PointerEvent)=>{
   const st=getStudio3DState();
   if(st.weightBrush.on&&st.weightPreview!=null&&weightOverlay&&e.button===0&&gizmo.axis===null){
    const mesh=st.selected==null?null:stage.find(st.selected) as THREE.SkinnedMesh|null;
    if(mesh?.isSkinnedMesh){stage.skinPaintStart(mesh.id);painting=true;controls.enabled=false;gizmo.enabled=false;paintHit(e);e.stopPropagation();return;}
   }
   if(e.shiftKey&&e.button===0&&gizmo.axis===null){shiftDrag=true;controls.enabled=false;}
  };
  const sculptRay=(e:PointerEvent):THREE.Intersection|null=>{
   const rect=renderer.domElement.getBoundingClientRect();
   ray.setFromCamera(new THREE.Vector2(((e.clientX-rect.left)/rect.width)*2-1,-(((e.clientY-rect.top)/rect.height)*2-1)),camera);
   return ray.intersectObject(holder,true).find(h=>(h.object as THREE.Mesh).isMesh&&!(h.object as THREE.SkinnedMesh).isSkinnedMesh&&chainOk(h.object))??null;
  };
  /** One measure pick: mesh hit or ground plane, then the snap settings (grid rounds, vertex/surface/midpoint use the stage lookup). */
  const pickMeasurePoint=(e:{clientX:number;clientY:number}):{x:number;y:number;z:number}|null=>{
   const rect=renderer.domElement.getBoundingClientRect();
   ray.setFromCamera(new THREE.Vector2(((e.clientX-rect.left)/rect.width)*2-1,-(((e.clientY-rect.top)/rect.height)*2-1)),camera);
   const hit=ray.intersectObject(holder,true).find(h=>(h.object as THREE.Mesh).isMesh);
   let p=hit?hit.point.clone():null;
   if(!p){const tmp=new THREE.Vector3();if(ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),tmp))p=tmp;}
   if(!p)return null;
   const sn=getStudio3DState().snap;
   return snapMeasurePoint({x:p.x,y:p.y,z:p.z},sn,mode=>stage.snapPoint({x:p.x,y:p.y,z:p.z},mode,[],Math.max(sn.move,0.05)));
  };
  const onDown=(e:PointerEvent)=>{
   const st=getStudio3DState();
   // Measure tool: clicks pick world points (mesh hits first, ground plane as fallback) instead of selecting.
   if(st.measure&&gizmo.axis===null){
    const p=pickMeasurePoint(e);
    if(p){const m=st.measure;patchStudio3D({measure:!m.a||m.b?{a:p,b:null}:{a:m.a,b:p}});syncMeasure();invalidate();}
    down=null;return;
   }
   if(st.sculpt.on){
    const hit=sculptRay(e);
    if(hit)try{
     stage.sculptBegin(hit.object.id);
     sculpting={id:hit.object.id,last:hit.point.clone()};
     controls.enabled=false;gizmo.enabled=false;
     const mesh=hit.object as THREE.Mesh;const lp=mesh.worldToLocal(hit.point.clone());
     const b=getStudio3DState().sculpt;
     stage.sculptDabAt(mesh.id,[lp.x,lp.y,lp.z],{brush:b.brush,radius:b.radius,strength:b.strength,falloff:b.falloff,symmetry:b.symmetry},e.ctrlKey||e.metaKey);
     invalidate();
    }catch{sculpting=null;}
    down=null;return;
   }
   down=gizmo.axis!==null?null:{x:e.clientX,y:e.clientY};
  };
  const onMove=(e:PointerEvent)=>{
   if(painting){paintHit(e);return;}
   if(sculpting){
    const hit=sculptRay(e);
    if(hit&&hit.object.id===sculpting.id){
     const mesh=hit.object as THREE.Mesh;const lp=mesh.worldToLocal(hit.point.clone());
     const b=getStudio3DState().sculpt;const lastL=mesh.worldToLocal(sculpting.last.clone());
     const d:[number,number,number]|undefined=b.brush==='grab'?[lp.x-lastL.x,lp.y-lastL.y,lp.z-lastL.z]:undefined;
     stage.sculptDabAt(mesh.id,[lp.x,lp.y,lp.z],{brush:b.brush,radius:b.radius,strength:b.strength,falloff:b.falloff,symmetry:b.symmetry,delta:d},e.ctrlKey||e.metaKey);
     sculpting.last.copy(hit.point);invalidate();
    }
    return;
   }
   const ms=getStudio3DState().measure;
   if(ms?.a&&!ms.b){
    const p=pickMeasurePoint(e);
    if(p){mLineGeo.setFromPoints([new THREE.Vector3(ms.a.x,ms.a.y,ms.a.z),new THREE.Vector3(p.x,p.y,p.z)]);mLine.visible=true;mDotB.position.set(p.x,p.y,p.z);mDotB.visible=true;invalidate();}
   }
   if(!shiftDrag||!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)<=4)return;
   if(!marquee){marquee=document.createElement('div');marquee.style.cssText='position:fixed;pointer-events:none;border:1px dashed var(--focus-ring);background:var(--accent-soft);z-index:50';marquee.setAttribute('aria-hidden','true');document.body.appendChild(marquee);}
   const r=marqueeRect(down,{x:e.clientX,y:e.clientY});marquee.style.left=r.x0+'px';marquee.style.top=r.y0+'px';marquee.style.width=(r.x1-r.x0)+'px';marquee.style.height=(r.y1-r.y0)+'px';
  };
  const onUp=(e:PointerEvent)=>{
   if(painting){painting=false;controls.enabled=true;gizmo.enabled=true;const sel=getStudio3DState().selected;if(sel!=null)stage.skinPaintEnd(sel);down=null;return;}
   if(sculpting){stage.sculptEnd();sculpting=null;controls.enabled=true;gizmo.enabled=true;sync();down=null;return;}
   const wasShift=shiftDrag;endMarquee();
   if(justDragged){justDragged=false;down=null;return;}
   if(!down){return;}
   const start=down;down=null;const rect=renderer.domElement.getBoundingClientRect();
   if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>4){
    if(!wasShift)return;
    const box=marqueeRect(start,{x:e.clientX,y:e.clientY});const ids:number[]=[];
    holder.traverse(o=>{if(!(o as THREE.Mesh).isMesh||!chainOk(o))return;const b=new THREE.Box3().setFromObject(o);if(b.isEmpty())return;
     const p=b.getCenter(new THREE.Vector3()).project(camera);if(p.z>1)return;
     if(inRect(box,{x:rect.left+(p.x+1)/2*rect.width,y:rect.top+(1-p.y)/2*rect.height}))ids.push(o.id);});
    applySet(ids,ids.length?ids[ids.length-1]:null);return;
   }
   ray.setFromCamera(new THREE.Vector2(((e.clientX-rect.left)/rect.width)*2-1,-(((e.clientY-rect.top)/rect.height)*2-1)),camera);
   const hit=ray.intersectObject(holder,true).find(h=>(h.object as THREE.Mesh).isMesh&&chainOk(h.object));
   const target=hit?.object??null;
   const ed=getStudio3DState().edit;
   if(ed&&hit&&target&&target.id===ed.id){
    const mesh=target as THREE.Mesh;const lp=mesh.worldToLocal(hit.point.clone());
    const pos=mesh.geometry.getAttribute('position');const fi=hit.faceIndex??-1;
    if(fi>=0){
     const idx=mesh.geometry.getIndex();const a=idx?idx.getX(fi*3):fi*3,b=idx?idx.getX(fi*3+1):fi*3+1,c=idx?idx.getX(fi*3+2):fi*3+2;
     const at=(v:number)=>new THREE.Vector3().fromBufferAttribute(pos,v);
     if(ed.mode==='face')stage.editSelect('face',[fi],e.shiftKey);
     else if(ed.mode==='vertex'){const v=[[a,at(a).distanceTo(lp)],[b,at(b).distanceTo(lp)],[c,at(c).distanceTo(lp)]].sort((x,y)=>(x[1] as number)-(y[1] as number))[0][0] as number;stage.editSelect('vertex',[v],e.shiftKey);}
     else{
      const cand=([[a,b],[b,c],[c,a]] as [number,number][]).map(pr=>({e:pr,d:at(pr[0]).add(at(pr[1])).multiplyScalar(0.5).distanceTo(lp)})).sort((x,y)=>x.d-y.d)[0].e;
      stage.editSelect('edge',[cand],e.shiftKey);
     }
     patchEdit();invalidate();
    }
    down=null;return;
   }
   if(wasShift){if(target){const st=getStudio3DState();const t=toggleSelection(st.marked,st.selected,target.id);applySet(t.marked,t.selected);}return;}
   if(target){select(target.id);return;}
   // No mesh under the cursor: a visible skeleton lets clicks near a joint select that bone.
   let bone:number|null=null;
   if(skelHelper&&skelHelper.visible){
    const pts=stage.bones().map(b=>{const o=stage.find(b.id);if(!o||!chainOk(o))return null;const p=o.getWorldPosition(new THREE.Vector3());return{id:b.id,at:[p.x,p.y,p.z] as const};}).filter((x):x is{id:number;at:readonly[number,number,number]}=>x!==null);
    const r=bounds&&boundsValid(bounds)?boundsRadius(bounds):1;
    bone=pickBone(ray.ray.origin.toArray() as [number,number,number],ray.ray.direction.toArray() as [number,number,number],pts,bonePickRadius(r));
   }
   select(bone);
  };
  const onKey=(e:KeyboardEvent)=>{
   const sel=getStudio3DState().selected;
   if(!e.ctrlKey&&!e.metaKey&&!e.altKey){
    if(e.key==='w'||e.key==='W'){gizmo.setMode('translate');patchStudio3D({gizmo:'translate'});invalidate();e.preventDefault();return;}
    if(e.key==='e'||e.key==='E'){gizmo.setMode('rotate');patchStudio3D({gizmo:'rotate'});invalidate();e.preventDefault();return;}
    if(e.key==='r'||e.key==='R'){gizmo.setMode('scale');patchStudio3D({gizmo:'scale'});invalidate();e.preventDefault();return;}
    if(e.key==='f'||e.key==='F'){frameSelection();e.preventDefault();return;}
    if(e.key==='s'||e.key==='S'){const sn=getStudio3DState().snap;patchStudio3D({snap:mergeSnap(sn,{on:!sn.on})});applySnap();e.preventDefault();return;}
    if(e.key==='m'||e.key==='M'){const on=!getStudio3DState().measure;patchStudio3D({measure:on?{a:null,b:null}:null});syncMeasure();invalidate();e.preventDefault();return;}
   const slot=viewSlotIndex(e.code);
   if(slot!==null){
    const views=getStudio3DState().views;
    if(e.shiftKey){
     const name=views[slot]?.name??nextViewName(views);
     const camShot={position:[camera.position.x,camera.position.y,camera.position.z] as [number,number,number],quaternion:camera.quaternion.toArray() as [number,number,number,number],target:[controls.target.x,controls.target.y,controls.target.z] as [number,number,number]};
     patchStudio3D({views:views[slot]?updateView(views,name,camShot):[...views,{name,...camShot}],notice:t('studio3d.views.saved',{name})});
     e.preventDefault();return;
    }
    if(views[slot]){applyViewByName(views[slot].name);e.preventDefault();return;}
   }
    if(e.key==='?'){patchStudio3D({keysHelp:!getStudio3DState().keysHelp});e.preventDefault();return;}
   if(e.key==='Escape'&&getStudio3DState().keysHelp){patchStudio3D({keysHelp:false});e.preventDefault();return;}
   if(e.key==='Escape'&&getStudio3DState().measure){patchStudio3D({measure:null});syncMeasure();invalidate();e.preventDefault();return;}
    if((e.key==='Delete'||e.key==='Backspace')&&currentSet().length){deleteSelection();e.preventDefault();return;}
    const stepNow=getStudio3DState().snap.on?getStudio3DState().snap.move:0.1;const n=e.shiftKey?nudgeFor(e.key,stepNow):null;
    if(n){const ed=getStudio3DState().edit;
     if(ed!=null){if(ed.verts+ed.edges+ed.faces>0){const pr=getStudio3DState().proportional;const snp=getStudio3DState().snap;
      if(snp.on&&(snp.mode==='vertex'||snp.mode==='midpoint'))stage.editMoveSnapped([n.x??0,n.y??0,n.z??0],snp.mode,Math.max(snp.move,0.05));
      else stage.editMove([n.x??0,n.y??0,n.z??0],pr.on?{radius:pr.radius,falloff:pr.falloff,connected:pr.connected}:undefined);
      afterEditOp();}e.preventDefault();return;}
     if(sel!=null){nudgeBy(sel,n);e.preventDefault();return;}}
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
   disposed=true;opening++;stopAnim();cancelFly();if(previewRaf)cancelAnimationFrame(previewRaf);offDrop();mixer?.stopAllAction();stage.autoKeySource=null;off();offAuto();if(autoTimer)clearTimeout(autoTimer);cancelAnimationFrame(frame);ro.disconnect();controls.dispose();
   el.removeEventListener('dragover',onAssetDragOver);el.removeEventListener('drop',onAssetDrop);cv.removeEventListener('pointerdown',onDownCapture,true);cv.removeEventListener('pointerdown',onDown);window.removeEventListener('pointermove',onMove);window.removeEventListener('pointercancel',endMarquee);endMarquee();cv.removeEventListener('pointerup',onUp);cv.removeEventListener('keydown',onKey);
   if(getStudio3DState().status==='loading')patchStudio3D({status:stage.root.children.length?'ready':'idle',confirmReplace:null});
   gizmo.detach();gizmo.dispose();ikGizmo.detach();ikGizmo.dispose();poleGizmo.detach();poleGizmo.dispose();fkGizmo.detach();fkGizmo.dispose();lookGizmo.detach();lookGizmo.dispose();clearGhosts();scene.remove(ghosts);if(pathLine){pathLine.geometry.dispose();(pathLine.material as THREE.Material).dispose();pathLine=null;}fkTarget.geometry.dispose();(fkTarget.material as THREE.Material).dispose();fkLook.geometry.dispose();(fkLook.material as THREE.Material).dispose();ikTarget.geometry.dispose();(ikTarget.material as THREE.Material).dispose();ikPoleM.geometry.dispose();(ikPoleM.material as THREE.Material).dispose();offStage();clearSelection();if(painting){painting=false;}const openSel=getStudio3DState().selected;if(openSel!=null)stage.skinPaintEnd(openSel);if(lightHelper){scene.remove(lightHelper);(lightHelper as HelperObj).dispose?.();lightHelper=null;}if(skelHelper){scene.remove(skelHelper);skelHelper.geometry.dispose();(skelHelper.material as THREE.Material).dispose();skelHelper=null;}if(weightOverlay){scene.remove(weightOverlay);weightOverlay.geometry.dispose();(weightOverlay.material as THREE.Material).dispose();weightOverlay=null;}if(maskOverlay){scene.remove(maskOverlay);maskOverlay.geometry.dispose();(maskOverlay.material as THREE.Material).dispose();maskOverlay=null;}for(const h of helpers.values())h.dispose();grid.geometry.dispose();(grid.material as THREE.Material).dispose();cursorGeo.dispose();cursorMat.dispose();scene.remove(cursorMark);mLineGeo.dispose();mLineMat.dispose();mDotGeo.dispose();mDotMat.dispose();scene.remove(measureGroup);for(const t of envTargets)t.dispose();envCache.clear();pmrem.dispose();composer?.dispose();renderer.dispose();renderer.forceContextLoss();
   pinLabelHost.remove();pinLabels.clear();
   if(cv.parentNode===el)el.removeChild(cv);
  };
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 const s=useStudio3D();
 return <div className="relative flex min-h-0 flex-1 flex-col" data-testid="studio3d-viewport">
  <div ref={host} className="relative min-h-0 flex-1 overflow-hidden rounded-[25px]"/>
  {s.status==='loading'&&<StudioStatus className="pointer-events-none absolute left-4 top-3 m-0 rounded-md bg-surface px-2 py-1 text-xs" data-testid="studio3d-loading">{t('studio3d.status.loading',{name:s.name})}{s.loadPhase?` · ${t('studio3d.load.phase.'+s.loadPhase)}`:''}</StudioStatus>}
  {s.status==='error'&&<StudioStatus tone="error" live="assertive" className="absolute left-4 top-3 m-0 max-w-[80%] rounded-md bg-surface px-2 py-1 text-xs">{t('studio3d.status.error')}: {s.error}</StudioStatus>}
  {s.keysHelp&&<div className="absolute right-4 top-12 z-10 grid max-h-[80%] w-80 gap-1 overflow-auto rounded-[25px] border border-subtle bg-surface p-3" role="dialog" aria-label={t('studio3d.keys.title')} data-testid="studio3d-keys">
   <div className="flex items-center justify-between"><span className="text-xs font-semibold text-ink">{t('studio3d.keys.title')}</span>
    <Button variant="outline" className="px-1" aria-label={t('studio3d.keys.close')} onClick={()=>patchStudio3D({keysHelp:false})}><X size={13} aria-hidden/></Button></div>
   <ul className="m-0 grid list-none gap-1 p-0">{SHORTCUT_HINTS.map(h=><li key={h.labelKey} className="flex items-center gap-2 text-xs">
    <kbd className="min-w-20 rounded-sm border border-subtle px-1 py-0.5 text-center text-xs text-ink-2">{h.keys}</kbd>
    <span className="text-ink-2">{t(h.labelKey)}</span></li>)}</ul>
  </div>}
  {s.measure&&<StudioStatus className="pointer-events-none absolute right-4 top-3 m-0 rounded-md bg-surface px-2 py-1 text-xs" data-testid="studio3d-measure">{s.measure.a&&s.measure.b?formatMeasure(measureInfo(s.measure.a,s.measure.b),s.unit):t('studio3d.measure.pick')}</StudioStatus>}
  {s.perf&&<StudioStatus className="pointer-events-none absolute right-4 top-12 m-0 rounded-md bg-surface px-2 py-1 text-xs" data-testid="studio3d-perf">{formatPerf(s.perf.fps,s.perf.calls,s.perf.tris)}</StudioStatus>}
  <p className="sr-only">{t('studio3d.keys.hint')}</p>
 </div>;
}
