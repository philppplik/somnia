import {commandRegistry} from '../commandRegistry';
import {registerCommandSpec} from '../commandBridge';
import type {CommandSpec} from '../commandSpec';
import {clearRecentScenes} from './recentSession';
import {getStudio3DState,patchStudio3D} from './session';
import {SHADOW_QUALITIES,SHADOW_TYPES,isUnit,type EnvSettings,type GizmoMode,type SnapSettings,type ExportUnit,type ExportFormat,type PivotMode} from './model';
import {PARAM_SPECS,MATERIAL_PRESET_IDS} from './primitives';
import {ALPHA_MODES,TEXTURE_SLOTS,MAX_EMISSIVE_INTENSITY,type TextureSlot} from './materials';
import {type TexgenSpec} from './texgen';
import {EASES,type Ease} from './ease';
import {KEY_PATHS,type KeyPath} from './clips';
import type {KeyRef} from './keyEdit';
import type {LoopRange} from './animation';
import type {TextureTransform} from './uv';
import {VIEW_PRESETS,focalToFov,type ViewPreset} from './viewPresets';
import type {MirrorAxis,PrimitiveKind,LightKind,LightRigPreset,TransformPatch,MaterialPatch,LightPatch,AlignAxis,AlignTo,PivotAt,CameraKind} from './stage';
import type {NormalsOp} from './editMesh';
import type {Vec3} from './stage';
export interface TurntableOptions{frames?:number;width?:number;height?:number;transparent?:boolean;/** 'zip' downloads one archive; 'folder' writes the PNG frames into a folder the user picks; 'webm' records one WebM video. */out?:'zip'|'folder'|'webm';/** Frames per second of the WebM video (1-60, default 30). */fps?:number;}
export interface RenderOptions{/** id of a camera object; the viewport camera when omitted */camera?:number;width?:number;height?:number;transparent?:boolean}
/** What the lazy viewport offers. The command layer never imports three.js. */
export interface Studio3DController{
 openFiles(files:File[],force?:boolean):Promise<void>;
 newScene(force?:boolean):void;
 addPrimitive(kind:PrimitiveKind):number;
 addLight(kind:LightKind):number;
 addLightRig(preset?:LightRigPreset):number[];
 setTransform(id:number,patch:TransformPatch):void;
 setMaterial(id:number,patch:MaterialPatch):void;
 /** Insert an annotation pin at the 3D cursor or a given point; returns its id. */
 addPin(at?:{x:number;y:number;z:number}):number;
 /** Set the label text of an annotation pin. */
 setPinText(id:number,text:string):void;
 setPrimitive(id:number,patch:Record<string,number>):void;
 exportGltf(opts?:{textures?:'embed'|'external';clips?:string[]|null}):Promise<void>;
 setExportOptions(p:{textures?:'embed'|'external';clips?:string[]|null}):void;
 setTextureFile(id:number,slot:TextureSlot,file:File|null):Promise<void>;
 generateTexture(id:number,slot:TextureSlot,spec:TexgenSpec):void;
 mirrorSelection(axis:MirrorAxis,copy:boolean,ids?:number[]):number[];
 applyScale(ids?:number[]):void;
 mergeSelection(ids?:number[]):number;
 simplify(id:number,keep:number):Promise<{before:number;after:number;tris:number}>;
 symmetrize(axis:MirrorAxis,side:'positive'|'negative',merge:number,ids?:number[]):number;
 subdivide(iterations:number,ids?:number[]):number;
 cleanup(weld:number,ids?:number[]):{welded:number;facesDropped:number;vertsDropped:number;flipped:number};
 normals(op:NormalsOp,angle:number,ids?:number[]):number;
 separate(ids?:number[]):number;
 solidify(thickness:number,offset:number,ids?:number[]):number;
 fillHoles(ids?:number[]):number;
 relax(iterations:number,factor:number,ids?:number[]):number;
 fatten(amount:number,ids?:number[]):number;
 bisect(axis:'x'|'y'|'z',offset:number,fill:boolean,ids?:number[]):number;
 twist(axis:'x'|'y'|'z',degrees:number,ids?:number[]):number;
 taper(axis:'x'|'y'|'z',factor:number,ids?:number[]):number;
 spin(axis:'x'|'y'|'z',degrees:number,steps:number,center:[number,number,number],ids?:number[]):number;
 screw(axis:'x'|'y'|'z',degrees:number,steps:number,center:[number,number,number],rise:number,ids?:number[]):number;
 bridge(ids:number[],twist:number):number;
 booleanOp(op:'union'|'subtract'|'intersect',ids:number[]):number;
 remesh(resolution:number,ids:number[]):number;
 viewPreset(preset:ViewPreset):void;
 setTextureTransform(id:number,slot:TextureSlot,patch:Partial<TextureTransform>|'reset'):void;
 clipAdd(name?:string,duration?:number):number;
 clipRemove(clip?:number):void;
 clipRename(name:string,clip?:number):void;
 clipDuration(duration:number,clip?:number):void;
 keySet(path:KeyPath,time?:number,id?:number,value?:{x?:number;y?:number;z?:number}):void;
 keyRemove(path:KeyPath,time?:number,id?:number):void;
 keyMove(path:KeyPath,from:number,to:number,id?:number):void;
 keyEase(path:KeyPath,time:number,ease:Ease,id?:number):void;
 keyCopy(keys:KeyRef[],id?:number):number;
 keyPaste(time?:number,id?:number):number;
 keyShift(keys:KeyRef[],delta:number,id?:number):number;
 clipDuplicate(clip?:number):number;
 animRange(range:LoopRange|null):void;
 selectBone(id:number):void;
 setSkeleton(on:boolean):void;
 skinBind(id:number,bone:number,mode:'smooth'|'rigid'):void;
 skinRebind(id:number,mode:'smooth'|'rigid'):void;
 setWeightPreview(bone:number|null):void;
 setWeightBrush(patch:Partial<{on:boolean;mode:'add'|'subtract'|'smooth';radius:number;strength:number;falloff:'smooth'|'linear'|'constant'}>):void;
 poseSave(name:string,id?:number):void;
 poseApply(name:string,id?:number):void;
 poseRemove(name:string,id?:number):void;
 poseMirror(name:string,id?:number):void;
 poseBlend(a:string,b:string,t:number,id?:number):void;
 ikToggle(on:boolean,id?:number):void;
 ikSetTarget(p:readonly[number,number,number],id?:number):void;
 ikSetPole(p:readonly[number,number,number],id?:number):void;
 recordPose(all?:boolean,id?:number,clip?:number,time?:number):number;
 onionSkin(on?:boolean,before?:number,after?:number):void;
 motionPathToggle(on?:boolean):void;
 retargetPreview(source:number,target?:number,clip?:number):number;
 /** A 64px preview of a texture slot as a data URL, or null when the slot is empty. */
 texturePreview(id:number,slot:TextureSlot):string|null;
 retargetApply(source:number,target?:number,clip?:number,name?:string):number;
 fabrikToggle(on:boolean,id?:number):void;
 fabrikSetTarget(p:readonly[number,number,number],id?:number):void;
 fabrikLookToggle(on:boolean,id?:number):void;
 fabrikSetLook(p:readonly[number,number,number],id?:number):void;
 setBoneLimits(min:(number|null)[]|null,max:(number|null)[]|null,id?:number):void;
 paintDab(x:number,y:number,z:number,opts?:{bone?:number;mode?:'add'|'subtract'|'smooth';radius?:number;strength?:number;falloff?:'smooth'|'linear'|'constant'}):number;
 autoKey(on:boolean):void;
 animPlay(clip?:number):void;
 animPause():void;
 animSeek(time:number):void;
 animLoop(loop:boolean):void;
 animSpeed(speed:number):void;
 rename(id:number,name:string):void;
 setObjectVisible(id:number,on:boolean):void;
 setObjectLocked(id:number,on:boolean):void;
 reparent(ids:number[],parent:number|null):void;
 reorder(ids:number[],target:number,where:'before'|'after'):void;
 remove(id:number):void;
 duplicate(id:number):number;
 group(ids:number[]):number;
 ungroup(id:number):void;
 arrayDuplicate(ids:number[],spec:{mode:'linear'|'radial';count:number;offset?:Vec3;axis?:'x'|'y'|'z';angle?:number;center?:Vec3}):number[];
 editStart(id:number,mode?:'vertex'|'edge'|'face'):void;
 editEnd():void;
 editMode(mode:'vertex'|'edge'|'face'):void;
 editSelect(kind:'vertex'|'edge'|'face',ids:(number|[number,number])[],toggle?:boolean):void;
 editSelectAll(op:'all'|'none'|'invert',kind?:'vertex'|'edge'|'face'):void;
 editSelectBoundary(kind?:'vertex'|'edge'):void;
 editSelectLinked(kind?:'vertex'|'edge'|'face'):void;
 editSelectGrow(steps?:number,shrink?:boolean,kind?:'vertex'|'edge'|'face'):void;
 editDelete(kind?:'vertex'|'edge'|'face'):void;
 editWeld():void;
 editSubdivide():void;
 editPoke():void;
 editDuplicate():void;
 editFatten(amount:number):void;
 editRelax(iterations:number,factor:number):void;
 editFlip():void;
 editDissolve():void;
 editFill():void;
 editCollapse():void;
 editToSphere(factor:number):void;
 editRandomize(amount:number,seed:number):void;
 editMove(offset:[number,number,number]):void;
 editRip():void;
 editSeparate():void;
 editSelectSharp(degrees?:number):void;
 editRotate(axis:'x'|'y'|'z',degrees:number):void;
 editScale(factors:[number,number,number]):void;
 editSelectSimilar(degrees?:number):void;
 editSelectFacing(dir?:'+x'|'-x'|'+y'|'-y'|'+z'|'-z',degrees?:number):void;
 editShear(along:'x'|'y'|'z',by:'x'|'y'|'z',factor:number):void;
 editFlipEdge():void;
 editMergeByDistance(distance:number):void;
 editBisect(axis:'x'|'y'|'z',offset:number,fill:boolean):void;
 editKnife(px:number,py:number,pz:number,nx:number,ny:number,nz:number):void;
 editSelectPath(from:number,to:number,kind:'vertex'|'edge'):void;
 editSelectChecker(kind:'vertex'|'edge'|'face',nth:number,offset:number):void;
 editSelectRandom(kind:'vertex'|'edge'|'face',ratio:number,seed:number):void;
 editSelectMirror(axis:'x'|'y'|'z',extend:boolean):void;
 editSelectLoop():void;
 editSelectRing():void;
 editBridgeFaces(twist:number):void;
 editVertSlide(edge:[number,number],factor:number):void;
 editConvexHull():void;
 editSymmetrize(axis:MirrorAxis,side:'positive'|'negative',merge:number):void;
 editShrinkwrap(target:number,offset:number):void;
 editExtrude(offset:number):void;
 editExtrudeIndividual(offset:number):void;
 editInset(amount:number):void;
 editBevel(width:number):void;
 editLoopCut():void;
 editBevelEdge(width:number,segments?:number):void;
 editLoopSlide(factor:number):void;
 mirrorMod(id:number,axis:'x'|'y'|'z',merge:number,on:boolean,bisect?:boolean):void;
 bend(axis:'x'|'y'|'z',degrees:number,ids?:number[]):number;
 sculptMaskClear(id:number):void;
 sculptMaskInvert(id:number):void;
 sculptMaskGrow(id:number,steps?:number):void;
 sculptMaskFromSelection():void;
 sculptMaskSmooth(id:number,amount?:number):void;
 editMaskToSelection(threshold?:number):void;
 uvSeamMark(mark:boolean):void;
 uvUnwrap(id:number,opts?:{method?:'box'|'angle';pack?:boolean;padding?:number}):void;
 uvPlanar(id:number,axis:'x'|'y'|'z'):void;
 setUvChecker(on:boolean):void;
 sculptBrush(patch:Partial<{on:boolean;brush:'grab'|'smooth'|'inflate'|'crease'|'pinch'|'flatten'|'mask';radius:number;strength:number;falloff:'smooth'|'linear'|'constant';symmetry:'none'|'x'|'y'|'z'}>):void;
 sculptBegin(id:number):void;
 sculptDab(id:number,center:[number,number,number],delta?:[number,number,number],erase?:boolean):void;
 sculptEnd():void;
 addCamera(fromView:boolean,kind?:CameraKind):number;
 setCamera(id:number,patch:{fov?:number;zoom?:number}):void;
 /** Switch the viewport between perspective and orthographic (view state). */
 setProjection(kind:CameraKind):void;
 /** Shadow map quality and algorithm for the viewport (render state). */
 setShadows(patch:{quality?:string;type?:string}):void;
 /** Show or hide the selected light's viewport helper. */
 setLightHelpers(on:boolean):void;
 /** Ambient occlusion preview (viewport only). */
 setAo(patch:{on?:boolean;strength?:number}):void;
 /** Live FPS/draw-call/triangle overlay (render state). */
 setPerf(on:boolean):void;
 /** Set the viewport perspective field of view in degrees (view state). */
 setViewFov(fov:number):void;
 /** Start or stop the turntable preview; returns the new state (view only, never exported). */
 setTurntable(on:boolean):boolean;
 viewSave(name?:string):string;
 viewApply(name:string):void;
 viewRemove(name:string):void;
 viewUpdate(name:string):void;
 viewRename(name:string,to:string):void;
 /** Saves the material of a mesh (id or the selected one) as a named local preset. */
 materialPresetSave(name:string,id?:number):void;
 /** Applies a local or built-in material preset to a mesh; one undo step. */
 materialPresetApply(id:number,name:string):void;
 /** Deletes a local material preset. */
 materialPresetRemove(name:string):void;
 /** Copies the material of a mesh (id or the selected one) into the session clipboard. */
 materialCopy(id?:number):void;
 /** Pastes the clipboard material onto a mesh with one undo step. */
 materialPaste(id?:number):void;
 viewFromCamera(id:number):void;
 setGizmo(mode:GizmoMode):void;
 nudge(id:number,delta:{x?:number;y?:number;z?:number}):void;
 setEnv(patch:Partial<EnvSettings>):void;
 openEnvFile(file:File):Promise<void>;
 undo():boolean;
 redo():boolean;
 resetView():void;
 frameSelection():void;
 setGrid(on:boolean):void;
 setWireframe(on:boolean):void;
 select(id:number|null):void;
 setLight(id:number,patch:LightPatch):void;
 setPivot(id:number,at:PivotAt):void;
 align(ids:number[],axis:AlignAxis,to:AlignTo):void;
 snapToGround(ids:number[]):number;
 moveCenterTo(ids:number[],at:[number,number,number]):number;
 moveEachTo(ids:number[],at:[number,number,number]):number;
 randomizeTransform(ids:number[],seed:number,move:number,rotate:number,scale:number):number;
 distribute(ids:number[],axis:AlignAxis):void;
 setSnap(patch:Partial<SnapSettings>):void;
 setPivotMode(mode:PivotMode):void;
 setCursor(p:Vec3):void;
 cursorToSelection():void;
 setMeasure(on:boolean):void;
 renderStill(opts?:RenderOptions):Promise<void>;
 exportGlb(opts?:{clips?:string[]|null}):Promise<void>;
 save(sidecar?:boolean,embedEnv?:boolean):Promise<void>;
 deleteSelection(ids?:number[]):void;
 duplicateSelection(ids?:number[]):number[];
 exportMesh(format:Exclude<ExportFormat,'glb'>):Promise<void>;
 setUnit(unit:ExportUnit):void;
 renderTurntable(opts?:TurntableOptions):Promise<void>;
 cancelRender():void;
}
let controller:Studio3DController|null=null;
export function registerStudio3DController(next:Studio3DController){controller=next;return()=>{if(controller===next)controller=null;};}
export const studio3DController=()=>controller;
let opener:(()=>void)|null=null;
let envOpener:(()=>void)|null=null;
let textureOpener:((slot:TextureSlot)=>void)|null=null;
let textureDrop:((slot:TextureSlot,file:File)=>void)|null=null;
/** The canvas owns the image file dialog (user gesture). */
export function registerStudio3DTextureOpener(open:(slot:TextureSlot)=>void){textureOpener=open;return()=>{if(textureOpener===open)textureOpener=null;};}
export function registerStudio3DTextureDrop(handler:(slot:TextureSlot,file:File)=>void){textureDrop=handler;return()=>{if(textureDrop===handler)textureDrop=null;};}
/** A dropped image file goes through the same checked path as the file picker. Returns false when no viewport is listening. */
export const dropTextureFile=(slot:TextureSlot,file:File):boolean=>{if(!textureDrop)return false;textureDrop(slot,file);return true;};
let recentOpener:((id:string)=>Promise<void>)|null=null;
/** The canvas owns opening a stored scene, so a request from the start screen waits for the viewport. */
export function registerStudio3DRecentOpener(open:(id:string)=>Promise<void>){recentOpener=open;return()=>{if(recentOpener===open)recentOpener=null;};}
export function registerStudio3DEnvOpener(open:()=>void){envOpener=open;return()=>{if(envOpener===open)envOpener=null;};}
/** The canvas owns the file dialog (user gesture). */
export function registerStudio3DOpener(open:()=>void){opener=open;return()=>{if(opener===open)opener=null;};}
const VEC={type:'object',properties:{x:{type:'number'},y:{type:'number'},z:{type:'number'}},additionalProperties:false,minProperties:1};
/** Every primitive setting name with its widest range. The stage checks the range of the actual primitive. */
const PRIMITIVE_PROPS:Record<string,unknown>=Object.fromEntries(Object.values(PARAM_SPECS).flat().map(p=>[p.id,{type:p.integer?'integer':'number',minimum:p.min,maximum:p.max}]));
const hasClips=()=>hasScene()&&getStudio3DState().clips.length>0;
const hasKeys=()=>hasScene()&&getStudio3DState().selected!=null&&getStudio3DState().clips.length>0;
const hasBones=()=>hasScene()&&getStudio3DState().bones.length>0;
const hasPlainMesh=()=>hasBones()&&getStudio3DState().selectedInfo?.kind==='mesh'&&!getStudio3DState().selectedInfo?.skinned;
const hasSkinnedMesh=()=>hasBones()&&getStudio3DState().selectedInfo?.skinned===true;
const KEYREFS={type:'array',items:{type:'object',properties:{path:{enum:['position','rotation','scale']},time:{type:'number',minimum:0,maximum:3600}},required:['path','time'],additionalProperties:false},minItems:1,maxItems:6000};
const hasScene=()=>!!controller&&getStudio3DState().status==='ready';
const object=(properties:Record<string,unknown>,required=Object.keys(properties))=>({type:'object',properties,required,additionalProperties:false});
export function studio3DCommandSpecs():CommandSpec<unknown,unknown>[]{
 const add=<P,>(id:string,title:string,category:CommandSpec['category'],run:(p:P)=>unknown,schema:Record<string,unknown>=object({},[]),enabled:()=>boolean=hasScene):CommandSpec<P,unknown>=>({id,title,category,level:'ui',keywords:['3d','model','scene','gltf'],params:schema,enabled,run});
 const need=()=>{if(!controller)throw Object.assign(new Error('The 3D viewport is not ready.'),{expected:true});return controller;};
 return [
  add('studio3d.model.open','Open 3D model','Project',()=>opener!(),undefined,()=>!!opener),
  add('studio3d.scene.new','Create blank 3D scene','Project',()=>need().newScene(),undefined,()=>!!controller),
  add('studio3d.view.reset','Reset 3D view','View',()=>need().resetView()),
  add('studio3d.view.frame','Frame selection in 3D view','View',()=>need().frameSelection()),
  add<{on?:boolean}>('studio3d.view.grid','Show or hide the 3D grid','View',p=>need().setGrid(p?.on??!getStudio3DState().grid),object({on:{type:'boolean'}},[]),()=>!!controller),
  add<{on?:boolean}>('studio3d.view.wireframe','Show or hide wireframe','View',p=>need().setWireframe(p?.on??!getStudio3DState().wireframe),object({on:{type:'boolean'}},[])),
  add<{id:number|null}>('studio3d.select','Select a 3D object','Edit',p=>need().select(p.id),object({id:{anyOf:[{type:'null'},{type:'integer',minimum:0}]}})),
  add<{kind:PrimitiveKind}>('studio3d.insert.primitive','Insert a 3D primitive','Insert',p=>need().addPrimitive(p.kind),object({kind:{enum:['cube','sphere','plane','cylinder','cone','torus']}}),()=>!!controller),
  add<{x?:number;y?:number;z?:number}>('studio3d.insert.pin','Insert an annotation pin at the 3D cursor or a given point','Insert',p=>{need().addPin([p?.x,p?.y,p?.z].every(v=>typeof v==='number')?{x:p!.x!,y:p!.y!,z:p!.z!}:undefined);},object({x:{type:'number'},y:{type:'number'},z:{type:'number'}},[]),()=>!!controller),
  add<{id:number;text?:string}>('studio3d.pin.set','Set the label text of an annotation pin','Edit',p=>need().setPinText(p.id,p.text??''),object({id:{type:'integer',minimum:0},text:{type:'string',maxLength:400}},['id']),hasScene),
  add<{kind:LightKind}>('studio3d.insert.light','Insert a 3D light','Insert',p=>need().addLight(p.kind),object({kind:{enum:['directional','point','spot','area','ambient']}}),()=>!!controller),
  add<{preset?:LightRigPreset}>('studio3d.light.rig','Insert a light rig aimed at the scene','Insert',p=>need().addLightRig(p?.preset),object({preset:{enum:['three-point','studio','sunset','outdoor']}},[]),()=>!!controller),
  add<{id:number;position?:object;rotation?:object;scale?:object}>('studio3d.object.transform','Move, rotate or scale a 3D object','Edit',p=>need().setTransform(p.id,p as TransformPatch),object({id:{type:'integer',minimum:0},position:VEC,rotation:VEC,scale:VEC},['id']),hasScene),
  add<{id:number;preset?:string;color?:string;metalness?:number;roughness?:number;emissive?:string;emissiveIntensity?:number;opacity?:number;alphaMode?:string;alphaCutoff?:number;doubleSided?:boolean}>('studio3d.object.material','Change the material of a 3D object','Edit',p=>need().setMaterial(p.id,p as never),object({id:{type:'integer',minimum:0},preset:{enum:MATERIAL_PRESET_IDS},emissive:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'},emissiveIntensity:{type:'number',minimum:0,maximum:MAX_EMISSIVE_INTENSITY},opacity:{type:'number',minimum:0,maximum:1},alphaMode:{enum:[...ALPHA_MODES]},alphaCutoff:{type:'number',minimum:0,maximum:1},doubleSided:{type:'boolean'},color:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'},metalness:{type:'number',minimum:0,maximum:1},roughness:{type:'number',minimum:0,maximum:1}},['id']),hasScene),
  add<{id:number}&Record<string,number>>('studio3d.object.primitive','Change the size or segments of a 3D primitive','Edit',({id,...rest})=>need().setPrimitive(id,rest),object({id:{type:'integer',minimum:0},...PRIMITIVE_PROPS},['id']),hasScene),
  add<{id:number;name:string}>('studio3d.object.rename','Rename a 3D object','Edit',p=>need().rename(p.id,p.name),object({id:{type:'integer',minimum:0},name:{type:'string',minLength:1,maxLength:120}}),hasScene),
  add<{id:number}>('studio3d.object.delete','Delete a 3D object','Edit',p=>need().remove(p.id),object({id:{type:'integer',minimum:0}}),hasScene),
  add<{id:number}>('studio3d.object.duplicate','Duplicate a 3D object','Edit',p=>need().duplicate(p.id),object({id:{type:'integer',minimum:0}}),hasScene),
  add<{id?:number;on?:boolean}>('studio3d.object.visible','Show or hide a 3D object in the scene','Edit',p=>{const id=p.id??getStudio3DState().selected;if(id==null)throw new Error('Select an object first.');const cur=getStudio3DState().outline.find(o=>o.id===id);need().setObjectVisible(id,p.on??(cur?cur.hidden:false));},object({id:{type:'integer',minimum:0},on:{type:'boolean'}},[]),hasScene),
  add<{id?:number;on?:boolean}>('studio3d.object.locked','Lock or unlock a 3D object against viewport selection','Edit',p=>{const id=p.id??getStudio3DState().selected;if(id==null)throw new Error('Select an object first.');const cur=getStudio3DState().outline.find(o=>o.id===id);need().setObjectLocked(id,p.on??(cur?!cur.locked:false));},object({id:{type:'integer',minimum:0},on:{type:'boolean'}},[]),hasScene),
  add<{ids:number[];parent:number|null}>('studio3d.object.reparent','Move 3D objects under a new parent, keeping their world transforms','Edit',p=>need().reparent(p.ids,p.parent),object({ids:{type:'array',items:{type:'integer',minimum:0},minItems:1,maxItems:500},parent:{anyOf:[{type:'null'},{type:'integer',minimum:0}]}},['ids','parent']),hasScene),
  add<{ids:number[];target:number;where:'before'|'after'}>('studio3d.object.reorder','Move 3D objects next to a sibling in the outline','Edit',p=>need().reorder(p.ids,p.target,p.where),object({ids:{type:'array',items:{type:'integer',minimum:0},minItems:1,maxItems:500},target:{type:'integer',minimum:0},where:{enum:['before','after']}},['ids','target','where']),hasScene),
  add<{ids:number[]}>('studio3d.group','Group 3D objects under a new parent','Edit',p=>{need().group(p.ids);},object({ids:{type:'array',items:{type:'integer',minimum:0},minItems:2,maxItems:500}}),hasScene),
  add<{id:number}>('studio3d.ungroup','Dissolve a 3D group, keeping its children','Edit',p=>need().ungroup(p.id),object({id:{type:'integer',minimum:0}}),hasScene),
  add<{ids:number[];mode:'linear'|'radial';count:number;dx?:number;dy?:number;dz?:number;axis?:'x'|'y'|'z';angle?:number;cx?:number;cy?:number;cz?:number}>('studio3d.object.array','Duplicate 3D objects as a linear or radial array','Edit',
   p=>need().arrayDuplicate(p.ids,{mode:p.mode,count:p.count,offset:p.mode==='linear'?{x:p.dx??0,y:p.dy??0,z:p.dz??0}:undefined,axis:p.axis,angle:p.angle,center:p.mode==='radial'?{x:p.cx??0,y:p.cy??0,z:p.cz??0}:undefined}),
   object({ids:{type:'array',items:{type:'integer',minimum:0},minItems:1,maxItems:500},mode:{enum:['linear','radial']},count:{type:'integer',minimum:2,maximum:100},dx:{type:'number',minimum:-1000,maximum:1000},dy:{type:'number',minimum:-1000,maximum:1000},dz:{type:'number',minimum:-1000,maximum:1000},axis:{enum:['x','y','z']},angle:{type:'number',minimum:-360,maximum:360},cx:{type:'number',minimum:-10000,maximum:10000},cy:{type:'number',minimum:-10000,maximum:10000},cz:{type:'number',minimum:-10000,maximum:10000}},['ids','mode','count']),hasScene),
  add<{fromView?:boolean;kind?:CameraKind}>('studio3d.insert.camera','Insert a 3D camera (perspective or orthographic)','Insert',p=>need().addCamera(!!p?.fromView,p?.kind),object({fromView:{type:'boolean'},kind:{enum:['perspective','orthographic']}},[]),()=>!!controller),
  add<{id:number;fov?:number;zoom?:number}>('studio3d.camera.set','Change the field of view (perspective) or zoom (orthographic) of a 3D camera','Edit',p=>need().setCamera(p.id,{fov:p.fov,zoom:p.zoom}),object({id:{type:'integer',minimum:0},fov:{type:'number',minimum:1,maximum:120},zoom:{type:'number',minimum:0.01,maximum:100}},['id']),hasScene),
  add<{quality?:string;type?:string}>('studio3d.shadow.set','Set the shadow map quality (off, low, medium, high) and algorithm (VSM or PCF)','Edit',p=>need().setShadows({quality:p.quality,type:p.type}),object({quality:{enum:[...SHADOW_QUALITIES]},type:{enum:[...SHADOW_TYPES]}},[]),()=>!!controller),
  add<{on?:boolean}>('studio3d.light.helpers','Show or hide the viewport helper of the selected light','View',p=>need().setLightHelpers(p?.on??!getStudio3DState().lightHelpers),object({on:{type:'boolean'}},[]),()=>!!controller),
  add<{on?:boolean}>('studio3d.view.keys','Show or hide the 3D keyboard shortcut help','View',p=>patchStudio3D({keysHelp:p?.on??!getStudio3DState().keysHelp}),object({on:{type:'boolean'}},[]),()=>!!controller),
  add<{on?:boolean}>('studio3d.view.perf','Show or hide the live FPS, draw-call and triangle overlay','View',p=>need().setPerf(p?.on??!getStudio3DState().perf),object({on:{type:'boolean'}},[]),()=>!!controller),
  add<{on?:boolean;strength?:number}>('studio3d.view.ao','Switch the ambient occlusion preview on or off (viewport only, never exported)','View',p=>need().setAo({on:p?.on??!getStudio3DState().ao.on,strength:p?.strength}),object({on:{type:'boolean'},strength:{type:'number',minimum:0,maximum:1}},[]),()=>!!controller),
  add<{kind?:CameraKind}>('studio3d.view.projection','Switch the 3D viewport between perspective and orthographic','View',p=>need().setProjection(p?.kind==='orthographic'?'orthographic':p?.kind==='perspective'?'perspective':getStudio3DState().viewKind==='perspective'?'orthographic':'perspective'),object({kind:{enum:['perspective','orthographic']}},[]),()=>!!controller),
  add<{fov?:number;mm?:number}>('studio3d.view.fov','Set the viewport field of view (degrees) or 35mm-equivalent focal length','View',p=>{if(p.mm!==undefined)need().setViewFov(focalToFov(p.mm));else if(p.fov!==undefined)need().setViewFov(p.fov);else throw new Error('Pass fov or mm.');},object({fov:{type:'number',minimum:1,maximum:120},mm:{type:'number',minimum:3,maximum:1400}},[]),()=>!!controller),
  add<{on?:boolean}>('studio3d.view.turntable','Start or stop the turntable preview of the 3D viewport (view only, never exported)','View',p=>{need().setTurntable(p?.on??!getStudio3DState().turntable);},object({on:{type:'boolean'}},[]),hasScene),
  add<{name?:string}>('studio3d.view.save','Save the current viewport as a named view','View',p=>{need().viewSave(p?.name);},object({name:{type:'string',maxLength:60}},[]),hasScene),
  add<{name:string}>('studio3d.view.apply','Look at the scene from a saved named view','View',p=>need().viewApply(p.name),object({name:{type:'string'}}),hasScene),
  add<{name:string}>('studio3d.view.update','Overwrite a saved view with the current viewport','View',p=>{need().viewUpdate(p.name);},object({name:{type:'string'}}),hasScene),
  add<{name:string;to:string}>('studio3d.view.rename','Rename a saved view','View',p=>{need().viewRename(p.name,p.to);},object({name:{type:'string'},to:{type:'string',maxLength:60}}),hasScene),
  add<{name:string}>('studio3d.view.remove','Delete a saved named view','View',p=>need().viewRemove(p.name),object({name:{type:'string'}}),hasScene),
  add<{name:string;id?:number}>('studio3d.material.preset.save','Save the material of a 3D mesh as a local material preset','Edit',p=>need().materialPresetSave(p.name,p?.id),object({name:{type:'string',minLength:1,maxLength:60},id:{type:'integer',minimum:0}},['name']),hasScene),
  add<{id:number;name:string}>('studio3d.material.preset.apply','Apply a local or built-in material preset to a 3D mesh','Edit',p=>need().materialPresetApply(p.id,p.name),object({id:{type:'integer',minimum:0},name:{type:'string',minLength:1,maxLength:60}}),hasScene),
  add<{name:string}>('studio3d.material.preset.remove','Delete a local material preset','Edit',p=>need().materialPresetRemove(p.name),object({name:{type:'string',minLength:1,maxLength:60}}),hasScene),
  add<{id?:number}>('studio3d.material.copy','Copy the material of a 3D object','Edit',p=>need().materialCopy(p?.id),object({id:{type:'integer',minimum:0}},[]),hasScene),
  add<{id?:number}>('studio3d.material.paste','Paste the copied material onto a 3D object','Edit',p=>need().materialPaste(p?.id),object({id:{type:'integer',minimum:0}},[]),hasScene),
  add<{id:number}>('studio3d.view.fromCamera','Look through a 3D camera','View',p=>need().viewFromCamera(p.id),object({id:{type:'integer',minimum:0}}),hasScene),
  add<{mode:GizmoMode}>('studio3d.gizmo.mode','Set the 3D transform tool','Tools',p=>need().setGizmo(p.mode),object({mode:{enum:['translate','rotate','scale']}}),()=>!!controller),
  add<{id:number;x?:number;y?:number;z?:number}>('studio3d.object.nudge','Nudge a 3D object','Edit',p=>need().nudge(p.id,p),object({id:{type:'integer',minimum:0},x:{type:'number'},y:{type:'number'},z:{type:'number'}},['id']),hasScene),
  add<Partial<EnvSettings>>('studio3d.env.set','Change the 3D environment lighting','View',p=>need().setEnv(p??{}),object({preset:{enum:['studio','outdoor','sky','dark','neutral','none','custom']},intensity:{type:'number',minimum:0,maximum:3},rotation:{type:'number',minimum:-360,maximum:360},background:{type:'boolean'},bg:{enum:['default','env','color','gradient']},bgColor:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'},bgColor2:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'}},[]),()=>!!controller),
  add('studio3d.env.open','Open an HDR environment map','View',()=>envOpener!(),undefined,()=>!!controller&&!!envOpener),
  add<{count?:number}>('studio3d.undo','Undo 3D change','Edit',p=>{const n=p?.count??1;for(let i=0;i<n;i++)need().undo();},object({count:{type:'integer',minimum:1,maximum:100}},[]),()=>!!controller&&getStudio3DState().canUndo),
  add<{count?:number}>('studio3d.redo','Redo 3D change','Edit',p=>{const n=p?.count??1;for(let i=0;i<n;i++)need().redo();},object({count:{type:'integer',minimum:1,maximum:100}},[]),()=>!!controller&&getStudio3DState().canRedo),
  add<{id:number}&LightPatch>('studio3d.light.set','Change a 3D light','Edit',p=>need().setLight(p.id,p),object({id:{type:'integer',minimum:0},intensity:{type:'number',minimum:0,maximum:100000},color:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'},shadow:{type:'boolean'},radius:{type:'number',minimum:0,maximum:50},angle:{type:'number',minimum:1,maximum:90},penumbra:{type:'number',minimum:0,maximum:1},width:{type:'number',minimum:0.01,maximum:1000},height:{type:'number',minimum:0.01,maximum:1000}},['id']),hasScene),
  add<{id:number;mode?:'vertex'|'edge'|'face'}>('studio3d.edit.start','Start editing a 3D mesh (vertex, edge or face mode)','Edit',p=>need().editStart(p.id,p?.mode),object({id:{type:'integer',minimum:0},mode:{enum:['vertex','edge','face']}},['id']),hasScene),
  add('studio3d.edit.end','Leave mesh edit mode','Edit',()=>need().editEnd(),undefined,()=>getStudio3DState().edit!=null),
  add<{mode:'vertex'|'edge'|'face'}>('studio3d.edit.mode','Switch the mesh edit selection mode','Edit',p=>need().editMode(p.mode),object({mode:{enum:['vertex','edge','face']}}),()=>getStudio3DState().edit!=null),
  add<{kind:'vertex'|'edge'|'face';ids?:number[];edges?:[number,number][];toggle?:boolean}>('studio3d.edit.select','Select vertices, edges or faces of the edited 3D mesh','Edit',p=>need().editSelect(p.kind,p.kind==='edge'?(p.edges??[]):(p.ids??[]),!!p.toggle),object({kind:{enum:['vertex','edge','face']},ids:{type:'array',items:{type:'integer',minimum:0},maxItems:10000},edges:{type:'array',items:{type:'array',items:{type:'integer',minimum:0},minItems:2,maxItems:2},maxItems:10000},toggle:{type:'boolean'}},['kind']),()=>getStudio3DState().edit!=null),
  add<{op:'all'|'none'|'invert';kind?:'vertex'|'edge'|'face'}>('studio3d.edit.selectAll','Select all, no or the inverse of the edited 3D mesh elements','Edit',p=>need().editSelectAll(p.op,p.kind),object({op:{enum:['all','none','invert']},kind:{enum:['vertex','edge','face']}},['op']),()=>getStudio3DState().edit!=null),
  add<{kind?:'vertex'|'edge'}>('studio3d.edit.selectBoundary','Select the boundary edges or vertices of the edited 3D mesh','Edit',p=>need().editSelectBoundary(p.kind),object({kind:{enum:['vertex','edge']}},[]),()=>getStudio3DState().edit!=null),
  add<{kind?:'vertex'|'edge'|'face'}>('studio3d.edit.selectLinked','Select everything topologically linked to the current selection of the edited 3D mesh','Edit',p=>need().editSelectLinked(p.kind),object({kind:{enum:['vertex','edge','face']}},[]),()=>getStudio3DState().edit!=null),
  add<{steps?:number;shrink?:boolean;kind?:'vertex'|'edge'|'face'}>('studio3d.edit.selectGrow','Grow or shrink the edited 3D mesh selection to neighbouring elements','Edit',p=>need().editSelectGrow(p?.steps,p?.shrink,p?.kind),object({steps:{type:'integer',minimum:1,maximum:64},shrink:{type:'boolean'},kind:{enum:['vertex','edge','face']}},[]),()=>getStudio3DState().edit!=null),
  add<{kind?:'vertex'|'edge'|'face'}>('studio3d.edit.delete','Delete the selected elements of the edited 3D mesh','Edit',p=>need().editDelete(p?.kind),object({kind:{enum:['vertex','edge','face']}},[]),()=>getStudio3DState().edit!=null),
  add('studio3d.edit.weld','Merge the selected vertices of the edited 3D mesh at their centre','Edit',()=>need().editWeld(),undefined,()=>getStudio3DState().edit!=null),
  add('studio3d.edit.subdivide','Split each selected triangle of the edited 3D mesh into four by edge midpoints','Edit',()=>need().editSubdivide(),undefined,()=>getStudio3DState().edit!=null),
  add('studio3d.edit.poke','Split each selected triangle of the edited 3D mesh into three at its centroid','Edit',()=>need().editPoke(),undefined,()=>getStudio3DState().edit!=null),
  add('studio3d.edit.duplicate','Duplicate the selected triangles of the edited 3D mesh as a detached shell','Edit',()=>need().editDuplicate(),undefined,()=>getStudio3DState().edit!=null),
  add<{amount?:number}>('studio3d.edit.fatten','Move the selected vertices of the edited 3D mesh along their normals (negative shrinks)','Edit',p=>need().editFatten(p?.amount??0.1),object({amount:{type:'number',minimum:-1000,maximum:1000}},[]),()=>getStudio3DState().edit!=null),
  add<{iterations?:number;factor?:number}>('studio3d.edit.relax','Smooth the selected vertices of the edited 3D mesh towards their neighbourhood average','Edit',p=>need().editRelax(p?.iterations??1,p?.factor??0.5),object({iterations:{type:'integer',minimum:1,maximum:50},factor:{type:'number',exclusiveMinimum:0,maximum:1}},[]),()=>getStudio3DState().edit!=null),
  add('studio3d.edit.flip','Flip the normals of the selected triangles of the edited 3D mesh','Edit',()=>need().editFlip(),undefined,()=>getStudio3DState().edit!=null),
  add('studio3d.edit.dissolve','Merge the selected triangles of the edited 3D mesh into one face, dropping interior edges and vertices','Edit',()=>need().editDissolve(),undefined,()=>getStudio3DState().edit!=null),
  add('studio3d.edit.fill','Fill the selected closed edge loop of the edited 3D mesh with a centroid triangle fan','Edit',()=>need().editFill(),undefined,()=>getStudio3DState().edit!=null),
  add('studio3d.edit.collapse','Collapse each connected island of the selection of the edited 3D mesh into one vertex at its centroid','Edit',()=>need().editCollapse(),undefined,()=>getStudio3DState().edit!=null),
  add<{factor?:number}>('studio3d.edit.toSphere','Pull the selected vertices of the edited 3D mesh onto a sphere around their centroid','Edit',p=>need().editToSphere(p?.factor??1),object({factor:{type:'number',minimum:-100,maximum:100}},[]),()=>getStudio3DState().edit!=null),
  add<{amount?:number;seed?:number}>('studio3d.edit.randomize','Jitter the selected vertices of the edited 3D mesh by a seeded random displacement','Edit',p=>need().editRandomize(p?.amount??0.1,p?.seed??1),object({amount:{type:'number',minimum:-1000000,maximum:1000000},seed:{type:'integer',minimum:1,maximum:1000000000}},[]),()=>getStudio3DState().edit!=null),
  add<{x?:number;y?:number;z?:number}>('studio3d.edit.move','Move the selected vertices of the edited 3D mesh by an offset','Edit',p=>need().editMove([p?.x??0,p?.y??0,p?.z??0]),object({x:{type:'number',minimum:-1000000,maximum:1000000},y:{type:'number',minimum:-1000000,maximum:1000000},z:{type:'number',minimum:-1000000,maximum:1000000}},[]),()=>getStudio3DState().edit!=null),
  add('studio3d.edit.rip','Rip the selected faces of the edited 3D mesh off the rest by duplicating the shared vertices','Edit',()=>need().editRip(),undefined,()=>getStudio3DState().edit!=null),
  add('studio3d.edit.separate','Split the selected faces of the edited 3D mesh out into a new object','Edit',()=>need().editSeparate(),undefined,()=>getStudio3DState().edit!=null),
  add('studio3d.edit.selectLoop','Extend the selected edges of the edited 3D mesh to their full edge loops','Edit',()=>need().editSelectLoop(),undefined,()=>getStudio3DState().edit!=null),
  add('studio3d.edit.selectRing','Extend the selected edges of the edited 3D mesh to their full edge rings','Edit',()=>need().editSelectRing(),undefined,()=>getStudio3DState().edit!=null),
  add<{twist?:number}>('studio3d.edit.bridgeFaces','Bridge the borders of two selected face groups of the edited 3D mesh with a sewn triangle strip','Edit',p=>need().editBridgeFaces(p?.twist??0),object({twist:{type:'integer',minimum:-64,maximum:64}},[]),()=>getStudio3DState().edit!=null),
  add<{edge?:[number,number];factor?:number}>('studio3d.edit.vertSlide','Slide the selected vertex of the edited 3D mesh along an incident edge by a factor of the edge vector','Edit',p=>need().editVertSlide(p.edge,p?.factor??0.5),object({edge:{type:'array',items:{type:'integer',minimum:0},minItems:2,maxItems:2},factor:{type:'number',minimum:-1,maximum:1}},['edge']),()=>getStudio3DState().edit!=null),
  add('studio3d.edit.convexHull','Replace the edited 3D mesh with the convex hull of its selected vertices','Edit',()=>need().editConvexHull(),undefined,()=>getStudio3DState().edit!=null),
  add<{axis:MirrorAxis;side?:'positive'|'negative';merge?:number}>('studio3d.edit.symmetrize','Bake a mirror symmetry into the edited 3D mesh: keep one side of the local mirror plane, mirror it onto the other and weld the seam','Edit',p=>need().editSymmetrize(p.axis,p?.side??'positive',p?.merge??0.0001),object({axis:{enum:['x','y','z']},side:{enum:['positive','negative']},merge:{type:'number',minimum:0,maximum:1000}},['axis']),()=>getStudio3DState().edit!=null),
  add<{target?:number;offset?:number}>('studio3d.edit.shrinkwrap','Project the selected vertices of the edited 3D mesh onto the closest surface of another mesh','Edit',p=>need().editShrinkwrap(p.target,p?.offset??0),object({target:{type:'integer',minimum:0},offset:{type:'number',minimum:-1000000,maximum:1000000}},['target']),()=>getStudio3DState().edit!=null),
  add<{axis?:'x'|'y'|'z';offset?:number;fill?:boolean}>('studio3d.edit.bisect','Cut the edited 3D mesh by an axis plane and keep both halves','Edit',p=>need().editBisect(p?.axis??'y',p?.offset??0,p?.fill??true),object({axis:{enum:['x','y','z']},offset:{type:'number',minimum:-1000000000,maximum:1000000000},fill:{type:'boolean'}},[]),()=>getStudio3DState().edit!=null),
  add<{x?:number;y?:number;z?:number;nx?:number;ny?:number;nz?:number}>('studio3d.edit.knife','Slice the selected faces of the edited 3D mesh with a free plane and keep both sides connected','Edit',p=>need().editKnife(p?.x??0,p?.y??0,p?.z??0,p?.nx??0,p?.ny??1,p?.nz??0),object({x:{type:'number',minimum:-1000000000,maximum:1000000000},y:{type:'number',minimum:-1000000000,maximum:1000000000},z:{type:'number',minimum:-1000000000,maximum:1000000000},nx:{type:'number',minimum:-1000000,maximum:1000000},ny:{type:'number',minimum:-1000000,maximum:1000000},nz:{type:'number',minimum:-1000000,maximum:1000000}},[]),()=>getStudio3DState().edit!=null),
  add<{from:number;to:number;kind?:'vertex'|'edge'}>('studio3d.edit.selectPath','Select the shortest edge path between two vertices of the edited 3D mesh','Edit',p=>need().editSelectPath(p.from,p.to,p?.kind??'vertex'),object({from:{type:'integer',minimum:0},to:{type:'integer',minimum:0},kind:{enum:['vertex','edge']}},['from','to']),()=>getStudio3DState().edit!=null),
  add<{kind:'vertex'|'edge'|'face';nth:number;offset?:number}>('studio3d.edit.selectChecker','Deselect every nth selected element of the edited 3D mesh, starting at the offset','Edit',p=>need().editSelectChecker(p.kind,p.nth,p?.offset??0),object({kind:{enum:['vertex','edge','face']},nth:{type:'integer',minimum:2,maximum:1000},offset:{type:'integer',minimum:0,maximum:999}},['kind','nth']),()=>getStudio3DState().edit!=null),
  add<{kind:'vertex'|'edge'|'face';ratio:number;seed?:number}>('studio3d.edit.selectRandom','Select a seeded random share of the edited 3D mesh elements','Edit',p=>need().editSelectRandom(p.kind,p.ratio,p?.seed??1),object({kind:{enum:['vertex','edge','face']},ratio:{type:'number',exclusiveMinimum:0,maximum:1},seed:{type:'integer',minimum:1,maximum:1000000000}},['kind','ratio']),()=>getStudio3DState().edit!=null),
  add<{axis:'x'|'y'|'z';extend?:boolean}>('studio3d.edit.selectMirror','Mirror the selection of the edited 3D mesh across an axis plane','Edit',p=>need().editSelectMirror(p.axis,p?.extend??false),object({axis:{enum:['x','y','z']},extend:{type:'boolean'}},['axis']),()=>getStudio3DState().edit!=null),
  add<{distance?:number}>('studio3d.edit.mergeByDistance','Weld the selected vertices of the edited 3D mesh that lie within the given distance','Edit',p=>need().editMergeByDistance(p?.distance??0.001),object({distance:{type:'number',exclusiveMinimum:0,maximum:1000000}},[]),()=>getStudio3DState().edit!=null),
  add('studio3d.edit.flipEdge','Rotate each selected edge of the edited 3D mesh shared by two triangles to the other diagonal','Edit',()=>need().editFlipEdge(),undefined,()=>getStudio3DState().edit!=null),
  add<{along?:'x'|'y'|'z';by?:'x'|'y'|'z';factor?:number}>('studio3d.edit.shear','Shear the selected vertices of the edited 3D mesh along one axis by their position on another','Edit',p=>need().editShear(p?.along??'x',p?.by??'y',p?.factor??0.5),object({along:{enum:['x','y','z']},by:{enum:['x','y','z']},factor:{type:'number',minimum:-1000000,maximum:1000000}},[]),()=>getStudio3DState().edit!=null),
  add<{degrees?:number}>('studio3d.edit.selectSimilar','Select faces of the edited 3D mesh whose normal is within the given angle of the current selection','Edit',p=>need().editSelectSimilar(p?.degrees??15),object({degrees:{type:'number',minimum:0,maximum:180}},[]),()=>getStudio3DState().edit!=null),
  add<{dir?:'+x'|'-x'|'+y'|'-y'|'+z'|'-z';degrees?:number}>('studio3d.edit.selectFacing','Select faces of the edited 3D mesh pointing along a mesh axis direction','Edit',p=>need().editSelectFacing(p?.dir??'+y',p?.degrees??45),object({dir:{enum:['+x','-x','+y','-y','+z','-z']},degrees:{type:'number',minimum:0,maximum:180}},[]),()=>getStudio3DState().edit!=null),
  add<{x?:number;y?:number;z?:number}>('studio3d.edit.scale','Scale the selected vertices of the edited 3D mesh toward or away from their centroid','Edit',p=>need().editScale([p?.x??1,p?.y??1,p?.z??1]),object({x:{type:'number',minimum:-1000000,maximum:1000000},y:{type:'number',minimum:-1000000,maximum:1000000},z:{type:'number',minimum:-1000000,maximum:1000000}},[]),()=>getStudio3DState().edit!=null),
  add<{axis?:'x'|'y'|'z';degrees?:number}>('studio3d.edit.rotate','Rotate the selected vertices of the edited 3D mesh around their centroid on a world axis','Edit',p=>need().editRotate(p?.axis??'z',p?.degrees??90),object({axis:{enum:['x','y','z']},degrees:{type:'number',minimum:-36000,maximum:36000}},[]),()=>getStudio3DState().edit!=null),
  add<{degrees?:number}>('studio3d.edit.selectSharp','Select edges of the edited 3D mesh whose faces meet at an angle of at least the given degrees','Edit',p=>need().editSelectSharp(p?.degrees??30),object({degrees:{type:'number',minimum:0,maximum:180}},[]),()=>getStudio3DState().edit!=null),
  add<{offset:number}>('studio3d.edit.extrude','Extrude the selected faces of the edited 3D mesh','Edit',p=>need().editExtrude(p.offset),object({offset:{type:'number',minimum:-1000,maximum:1000}}),()=>getStudio3DState().edit!=null),
  add<{offset:number}>('studio3d.edit.extrudeIndividual','Extrude each selected face of the edited 3D mesh along its own normal','Edit',p=>need().editExtrudeIndividual(p.offset),object({offset:{type:'number',minimum:-1000,maximum:1000}}),()=>getStudio3DState().edit!=null),
  add<{amount:number}>('studio3d.edit.inset','Inset the selected faces of the edited 3D mesh','Edit',p=>need().editInset(p.amount),object({amount:{type:'number',exclusiveMinimum:0,maximum:1}}),()=>getStudio3DState().edit!=null),
  add<{width:number}>('studio3d.edit.bevel','Bevel (chamfer) the selected vertices of the edited 3D mesh','Edit',p=>need().editBevel(p.width),object({width:{type:'number',exclusiveMinimum:0,maximum:1000}}),()=>getStudio3DState().edit!=null),
  add('studio3d.edit.loopCut','Cut an edge loop around the selected edge of the edited 3D mesh','Edit',()=>need().editLoopCut(),undefined,()=>getStudio3DState().edit!=null),
  add<{width:number;segments?:number}>('studio3d.edit.bevelEdge','Bevel (chamfer) the selected edges of the edited 3D mesh, with optional round multi-segment profile','Edit',p=>need().editBevelEdge(p.width,p.segments??1),object({width:{type:'number',exclusiveMinimum:0,maximum:1000},segments:{type:'integer',minimum:1,maximum:8}}),()=>getStudio3DState().edit!=null),
  add<{factor:number}>('studio3d.edit.loopSlide','Slide the selected edge loop along the surface of the edited 3D mesh','Edit',p=>need().editLoopSlide(p.factor),object({factor:{type:'number',minimum:-1.5,maximum:1.5}}),()=>getStudio3DState().edit!=null),
  add<Partial<{on:boolean;brush:'grab'|'smooth'|'inflate'|'crease'|'pinch'|'flatten'|'mask';radius:number;strength:number;falloff:'smooth'|'linear'|'constant';symmetry:'none'|'x'|'y'|'z'}>>('studio3d.sculpt.brush','Configure the sculpt brush of the 3D studio','Edit',p=>need().sculptBrush(p??{}),object({on:{type:'boolean'},brush:{enum:['grab','smooth','inflate','crease','pinch','flatten','mask']},radius:{type:'number',minimum:0.001,maximum:1000},strength:{type:'number',exclusiveMinimum:0,maximum:1},falloff:{enum:['smooth','linear','constant']},symmetry:{enum:['none','x','y','z']}},[]),hasScene),
  add<{id:number}>('studio3d.sculpt.begin','Start a sculpt stroke on a 3D mesh','Edit',p=>need().sculptBegin(p.id),object({id:{type:'integer',minimum:0}}),hasScene),
  add<{id:number;x:number;y:number;z:number;dx?:number;dy?:number;dz?:number;erase?:boolean}>('studio3d.sculpt.dab','Apply one sculpt dab with the configured brush (erase removes mask paint)','Edit',p=>need().sculptDab(p.id,[p.x,p.y,p.z],p.dx!==undefined?[p.dx,p.dy??0,p.dz??0]:undefined,!!p.erase),object({id:{type:'integer',minimum:0},x:{type:'number'},y:{type:'number'},z:{type:'number'},dx:{type:'number',minimum:-1000,maximum:1000},dy:{type:'number',minimum:-1000,maximum:1000},dz:{type:'number',minimum:-1000,maximum:1000},erase:{type:'boolean'}}),hasScene),
  add<{id:number}>('studio3d.sculpt.maskClear','Clear the sculpt mask of a 3D mesh','Edit',p=>need().sculptMaskClear(p.id),object({id:{type:'integer',minimum:0}}),hasScene),
  add<{id:number}>('studio3d.sculpt.maskInvert','Invert the sculpt mask of a 3D mesh','Edit',p=>need().sculptMaskInvert(p.id),object({id:{type:'integer',minimum:0}}),hasScene),
  add<{id:number;steps?:number}>('studio3d.sculpt.maskGrow','Grow or shrink the sculpt mask of a 3D mesh across neighbouring vertices','Edit',p=>need().sculptMaskGrow(p.id,p.steps??1),object({id:{type:'integer',minimum:0},steps:{type:'integer',minimum:-32,maximum:32}},['id']),hasScene),
  add('studio3d.sculpt.maskFromSelection','Mask the selected vertices of the edited 3D mesh for sculpting','Edit',()=>need().sculptMaskFromSelection(),undefined,()=>getStudio3DState().edit!=null),
  add<{id:number;amount?:number}>('studio3d.sculpt.maskSmooth','Blur the sculpt mask of a 3D mesh towards its neighbourhood','Edit',p=>need().sculptMaskSmooth(p.id,p.amount??0.5),object({id:{type:'integer',minimum:0},amount:{type:'number',exclusiveMinimum:0,maximum:1}},['id']),hasScene),
  add<{threshold?:number}>('studio3d.sculpt.maskToSelection','Select the masked vertices of the edited 3D mesh','Edit',p=>need().editMaskToSelection(p?.threshold??0.5),object({threshold:{type:'number',minimum:0,maximum:1}},[]),()=>getStudio3DState().edit!=null),
  add<{mark?:boolean}>('studio3d.uv.seam','Mark or clear the selected edges of the edited 3D mesh as UV seams','Edit',p=>need().uvSeamMark(p?.mark??true),object({mark:{type:'boolean'}},[]),()=>getStudio3DState().edit!=null),
  add<{id:number;method?:'box'|'angle';pack?:boolean;padding?:number}>('studio3d.uv.unwrap','Unwrap a 3D mesh: box projection per island or angle-based unfolding, packed with padding (grid layout when pack is off)','Edit',p=>need().uvUnwrap(p.id,{method:p.method,pack:p.pack,padding:p.padding}),object({id:{type:'integer',minimum:0},method:{enum:['box','angle']},pack:{type:'boolean'},padding:{type:'number',minimum:0,maximum:0.2}}),hasScene),
  add<{id:number;axis:'x'|'y'|'z'}>('studio3d.uv.planar','Planar UV projection of a 3D mesh along one axis','Edit',p=>need().uvPlanar(p.id,p.axis),object({id:{type:'integer',minimum:0},axis:{enum:['x','y','z']}}),hasScene),
  add<{on?:boolean}>('studio3d.uv.preview','Show or hide the UV checker texture on the selected 3D mesh','View',p=>need().setUvChecker(p?.on??!getStudio3DState().uvChecker),object({on:{type:'boolean'}},[]),hasScene),
  add<{id:number;axis:'x'|'y'|'z';merge?:number;on:boolean;bisect?:boolean}>('studio3d.mesh.mirrorMod','Toggle the non-destructive mirror modifier of a 3D mesh (applied on export; bisect cuts away the negative side)','Edit',p=>need().mirrorMod(p.id,p.axis,p.merge??0,p.on,!!p.bisect),object({id:{type:'integer',minimum:0},axis:{enum:['x','y','z']},merge:{type:'number',minimum:0,maximum:1000},on:{type:'boolean'},bisect:{type:'boolean'}}),hasScene),
  add('studio3d.sculpt.end','Finish the current sculpt stroke (one undo step)','Edit',()=>need().sculptEnd(),undefined,hasScene),
  add<{id:number;at:PivotAt}>('studio3d.object.pivot','Move the pivot of a 3D mesh','Edit',p=>need().setPivot(p.id,p.at),object({id:{type:'integer',minimum:0},at:{enum:['center','base']}}),hasScene),
  add<{ids:number[];axis:AlignAxis;to:AlignTo}>('studio3d.object.align','Align 3D objects','Edit',p=>need().align(p.ids,p.axis,p.to),object({ids:{type:'array',items:{type:'integer',minimum:0},minItems:2,maxItems:500},axis:{enum:['x','y','z']},to:{enum:['min','center','max']}}),hasScene),
  add<{ids:number[];axis:AlignAxis}>('studio3d.object.distribute','Distribute 3D objects evenly','Edit',p=>need().distribute(p.ids,p.axis),object({ids:{type:'array',items:{type:'integer',minimum:0},minItems:3,maxItems:500},axis:{enum:['x','y','z']}}),hasScene),
  add<{ids:number[]}>('studio3d.object.snapToGround','Drop 3D objects until their bounds rest on the ground plane','Edit',p=>need().snapToGround(p.ids),object({ids:{type:'array',items:{type:'integer',minimum:0},minItems:1,maxItems:500}},['ids']),hasScene),
  add<{ids:number[]}>('studio3d.object.toCursor','Move 3D objects so their combined centre lands on the 3D cursor','Edit',p=>{const c=getStudio3DState().cursor;return need().moveCenterTo(p.ids,[c.x,c.y,c.z]);},object({ids:{type:'array',items:{type:'integer',minimum:0},minItems:1,maxItems:500}},['ids']),hasScene),
  add<{ids:number[]}>('studio3d.object.eachToCursor','Move each selected 3D object onto the 3D cursor','Edit',p=>{const c=getStudio3DState().cursor;return need().moveEachTo(p.ids,[c.x,c.y,c.z]);},object({ids:{type:'array',items:{type:'integer',minimum:0},minItems:1,maxItems:500}},['ids']),hasScene),
  add<{ids:number[];seed?:number;move?:number;rotate?:number;scale?:number}>('studio3d.object.randomizeTransform','Jitter the position, rotation and scale of 3D objects by a seeded random amount','Edit',p=>need().randomizeTransform(p.ids,p.seed??1,p.move??0,p.rotate??0,p.scale??0),object({ids:{type:'array',items:{type:'integer',minimum:0},minItems:1,maxItems:500},seed:{type:'integer'},move:{type:'number',minimum:0},rotate:{type:'number',minimum:0,maximum:180},scale:{type:'number',minimum:0,maximum:1}},['ids']),hasScene),
  add<Partial<SnapSettings>>('studio3d.snap.set','Change 3D transform snapping','Tools',p=>need().setSnap(p&&Object.keys(p).length?p:{on:!getStudio3DState().snap.on}),object({on:{type:'boolean'},move:{type:'number',minimum:0.001,maximum:100},rotate:{type:'number',minimum:1,maximum:180},scale:{type:'number',minimum:0.001,maximum:10},mode:{enum:['grid','vertex','surface','midpoint']}},[]),()=>!!controller),
  add<{mode:PivotMode}>('studio3d.pivot.set','Set the 3D transform pivot','Tools',p=>need().setPivotMode(p.mode),object({mode:{enum:['center','origin','cursor']}},['mode']),()=>!!controller),
  add<{x:number;y:number;z:number}>('studio3d.cursor.set','Move the 3D cursor','Tools',p=>{for(const k of['x','y','z']as const)if(!Number.isFinite(p[k]))throw new Error('Cursor coordinates must be finite numbers.');need().setCursor({x:p.x,y:p.y,z:p.z});},object({x:{type:'number'},y:{type:'number'},z:{type:'number'}},['x','y','z']),()=>!!controller),
  add<{on?:boolean}>('studio3d.measure.set','Toggle the 3D measure tool','Tools',p=>need().setMeasure(p?.on??!getStudio3DState().measure),object({on:{type:'boolean'}},[]),()=>!!controller),
  add<RenderOptions>('studio3d.render.still','Render a PNG still of the 3D view or a 3D camera','Project',p=>need().renderStill(p??{}),object({camera:{type:'integer',minimum:0},width:{type:'integer',minimum:1,maximum:16384},height:{type:'integer',minimum:1,maximum:16384},transparent:{type:'boolean'}},[])),
  add<{slot:TextureSlot}>('studio3d.texture.open','Choose an image for a texture slot of the selected 3D object','Edit',p=>textureOpener!(p.slot),object({slot:{enum:[...TEXTURE_SLOTS]}}),()=>hasScene()&&!!textureOpener&&getStudio3DState().selectedInfo?.material!=null),
  add<{id:number;slot:TextureSlot}>('studio3d.texture.preview','Show a small preview image of a texture slot','Edit',p=>need().texturePreview(p.id,p.slot),object({id:{type:'integer',minimum:0},slot:{enum:[...TEXTURE_SLOTS]}},['id','slot']),hasScene),
  add('studio3d.cursor.toSelection','Move the 3D cursor to the selection centre','Tools',()=>need().cursorToSelection(),undefined,()=>!!controller),
  add<{id?:number;slot:TextureSlot}>('studio3d.texture.clear','Remove the image from a texture slot','Edit',p=>need().setTextureFile(p.id??getStudio3DState().selected??-1,p.slot,null),object({id:{type:'integer',minimum:0},slot:{enum:[...TEXTURE_SLOTS]}},['slot']),hasScene),
  add<{kind:'checker'|'grid'|'stripes'|'noise';slot:TextureSlot;id?:number;size?:number;scale?:number;colorA?:string;colorB?:string;seed?:number}>('studio3d.texture.generate','Generate a procedural texture (checker, grid, stripes or noise) for a texture slot of the selected 3D object','Edit',p=>need().generateTexture(p.id??getStudio3DState().selected??-1,p.slot,{kind:p.kind,size:p.size,scale:p.scale,colorA:p.colorA,colorB:p.colorB,seed:p.seed}),object({kind:{enum:['checker','grid','stripes','noise']},slot:{enum:[...TEXTURE_SLOTS]},id:{type:'integer',minimum:0},size:{type:'integer',minimum:16,maximum:1024},scale:{type:'number',minimum:1,maximum:64},colorA:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'},colorB:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'},seed:{type:'integer',minimum:1,maximum:1000000000}},['kind','slot']),()=>hasScene()&&getStudio3DState().selectedInfo?.material!=null),
  add<{axis:MirrorAxis;copy?:boolean;ids?:number[]}>('studio3d.mesh.mirror','Mirror 3D objects across a world axis','Edit',p=>need().mirrorSelection(p.axis,!!p.copy,p.ids),object({axis:{enum:['x','y','z']},copy:{type:'boolean'},ids:{type:'array',items:{type:'integer',minimum:0},minItems:1,maxItems:500}},['axis']),hasScene),
  add<{ids?:number[]}>('studio3d.mesh.applyScale','Apply the scale of 3D meshes to their geometry','Edit',p=>need().applyScale(p?.ids),object({ids:{type:'array',items:{type:'integer',minimum:0},minItems:1,maxItems:500}},[]),hasScene),
  add<{ids?:number[]}>('studio3d.mesh.merge','Merge 3D meshes into one','Edit',p=>need().mergeSelection(p?.ids),object({ids:{type:'array',items:{type:'integer',minimum:0},minItems:2,maxItems:500}},[]),hasScene),
  add<{axis:MirrorAxis;side?:'positive'|'negative';merge?:number;ids?:number[]}>('studio3d.mesh.symmetrize','Bake a symmetry into 3D meshes: keep one side of the local mirror plane, mirror it onto the other and weld the seam','Edit',p=>need().symmetrize(p.axis,p.side??'positive',p.merge??0.0001,p.ids),object({axis:{enum:['x','y','z']},side:{enum:['positive','negative']},merge:{type:'number',minimum:0,maximum:1000},ids:{type:'array',items:{type:'integer',minimum:0},minItems:1,maxItems:500}},['axis']),hasScene),
  add<{iterations?:number;ids?:number[]}>('studio3d.mesh.subdivide','Subdivide 3D meshes smoothly: split every triangle into four and smooth the surface (Loop scheme)','Edit',p=>need().subdivide(p?.iterations??1,p?.ids),object({iterations:{type:'integer',minimum:1,maximum:3},ids:{type:'array',items:{type:'integer',minimum:0},minItems:1,maxItems:500}},[]),hasScene),
  add<{weld?:number;ids?:number[]}>('studio3d.mesh.cleanup','Clean up 3D meshes: weld duplicate vertices, drop collapsed and duplicate faces and unify winding (closed parts point outward)','Edit',p=>need().cleanup(p?.weld??0.0001,p?.ids),object({weld:{type:'number',minimum:0,maximum:1000},ids:{type:'array',items:{type:'integer',minimum:0},minItems:1,maxItems:500}},[]),hasScene),
  add<{op:NormalsOp;angle?:number;ids?:number[]}>('studio3d.mesh.normals','Rebuild the normals of 3D meshes: flip them, recalculate outward, or re-shade smooth, flat or split by angle','Edit',p=>need().normals(p.op,p.angle??30,p.ids),object({op:{enum:['flip','outside','smooth','flat','angle']},angle:{type:'number',minimum:0,maximum:180},ids:{type:'array',items:{type:'integer',minimum:0},minItems:1,maxItems:500}},['op']),hasScene),
  add<{ids?:number[]}>('studio3d.mesh.separate','Split 3D meshes into one object per connected part','Edit',p=>need().separate(p?.ids),object({ids:{type:'array',items:{type:'integer',minimum:0},minItems:1,maxItems:500}},[]),hasScene),
  add<{thickness:number;offset?:number;ids?:number[]}>('studio3d.mesh.solidify','Give a thin 3D mesh real thickness: offset shell with stitched side walls','Edit',p=>need().solidify(p.thickness,p.offset??0,p.ids),object({thickness:{type:'number',exclusiveMinimum:0,maximum:1000000},offset:{type:'number',minimum:-1,maximum:1},ids:{type:'array',items:{type:'integer',minimum:0},minItems:1,maxItems:500}},['thickness']),hasScene),
  add<{ids?:number[]}>('studio3d.mesh.fillHoles','Cap the open borders of 3D meshes','Edit',p=>need().fillHoles(p?.ids),object({ids:{type:'array',items:{type:'integer',minimum:0},minItems:1,maxItems:500}},[]),hasScene),
  add<{iterations?:number;factor?:number;ids?:number[]}>('studio3d.mesh.relax','Smooth a 3D mesh: vertices drift toward their neighbourhood average, borders stay put','Edit',p=>need().relax(p.iterations??1,p.factor??0.5,p.ids),object({iterations:{type:'integer',minimum:1,maximum:50},factor:{type:'number',exclusiveMinimum:0,maximum:1},ids:{type:'array',items:{type:'integer',minimum:0},minItems:1,maxItems:500}},[]),hasScene),
  add<{amount:number;ids?:number[]}>('studio3d.mesh.fatten','Shrink or fatten a 3D mesh along its normals (negative amounts shrink)','Edit',p=>need().fatten(p.amount,p.ids),object({amount:{type:'number',maximum:1000000,minimum:-1000000},ids:{type:'array',items:{type:'integer',minimum:0},minItems:1,maxItems:500}},['amount']),hasScene),
  add<{axis:'x'|'y'|'z';offset?:number;fill?:boolean;ids?:number[]}>('studio3d.mesh.bisect','Cut a 3D mesh with a plane and keep both halves','Edit',p=>need().bisect(p.axis,p.offset??0,p.fill??true,p.ids),object({axis:{enum:['x','y','z']},offset:{type:'number',minimum:-1000000000,maximum:1000000000},fill:{type:'boolean'},ids:{type:'array',items:{type:'integer',minimum:0},minItems:1,maxItems:500}},['axis']),hasScene),
  add<{axis:'x'|'y'|'z';degrees:number;ids?:number[]}>('studio3d.mesh.twist','Twist a 3D mesh around an axis','Edit',p=>need().twist(p.axis,p.degrees,p.ids),object({axis:{enum:['x','y','z']},degrees:{type:'number',minimum:-720,maximum:720},ids:{type:'array',items:{type:'integer',minimum:0},minItems:1,maxItems:500}},['axis','degrees']),hasScene),
  add<{axis:'x'|'y'|'z';degrees:number;ids?:number[]}>('studio3d.mesh.bend','Bend a 3D mesh sideways around the axis perpendicular to the deform axis','Edit',p=>need().bend(p.axis,p.degrees,p.ids),object({axis:{enum:['x','y','z']},degrees:{type:'number',minimum:-360,maximum:360},ids:{type:'array',items:{type:'integer',minimum:0},minItems:1,maxItems:500}},['axis','degrees']),hasScene),
  add<{axis:'x'|'y'|'z';factor:number;ids?:number[]}>('studio3d.mesh.taper','Taper a 3D mesh along an axis','Edit',p=>need().taper(p.axis,p.factor,p.ids),object({axis:{enum:['x','y','z']},factor:{type:'number',minimum:-10,maximum:10},ids:{type:'array',items:{type:'integer',minimum:0},minItems:1,maxItems:500}},['axis','factor']),hasScene),
  add<{axis:'x'|'y'|'z';degrees:number;steps?:number;cx?:number;cy?:number;cz?:number;ids?:number[]}>('studio3d.mesh.spin','Revolve a 3D mesh around an axis (lathe)','Edit',p=>need().spin(p.axis,p.degrees,p.steps??12,[p.cx??0,p.cy??0,p.cz??0],p.ids),object({axis:{enum:['x','y','z']},degrees:{type:'number',minimum:-360,maximum:360},steps:{type:'integer',minimum:1,maximum:128},cx:{type:'number'},cy:{type:'number'},cz:{type:'number'},ids:{type:'array',items:{type:'integer',minimum:0},minItems:1,maxItems:500}},['axis','degrees']),hasScene),
  add<{axis:'x'|'y'|'z';degrees:number;steps?:number;rise?:number;cx?:number;cy?:number;cz?:number;ids?:number[]}>('studio3d.mesh.screw','Revolve a 3D mesh around an axis while rising along it (helix)','Edit',p=>need().screw(p.axis,p.degrees,p.steps??12,[p.cx??0,p.cy??0,p.cz??0],p.rise??1,p.ids),object({axis:{enum:['x','y','z']},degrees:{type:'number',minimum:-360,maximum:360},steps:{type:'integer',minimum:1,maximum:128},rise:{type:'number'},cx:{type:'number'},cy:{type:'number'},cz:{type:'number'},ids:{type:'array',items:{type:'integer',minimum:0},minItems:1,maxItems:500}},['axis','degrees']),hasScene),
  add<{ids?:number[];twist?:number}>('studio3d.mesh.bridge','Bridge two 3D meshes with a tunnel between their open borders','Edit',p=>need().bridge(p.ids??[],p.twist??0),object({ids:{type:'array',items:{type:'integer',minimum:0},minItems:2,maxItems:2},twist:{type:'integer',minimum:-64,maximum:64}},[]),hasScene),
  add<{op:'union'|'subtract'|'intersect';ids?:number[]}>('studio3d.mesh.boolean','Combine two 3D meshes with a boolean: union, subtract or intersect','Edit',p=>need().booleanOp(p.op,p.ids??[]),object({op:{enum:['union','subtract','intersect']},ids:{type:'array',items:{type:'integer',minimum:0},minItems:2,maxItems:2}},['op']),hasScene),
  add<{resolution?:number;ids?:number[]}>('studio3d.mesh.remesh','Rebuild meshes as an even voxel grid (remesh): uniform triangles, watertight','Edit',p=>need().remesh(p.resolution??32,p.ids??[]),object({resolution:{type:'integer',minimum:8,maximum:128},ids:{type:'array',items:{type:'integer',minimum:0},minItems:1}},[]),hasScene),
  add<{id?:number;keep:number}>('studio3d.mesh.simplify','Simplify a 3D mesh: remove vertices while keeping its shape, UVs and normals','Edit',async p=>{const id=p.id??getStudio3DState().selected;if(id==null)throw new Error('Select an object first.');return need().simplify(id,p.keep);},object({id:{type:'integer',minimum:0},keep:{type:'number',exclusiveMinimum:0,exclusiveMaximum:1}},['keep']),hasScene),
  add<{preset:ViewPreset}>('studio3d.view.preset','Look at the 3D scene from the front, back, left, right, top, bottom or an isometric angle','View',p=>need().viewPreset(p.preset),object({preset:{enum:[...VIEW_PRESETS]}}),hasScene),
  add<{id?:number;slot:TextureSlot;reset?:boolean}&Partial<TextureTransform>>('studio3d.texture.transform','Move, scale or rotate the image of a texture slot (UV mapping)','Edit',p=>{const{id,slot,reset,...patch}=p;need().setTextureTransform(id??getStudio3DState().selected??-1,slot,reset?'reset':patch);},object({id:{type:'integer',minimum:0},slot:{enum:[...TEXTURE_SLOTS]},reset:{type:'boolean'},offsetX:{type:'number',minimum:-100,maximum:100},offsetY:{type:'number',minimum:-100,maximum:100},scaleX:{type:'number'},scaleY:{type:'number'},rotation:{type:'number',minimum:-360,maximum:360}},['slot']),()=>hasScene()&&getStudio3DState().selectedInfo?.material!=null),
  add<{clip?:number}>('studio3d.anim.play','Play an animation clip of the 3D model','View',p=>need().animPlay(p?.clip),object({clip:{type:'integer',minimum:0}},[]),hasClips),
  add('studio3d.anim.pause','Pause the 3D animation','View',()=>need().animPause(),undefined,()=>hasClips()&&getStudio3DState().anim.playing),
  add<{time:number}>('studio3d.anim.seek','Jump to a time in the 3D animation','View',p=>need().animSeek(p.time),object({time:{type:'number',minimum:0}}),hasClips),
  add<{loop?:boolean}>('studio3d.anim.loop','Loop the 3D animation or play it once','View',p=>need().animLoop(p?.loop??!getStudio3DState().anim.loop),object({loop:{type:'boolean'}},[]),hasClips),
  add<{speed:number}>('studio3d.anim.speed','Set the 3D animation speed','View',p=>need().animSpeed(p.speed),object({speed:{type:'number',minimum:0.01,maximum:4}}),hasClips),
  add<{name?:string;duration?:number}>('studio3d.clip.add','Add an empty 3D animation clip','View',p=>need().clipAdd(p?.name,p?.duration),object({name:{type:'string',minLength:1,maxLength:80},duration:{type:'number',minimum:0.001,maximum:3600}},[]),hasScene),
  add<{clip?:number}>('studio3d.clip.remove','Delete a 3D animation clip','View',p=>need().clipRemove(p?.clip),object({clip:{type:'integer',minimum:0}},[]),hasClips),
  add<{name:string;clip?:number}>('studio3d.clip.rename','Rename a 3D animation clip','View',p=>need().clipRename(p.name,p.clip),object({name:{type:'string',minLength:1,maxLength:80},clip:{type:'integer',minimum:0}},['name']),hasClips),
  add<{duration:number;clip?:number}>('studio3d.clip.duration','Set the length of a 3D animation clip in seconds','View',p=>need().clipDuration(p.duration,p.clip),object({duration:{type:'number',minimum:0.001,maximum:3600},clip:{type:'integer',minimum:0}},['duration']),hasClips),
  add<{on?:boolean;before?:number;after?:number}>('studio3d.onion.skin','Show ghost poses of the skinned meshes this many frames before and after the playhead (onion skinning)','View',p=>need().onionSkin(p.on,p.before,p.after),object({on:{type:'boolean'},before:{type:'integer',minimum:0,maximum:4},after:{type:'integer',minimum:0,maximum:4}},[]),hasClips),
  add<{on?:boolean}>('studio3d.motionpath','Show the motion path of the selected bone over the current clip','View',p=>need().motionPathToggle(p.on),object({on:{type:'boolean'}},[]),()=>hasClips()&&getStudio3DState().bones.length>0),
  add<{source:number;target?:number;clip?:number}>('studio3d.retarget.preview','Pose the target rig with the retargeted pose of the source rig clip at the playhead (bone names are matched)','Edit',p=>need().retargetPreview(p.source,p.target,p.clip),object({source:{type:'integer',minimum:0},target:{type:'integer',minimum:0},clip:{type:'integer',minimum:0}},['source']),()=>hasClips()&&getStudio3DState().bones.length>0),
  add<{source:number;target?:number;clip?:number;name?:string}>('studio3d.retarget.apply','Bake the current clip retargeted from the source rig onto the target rig as a new clip (bone names are matched)','Edit',p=>need().retargetApply(p.source,p.target,p.clip,p.name),object({source:{type:'integer',minimum:0},target:{type:'integer',minimum:0},clip:{type:'integer',minimum:0},name:{type:'string',minLength:1,maxLength:80}},['source']),()=>hasClips()&&getStudio3DState().bones.length>0),
  add<{all?:boolean;id?:number;clip?:number;time?:number}>('studio3d.clip.record','Record the current pose of the selected bones (or every bone with all) as rotation keys at the playhead time in a clip','View',p=>need().recordPose(p.all,p.id,p.clip,p.time),object({all:{type:'boolean'},id:{type:'integer',minimum:0},clip:{type:'integer',minimum:0},time:{type:'number',minimum:0}},[]),()=>hasClips()&&getStudio3DState().bones.length>0),
  add<{path:KeyPath;time?:number;id?:number;x?:number;y?:number;z?:number}>('studio3d.key.set','Add or replace a position, rotation or scale key of a 3D object in the current clip','View',p=>{const{path,time,id,...v}=p;need().keySet(path,time,id,Object.keys(v).length?v:undefined);},object({path:{enum:[...KEY_PATHS]},time:{type:'number',minimum:0,maximum:3600},id:{type:'integer',minimum:0},x:{type:'number'},y:{type:'number'},z:{type:'number'}},['path']),()=>hasScene()&&(getStudio3DState().selected!=null||getStudio3DState().clips.length>0)),
  add<{path:KeyPath;time?:number;id?:number}>('studio3d.key.remove','Remove a position, rotation or scale key of a 3D object in the current clip','View',p=>need().keyRemove(p.path,p.time,p.id),object({path:{enum:[...KEY_PATHS]},time:{type:'number',minimum:0,maximum:3600},id:{type:'integer',minimum:0}},['path']),hasClips),
  add<{path:KeyPath;time:number;to:number;id?:number}>('studio3d.key.move','Move a key of a 3D object to another time in the current clip','View',p=>need().keyMove(p.path,p.time,p.to,p.id),object({path:{enum:[...KEY_PATHS]},time:{type:'number',minimum:0,maximum:3600},to:{type:'number',minimum:0,maximum:3600},id:{type:'integer',minimum:0}},['path','time','to']),hasClips),
  add<{path:KeyPath;time:number;ease:Ease;id?:number}>('studio3d.key.ease','Set the easing of the segment after a key (linear, step, ease in, ease out, ease in-out)','View',p=>need().keyEase(p.path,p.time,p.ease,p.id),object({path:{enum:[...KEY_PATHS]},time:{type:'number',minimum:0,maximum:3600},ease:{enum:[...EASES]},id:{type:'integer',minimum:0}},['path','time','ease']),hasClips),
  add<{clip?:number}>('studio3d.clip.duplicate','Duplicate a 3D animation clip with all its keys','View',p=>need().clipDuplicate(p?.clip),object({clip:{type:'integer',minimum:0}},[]),hasClips),
  add<{keys:KeyRef[]}>('studio3d.key.copy','Copy position, rotation or scale keys of the selected 3D object in the current clip','View',p=>need().keyCopy(p.keys),object({keys:KEYREFS}),hasKeys),
  add<{time?:number}>('studio3d.key.paste','Paste the copied keys at the playhead in the current clip','View',p=>need().keyPaste(p?.time),object({time:{type:'number',minimum:0,maximum:3600}},[]),hasKeys),
  add<{keys:KeyRef[];delta:number}>('studio3d.key.shift','Move several keys of a 3D object in time by the same amount','View',p=>need().keyShift(p.keys,p.delta),object({keys:KEYREFS,delta:{type:'number',minimum:-3600,maximum:3600}}),hasKeys),
  add<{start?:number;end?:number;clear?:boolean}>('studio3d.anim.range','Preview a part of the 3D animation clip as a loop','View',p=>{
   if(p?.clear)need().animRange(null);
   else{if(typeof p?.start!=='number'||typeof p?.end!=='number')throw Object.assign(new Error('Give a start and an end, or clear.'),{expected:true});need().animRange({start:p.start,end:p.end});}
  },object({start:{type:'number',minimum:0,maximum:3600},end:{type:'number',minimum:0,maximum:3600},clear:{type:'boolean'}},[]),hasClips),
  add<{on?:boolean}>('studio3d.skeleton.show','Show or hide the skeleton overlay of a skinned 3D model','View',p=>need().setSkeleton(p?.on??!getStudio3DState().skeleton),object({on:{type:'boolean'}},[]),hasBones),
  add<{id:number}>('studio3d.skeleton.select','Select a bone of a skinned 3D model','Edit',p=>need().selectBone(p.id),object({id:{type:'integer',minimum:0}}),hasBones),
  add<{id?:number;bone?:number;mode?:'smooth'|'rigid'}>('studio3d.skin.bind','Bind a 3D mesh to a bone chain with auto-weights','Edit',p=>need().skinBind(p?.id??getStudio3DState().selected!,p?.bone??getStudio3DState().bones.find(b=>b.depth===0)!.id,p?.mode??'smooth'),object({id:{type:'integer',minimum:0},bone:{type:'integer',minimum:0},mode:{enum:['smooth','rigid']}},[]),hasPlainMesh),
  add<{id?:number;mode?:'smooth'|'rigid'}>('studio3d.skin.reweight','Recompute the weights of a skinned 3D mesh (smooth falloff or rigid bind)','Edit',p=>need().skinRebind(p?.id??getStudio3DState().selected!,p?.mode??'smooth'),object({id:{type:'integer',minimum:0},mode:{enum:['smooth','rigid']}},[]),hasSkinnedMesh),
  add<{on?:boolean;mode?:'add'|'subtract'|'smooth';radius?:number;strength?:number;falloff?:'smooth'|'linear'|'constant'}>('studio3d.skin.brush','Configure the weight paint brush of a skinned 3D mesh','View',p=>need().setWeightBrush(p??{}),object({on:{type:'boolean'},mode:{enum:['add','subtract','smooth']},radius:{type:'number',minimum:0.001,maximum:1000},strength:{type:'number',minimum:0.01,maximum:1},falloff:{enum:['smooth','linear','constant']}},[]),hasSkinnedMesh),
  add<{x:number;y:number;z:number;bone?:number;mode?:'add'|'subtract'|'smooth';radius?:number;strength?:number;falloff?:'smooth'|'linear'|'constant'}>('studio3d.skin.paint','Paint one brush dab of bone weight onto the selected skinned 3D mesh','Edit',p=>need().paintDab(p.x,p.y,p.z,p),object({x:{type:'number'},y:{type:'number'},z:{type:'number'},bone:{type:'integer',minimum:0},mode:{enum:['add','subtract','smooth']},radius:{type:'number',minimum:0.001,maximum:1000},strength:{type:'number',minimum:0.01,maximum:1},falloff:{enum:['smooth','linear','constant']}},['x','y','z']),hasSkinnedMesh),
  add<{id?:number;name:string}>('studio3d.pose.save','Save the current pose of the selected rig under a name','Edit',p=>need().poseSave(p.name,p.id),object({id:{type:'integer',minimum:0},name:{type:'string',minLength:1,maxLength:80}},['name']),hasSkinnedMesh),
  add<{id?:number;name:string}>('studio3d.pose.apply','Apply a saved pose to the selected rig','Edit',p=>need().poseApply(p.name,p.id),object({id:{type:'integer',minimum:0},name:{type:'string',minLength:1,maxLength:80}},['name']),hasSkinnedMesh),
  add<{id?:number;name:string}>('studio3d.pose.remove','Remove a saved pose from the selected rig','Edit',p=>need().poseRemove(p.name,p.id),object({id:{type:'integer',minimum:0},name:{type:'string',minLength:1,maxLength:80}},['name']),hasSkinnedMesh),
  add<{id?:number;name:string}>('studio3d.pose.mirror','Apply the left/right mirror of a saved pose (paired by bone name)','Edit',p=>need().poseMirror(p.name,p.id),object({id:{type:'integer',minimum:0},name:{type:'string',minLength:1,maxLength:80}},['name']),hasSkinnedMesh),
  add<{id?:number;a:string;b:string;t:number}>('studio3d.pose.blend','Blend two saved poses (t=0 is the first, t=1 the second) and apply the mix','Edit',p=>need().poseBlend(p.a,p.b,p.t,p.id),object({id:{type:'integer',minimum:0},a:{type:'string',minLength:1,maxLength:80},b:{type:'string',minLength:1,maxLength:80},t:{type:'number',minimum:0,maximum:1}},['a','b','t']),hasSkinnedMesh),
  add<{id?:number;on:boolean}>('studio3d.ik.toggle','Switch a two-bone chain between FK and IK; switching to IK snaps the target to the end effector','Edit',p=>need().ikToggle(p.on,p.id),object({id:{type:'integer',minimum:0},on:{type:'boolean'}},['on']),hasSkinnedMesh),
  add<{id?:number;x:number;y:number;z:number}>('studio3d.ik.target','Move the IK target of a chain (world space) and solve','Edit',p=>need().ikSetTarget([p.x,p.y,p.z],p.id),object({id:{type:'integer',minimum:0},x:{type:'number'},y:{type:'number'},z:{type:'number'}},['x','y','z']),hasSkinnedMesh),
  add<{id?:number;x:number;y:number;z:number}>('studio3d.ik.pole','Move the IK pole target of a chain (world space) and re-solve','Edit',p=>need().ikSetPole([p.x,p.y,p.z],p.id),object({id:{type:'integer',minimum:0},x:{type:'number'},y:{type:'number'},z:{type:'number'}},['x','y','z']),hasSkinnedMesh),
  add<{id?:number;on:boolean}>('studio3d.fabrik.toggle','Switch a chain of 3 to 8 segments between FK and FABRIK; switching to FABRIK snaps the target to the end effector','Edit',p=>need().fabrikToggle(p.on,p.id),object({id:{type:'integer',minimum:0},on:{type:'boolean'}},['on']),hasSkinnedMesh),
  add<{id?:number;x:number;y:number;z:number}>('studio3d.fabrik.target','Move the FABRIK target of a chain (world space) and solve','Edit',p=>need().fabrikSetTarget([p.x,p.y,p.z],p.id),object({id:{type:'integer',minimum:0},x:{type:'number'},y:{type:'number'},z:{type:'number'}},['x','y','z']),hasSkinnedMesh),
  add<{id?:number;on:boolean}>('studio3d.fabrik.lookat','Toggle the look-at constraint of a FABRIK chain (aims the end bone at the look target)','Edit',p=>need().fabrikLookToggle(p.on,p.id),object({id:{type:'integer',minimum:0},on:{type:'boolean'}},['on']),hasSkinnedMesh),
  add<{id?:number;x:number;y:number;z:number}>('studio3d.fabrik.looktarget','Move the look-at target of a FABRIK chain (world space) and re-solve','Edit',p=>need().fabrikSetLook([p.x,p.y,p.z],p.id),object({id:{type:'integer',minimum:0},x:{type:'number'},y:{type:'number'},z:{type:'number'}},['x','y','z']),hasSkinnedMesh),
  add<{id?:number;min?:(number|null)[]|null;max?:(number|null)[]|null}>('studio3d.bone.limits','Set or clear joint limits of a bone in degrees (null keeps an axis open)','Edit',p=>need().setBoneLimits(p.min??null,p.max??null,p.id),object({id:{type:'integer',minimum:0},min:{anyOf:[{type:'null'},{type:'array',items:{anyOf:[{type:'number',minimum:-720,maximum:720},{type:'null'}]},minItems:3,maxItems:3}]},max:{anyOf:[{type:'null'},{type:'array',items:{anyOf:[{type:'number',minimum:-720,maximum:720},{type:'null'}]},minItems:3,maxItems:3}]}},[]),hasSkinnedMesh),
  add<{bone:number|null}>('studio3d.skin.preview','Preview a bone\'s influence as vertex colours on the selected skinned 3D mesh','View',p=>need().setWeightPreview(p.bone),object({bone:{anyOf:[{type:'null'},{type:'integer',minimum:0}]}},['bone']),hasSkinnedMesh),
  add<{on?:boolean}>('studio3d.anim.autokey','Turn auto-key on or off: transform changes are recorded as keys at the current time','View',p=>need().autoKey(p?.on??!getStudio3DState().autoKey),object({on:{type:'boolean'}},[]),hasScene),
  add<{clips?:string[]|null}>('studio3d.export.glb','Export the scene as GLB','Project',p=>need().exportGlb(p??{}),object({clips:{anyOf:[{type:'null'},{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:0,maxItems:64}]}},[])),
  add<{textures?:'embed'|'external';clips?:string[]|null}>('studio3d.export.gltf','Export the scene as glTF (embedded, or a ZIP with separate textures)','Project',p=>need().exportGltf(p??{}),object({textures:{enum:['embed','external']},clips:{anyOf:[{type:'null'},{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:0,maxItems:64}]}},[])),
  add<{textures?:'embed'|'external';clips?:string[]|null;selection?:boolean}>('studio3d.export.options','Set the glTF export options: texture mode, which clips to export and whether to write only the selection','Project',p=>need().setExportOptions(p??{}),object({textures:{enum:['embed','external']},clips:{anyOf:[{type:'null'},{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:0,maxItems:64}]},selection:{type:'boolean'}},[])),
  add<{unit?:ExportUnit;upAxis?:'y'|'z'}>('studio3d.import.options','Set the mesh import options for OBJ, STL and PLY files: the units the file is written in and its up axis','Project',p=>{const u=p?.unit;if(u!==undefined&&!isUnit(u))throw new Error('Unit must be m, cm, mm or in.');const a=p?.upAxis;patchStudio3D({...(u!==undefined?{importUnit:u}:{}),...(a!==undefined?{importUpAxis:a}:{})});},object({unit:{enum:['m','cm','mm','in']},upAxis:{enum:['y','z']}},[]),()=>!!controller),
  add<{sidecar?:boolean;embedEnv?:boolean}>('studio3d.save','Save the 3D scene','Project',p=>need().save(!!p?.sidecar,!!p?.embedEnv),object({sidecar:{type:'boolean'},embedEnv:{type:'boolean'}},[]),hasScene),
  add<{ids?:number[]}>('studio3d.selection.delete','Delete the selected 3D objects','Edit',p=>need().deleteSelection(p?.ids),object({ids:{type:'array',items:{type:'integer',minimum:0},minItems:1,maxItems:500}},[]),hasScene),
  add<{ids?:number[]}>('studio3d.selection.duplicate','Duplicate the selected 3D objects','Edit',p=>need().duplicateSelection(p?.ids),object({ids:{type:'array',items:{type:'integer',minimum:0},minItems:1,maxItems:500}},[]),hasScene),
  add<{format:'stl'|'obj'}>('studio3d.export.mesh','Export the scene as STL or OBJ','Project',p=>need().exportMesh(p.format),object({format:{enum:['stl','obj']}}),hasScene),
  add<{unit:ExportUnit}>('studio3d.unit.set','Set the unit used for STL and OBJ export','Project',p=>need().setUnit(p.unit),object({unit:{enum:['m','cm','mm','in']}}),()=>!!controller),
  add<TurntableOptions>('studio3d.render.turntable','Render a turntable as a ZIP of PNG frames, a PNG sequence in a chosen folder, or a WebM video','Project',p=>need().renderTurntable(p??{}),object({frames:{type:'integer',minimum:2,maximum:360},width:{type:'integer',minimum:1,maximum:8192},height:{type:'integer',minimum:1,maximum:8192},transparent:{type:'boolean'},out:{enum:['zip','folder','webm']},fps:{type:'integer',minimum:1,maximum:60}},[]),hasScene),
  add<{id:string}>('studio3d.recent.open','Open a recent 3D scene','Project',p=>recentOpener!(p.id),object({id:{type:'string',minLength:1,maxLength:200}}),()=>!!recentOpener&&getStudio3DState().recent.length>0),
  add('studio3d.recent.clear','Clear recent 3D scenes and autosave','Project',()=>clearRecentScenes(),undefined,()=>getStudio3DState().recent.length>0),
  add('studio3d.render.cancel','Cancel the running 3D render','Project',()=>need().cancelRender(),undefined,()=>!!controller&&getStudio3DState().render!=null),
 ] as CommandSpec<unknown,unknown>[];
}
export const STUDIO3D_COMMANDS=studio3DCommandSpecs().map(s=>s.id);
let mounts=0,dispose:(()=>void)|null=null;
/** Reference counted so a remount of the canvas never double registers. */
export function registerStudio3DCommands(){
 if(mounts++===0){const offs=studio3DCommandSpecs().map(s=>{const off=registerCommandSpec(s);const m=commandRegistry.get(s.id)!;m.argsSchema=s.params;m.risk='none';return off;});dispose=()=>offs.forEach(f=>f());}
 let live=true;return()=>{if(!live)return;live=false;if(--mounts===0){dispose?.();dispose=null;patchStudio3D({});}};
}

