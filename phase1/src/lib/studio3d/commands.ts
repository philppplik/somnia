import {commandRegistry} from '../commandRegistry';
import {registerCommandSpec} from '../commandBridge';
import type {CommandSpec} from '../commandSpec';
import {clearRecentScenes} from './recentSession';
import {getStudio3DState,patchStudio3D} from './session';
import type {EnvSettings,GizmoMode,SnapSettings,ExportUnit,ExportFormat} from './model';
import {PARAM_SPECS,MATERIAL_PRESET_IDS} from './primitives';
import {ALPHA_MODES,TEXTURE_SLOTS,MAX_EMISSIVE_INTENSITY,type TextureSlot} from './materials';
import {EASES,type Ease} from './ease';
import {KEY_PATHS,type KeyPath} from './clips';
import type {KeyRef} from './keyEdit';
import type {LoopRange} from './animation';
import type {TextureTransform} from './uv';
import {VIEW_PRESETS,type ViewPreset} from './viewPresets';
import type {MirrorAxis,PrimitiveKind,LightKind,TransformPatch,MaterialPatch,LightPatch,AlignAxis,AlignTo,PivotAt} from './stage';
export interface TurntableOptions{frames?:number;width?:number;height?:number;transparent?:boolean}
export interface RenderOptions{/** id of a camera object; the viewport camera when omitted */camera?:number;width?:number;height?:number;transparent?:boolean}
/** What the lazy viewport offers. The command layer never imports three.js. */
export interface Studio3DController{
 openFiles(files:File[],force?:boolean):Promise<void>;
 newScene(force?:boolean):void;
 addPrimitive(kind:PrimitiveKind):number;
 addLight(kind:LightKind):number;
 setTransform(id:number,patch:TransformPatch):void;
 setMaterial(id:number,patch:MaterialPatch):void;
 setPrimitive(id:number,patch:Record<string,number>):void;
 exportGltf(opts?:{textures?:'embed'|'external';clips?:string[]|null}):Promise<void>;
 setExportOptions(p:{textures?:'embed'|'external';clips?:string[]|null}):void;
 setTextureFile(id:number,slot:TextureSlot,file:File|null):Promise<void>;
 mirrorSelection(axis:MirrorAxis,copy:boolean,ids?:number[]):number[];
 applyScale(ids?:number[]):void;
 mergeSelection(ids?:number[]):number;
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
 remove(id:number):void;
 duplicate(id:number):number;
 addCamera(fromView:boolean):number;
 setCamera(id:number,patch:{fov:number}):void;
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
 distribute(ids:number[],axis:AlignAxis):void;
 setSnap(patch:Partial<SnapSettings>):void;
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
/** The canvas owns the image file dialog (user gesture). */
export function registerStudio3DTextureOpener(open:(slot:TextureSlot)=>void){textureOpener=open;return()=>{if(textureOpener===open)textureOpener=null;};}
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
  add<{kind:LightKind}>('studio3d.insert.light','Insert a 3D light','Insert',p=>need().addLight(p.kind),object({kind:{enum:['directional','point','spot','area']}}),()=>!!controller),
  add<{id:number;position?:object;rotation?:object;scale?:object}>('studio3d.object.transform','Move, rotate or scale a 3D object','Edit',p=>need().setTransform(p.id,p as TransformPatch),object({id:{type:'integer',minimum:0},position:VEC,rotation:VEC,scale:VEC},['id']),hasScene),
  add<{id:number;preset?:string;color?:string;metalness?:number;roughness?:number;emissive?:string;emissiveIntensity?:number;opacity?:number;alphaMode?:string;alphaCutoff?:number;doubleSided?:boolean}>('studio3d.object.material','Change the material of a 3D object','Edit',p=>need().setMaterial(p.id,p as never),object({id:{type:'integer',minimum:0},preset:{enum:MATERIAL_PRESET_IDS},emissive:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'},emissiveIntensity:{type:'number',minimum:0,maximum:MAX_EMISSIVE_INTENSITY},opacity:{type:'number',minimum:0,maximum:1},alphaMode:{enum:[...ALPHA_MODES]},alphaCutoff:{type:'number',minimum:0,maximum:1},doubleSided:{type:'boolean'},color:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'},metalness:{type:'number',minimum:0,maximum:1},roughness:{type:'number',minimum:0,maximum:1}},['id']),hasScene),
  add<{id:number}&Record<string,number>>('studio3d.object.primitive','Change the size or segments of a 3D primitive','Edit',({id,...rest})=>need().setPrimitive(id,rest),object({id:{type:'integer',minimum:0},...PRIMITIVE_PROPS},['id']),hasScene),
  add<{id:number;name:string}>('studio3d.object.rename','Rename a 3D object','Edit',p=>need().rename(p.id,p.name),object({id:{type:'integer',minimum:0},name:{type:'string',minLength:1,maxLength:120}}),hasScene),
  add<{id:number}>('studio3d.object.delete','Delete a 3D object','Edit',p=>need().remove(p.id),object({id:{type:'integer',minimum:0}}),hasScene),
  add<{id:number}>('studio3d.object.duplicate','Duplicate a 3D object','Edit',p=>need().duplicate(p.id),object({id:{type:'integer',minimum:0}}),hasScene),
  add<{fromView?:boolean}>('studio3d.insert.camera','Insert a 3D camera','Insert',p=>need().addCamera(!!p?.fromView),object({fromView:{type:'boolean'}},[]),()=>!!controller),
  add<{id:number;fov:number}>('studio3d.camera.set','Change the field of view of a 3D camera','Edit',p=>need().setCamera(p.id,{fov:p.fov}),object({id:{type:'integer',minimum:0},fov:{type:'number',minimum:1,maximum:120}}),hasScene),
  add<{id:number}>('studio3d.view.fromCamera','Look through a 3D camera','View',p=>need().viewFromCamera(p.id),object({id:{type:'integer',minimum:0}}),hasScene),
  add<{mode:GizmoMode}>('studio3d.gizmo.mode','Set the 3D transform tool','Tools',p=>need().setGizmo(p.mode),object({mode:{enum:['translate','rotate','scale']}}),()=>!!controller),
  add<{id:number;x?:number;y?:number;z?:number}>('studio3d.object.nudge','Nudge a 3D object','Edit',p=>need().nudge(p.id,p),object({id:{type:'integer',minimum:0},x:{type:'number'},y:{type:'number'},z:{type:'number'}},['id']),hasScene),
  add<Partial<EnvSettings>>('studio3d.env.set','Change the 3D environment lighting','View',p=>need().setEnv(p??{}),object({preset:{enum:['studio','sky','neutral','none','custom']},intensity:{type:'number',minimum:0,maximum:3},rotation:{type:'number',minimum:-360,maximum:360},background:{type:'boolean'}},[]),()=>!!controller),
  add('studio3d.env.open','Open an HDR environment map','View',()=>envOpener!(),undefined,()=>!!controller&&!!envOpener),
  add('studio3d.undo','Undo 3D change','Edit',()=>need().undo(),undefined,()=>!!controller&&getStudio3DState().canUndo),
  add('studio3d.redo','Redo 3D change','Edit',()=>need().redo(),undefined,()=>!!controller&&getStudio3DState().canRedo),
  add<{id:number}&LightPatch>('studio3d.light.set','Change a 3D light','Edit',p=>need().setLight(p.id,p),object({id:{type:'integer',minimum:0},intensity:{type:'number',minimum:0,maximum:100000},color:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'},shadow:{type:'boolean'},angle:{type:'number',minimum:1,maximum:90},penumbra:{type:'number',minimum:0,maximum:1},width:{type:'number',minimum:0.01,maximum:1000},height:{type:'number',minimum:0.01,maximum:1000}},['id']),hasScene),
  add<{id:number;at:PivotAt}>('studio3d.object.pivot','Move the pivot of a 3D mesh','Edit',p=>need().setPivot(p.id,p.at),object({id:{type:'integer',minimum:0},at:{enum:['center','base']}}),hasScene),
  add<{ids:number[];axis:AlignAxis;to:AlignTo}>('studio3d.object.align','Align 3D objects','Edit',p=>need().align(p.ids,p.axis,p.to),object({ids:{type:'array',items:{type:'integer',minimum:0},minItems:2,maxItems:500},axis:{enum:['x','y','z']},to:{enum:['min','center','max']}}),hasScene),
  add<{ids:number[];axis:AlignAxis}>('studio3d.object.distribute','Distribute 3D objects evenly','Edit',p=>need().distribute(p.ids,p.axis),object({ids:{type:'array',items:{type:'integer',minimum:0},minItems:3,maxItems:500},axis:{enum:['x','y','z']}}),hasScene),
  add<Partial<SnapSettings>>('studio3d.snap.set','Change 3D transform snapping','Tools',p=>need().setSnap(p&&Object.keys(p).length?p:{on:!getStudio3DState().snap.on}),object({on:{type:'boolean'},move:{type:'number',minimum:0.001,maximum:100},rotate:{type:'number',minimum:1,maximum:180},scale:{type:'number',minimum:0.001,maximum:10}},[]),()=>!!controller),
  add<RenderOptions>('studio3d.render.still','Render a PNG still of the 3D view or a 3D camera','Project',p=>need().renderStill(p??{}),object({camera:{type:'integer',minimum:0},width:{type:'integer',minimum:1,maximum:16384},height:{type:'integer',minimum:1,maximum:16384},transparent:{type:'boolean'}},[])),
  add<{slot:TextureSlot}>('studio3d.texture.open','Choose an image for a texture slot of the selected 3D object','Edit',p=>textureOpener!(p.slot),object({slot:{enum:[...TEXTURE_SLOTS]}}),()=>hasScene()&&!!textureOpener&&getStudio3DState().selectedInfo?.material!=null),
  add<{id?:number;slot:TextureSlot}>('studio3d.texture.clear','Remove the image from a texture slot','Edit',p=>need().setTextureFile(p.id??getStudio3DState().selected??-1,p.slot,null),object({id:{type:'integer',minimum:0},slot:{enum:[...TEXTURE_SLOTS]}},['slot']),hasScene),
  add<{axis:MirrorAxis;copy?:boolean;ids?:number[]}>('studio3d.mesh.mirror','Mirror 3D objects across a world axis','Edit',p=>need().mirrorSelection(p.axis,!!p.copy,p.ids),object({axis:{enum:['x','y','z']},copy:{type:'boolean'},ids:{type:'array',items:{type:'integer',minimum:0},minItems:1,maxItems:500}},['axis']),hasScene),
  add<{ids?:number[]}>('studio3d.mesh.applyScale','Apply the scale of 3D meshes to their geometry','Edit',p=>need().applyScale(p?.ids),object({ids:{type:'array',items:{type:'integer',minimum:0},minItems:1,maxItems:500}},[]),hasScene),
  add<{ids?:number[]}>('studio3d.mesh.merge','Merge 3D meshes into one','Edit',p=>need().mergeSelection(p?.ids),object({ids:{type:'array',items:{type:'integer',minimum:0},minItems:2,maxItems:500}},[]),hasScene),
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
  add<{textures?:'embed'|'external';clips?:string[]|null}>('studio3d.export.options','Set the glTF export options: texture mode and which clips to export','Project',p=>need().setExportOptions(p??{}),object({textures:{enum:['embed','external']},clips:{anyOf:[{type:'null'},{type:'array',items:{type:'string',minLength:1,maxLength:200},minItems:0,maxItems:64}]}},[])),
  add<{sidecar?:boolean;embedEnv?:boolean}>('studio3d.save','Save the 3D scene','Project',p=>need().save(!!p?.sidecar,!!p?.embedEnv),object({sidecar:{type:'boolean'},embedEnv:{type:'boolean'}},[]),hasScene),
  add<{ids?:number[]}>('studio3d.selection.delete','Delete the selected 3D objects','Edit',p=>need().deleteSelection(p?.ids),object({ids:{type:'array',items:{type:'integer',minimum:0},minItems:1,maxItems:500}},[]),hasScene),
  add<{ids?:number[]}>('studio3d.selection.duplicate','Duplicate the selected 3D objects','Edit',p=>need().duplicateSelection(p?.ids),object({ids:{type:'array',items:{type:'integer',minimum:0},minItems:1,maxItems:500}},[]),hasScene),
  add<{format:'stl'|'obj'}>('studio3d.export.mesh','Export the scene as STL or OBJ','Project',p=>need().exportMesh(p.format),object({format:{enum:['stl','obj']}}),hasScene),
  add<{unit:ExportUnit}>('studio3d.unit.set','Set the unit used for STL and OBJ export','Project',p=>need().setUnit(p.unit),object({unit:{enum:['m','cm','mm','in']}}),()=>!!controller),
  add<TurntableOptions>('studio3d.render.turntable','Render a turntable as a ZIP of PNG frames','Project',p=>need().renderTurntable(p??{}),object({frames:{type:'integer',minimum:2,maximum:360},width:{type:'integer',minimum:1,maximum:8192},height:{type:'integer',minimum:1,maximum:8192},transparent:{type:'boolean'}},[]),hasScene),
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

