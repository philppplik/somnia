import {commandRegistry} from '../commandRegistry';
import {registerCommandSpec} from '../commandBridge';
import type {CommandSpec} from '../commandSpec';
import {getStudio3DState,patchStudio3D} from './session';
import type {EnvSettings,GizmoMode,SnapSettings,ExportUnit,ExportFormat} from './model';
import type {PrimitiveKind,LightKind,TransformPatch,MaterialPatch,LightPatch,AlignAxis,AlignTo,PivotAt} from './stage';
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
 exportGlb():Promise<void>;
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
export function registerStudio3DEnvOpener(open:()=>void){envOpener=open;return()=>{if(envOpener===open)envOpener=null;};}
/** The canvas owns the file dialog (user gesture). */
export function registerStudio3DOpener(open:()=>void){opener=open;return()=>{if(opener===open)opener=null;};}
const VEC={type:'object',properties:{x:{type:'number'},y:{type:'number'},z:{type:'number'}},additionalProperties:false,minProperties:1};
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
  add<{id:number;color?:string;metalness?:number;roughness?:number}>('studio3d.object.material','Change the material of a 3D object','Edit',p=>need().setMaterial(p.id,p),object({id:{type:'integer',minimum:0},color:{type:'string',pattern:'^#[0-9a-fA-F]{6}$'},metalness:{type:'number',minimum:0,maximum:1},roughness:{type:'number',minimum:0,maximum:1}},['id']),hasScene),
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
  add('studio3d.export.glb','Export the scene as GLB','Project',()=>need().exportGlb()),
  add<{format:'stl'|'obj'}>('studio3d.export.mesh','Export the scene as STL or OBJ','Project',p=>need().exportMesh(p.format),object({format:{enum:['stl','obj']}}),hasScene),
  add<{unit:ExportUnit}>('studio3d.unit.set','Set the unit used for STL and OBJ export','Project',p=>need().setUnit(p.unit),object({unit:{enum:['m','cm','mm','in']}}),()=>!!controller),
  add<TurntableOptions>('studio3d.render.turntable','Render a turntable as a ZIP of PNG frames','Project',p=>need().renderTurntable(p??{}),object({frames:{type:'integer',minimum:2,maximum:360},width:{type:'integer',minimum:1,maximum:8192},height:{type:'integer',minimum:1,maximum:8192},transparent:{type:'boolean'}},[]),hasScene),
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
