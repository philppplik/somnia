import type {ExportSchema,ExportValues} from '../export/schema';
import {UNIT_IDS,type ExportUnit} from './model';
/** 3D options for the shared Advanced Export dialog (AE2): one dialog over GLB, glTF, STL, OBJ and PNG still. */
export type Studio3DExportFormat='glb'|'gltf'|'stl'|'obj'|'png';
export const STUDIO3D_EXPORT_FORMATS:readonly Studio3DExportFormat[]=['glb','gltf','stl','obj','png'];
export const STUDIO3D_RENDER_MAX=16384;
export interface Studio3DAdvancedOptions{
 format:Studio3DExportFormat;name:string;textures:'embed'|'external';selectionOnly:boolean;unit:ExportUnit;
 customSize:boolean;width:number;height:number;transparent:boolean;
}
export const STUDIO3D_EXPORT_DEFAULTS:Studio3DAdvancedOptions={format:'glb',name:'',textures:'embed',selectionOnly:false,unit:'m',customSize:false,width:1920,height:1080,transparent:false};
export function valuesToStudio3DOptions(values:ExportValues):Studio3DAdvancedOptions{
 const d=STUDIO3D_EXPORT_DEFAULTS;const str=(k:string,f:string)=>typeof values[k]==='string'?values[k] as string:f;
 const num=(k:string,f:number)=>typeof values[k]==='number'&&Number.isFinite(values[k] as number)?values[k] as number:f;
 const format=str('format',d.format),unit=str('unit',d.unit);
 return {
  format:(STUDIO3D_EXPORT_FORMATS as readonly string[]).includes(format)?format as Studio3DExportFormat:d.format,
  name:str('name','').trim(),textures:str('textures',d.textures)==='external'?'external':'embed',
  selectionOnly:values.selectionOnly===true,unit:(UNIT_IDS as string[]).includes(unit)?unit as ExportUnit:d.unit,
  customSize:values.customSize===true,width:Math.round(num('width',d.width)),height:Math.round(num('height',d.height)),transparent:values.transparent===true,
 };
}
export const studio3DOptionsToValues=(o:Studio3DAdvancedOptions):ExportValues=>({...o});
export interface Studio3DExportContext{
 /** Objects currently selected (selection-only export needs at least one). */
 selected:number;
 /** The scene has at least one mesh or object to write. */
 hasContent:boolean;
 /** Largest render size the GPU allows; capped at 16384. */
 maxRender:number;
}
export function studio3DExportSchema(ctx:Studio3DExportContext):ExportSchema{
 const mesh=(v:ExportValues)=>v.format==='stl'||v.format==='obj';
 const gltfFamily=(v:ExportValues)=>v.format==='glb'||v.format==='gltf';
 return {studio:'studio3d',defaults:studio3DOptionsToValues(STUDIO3D_EXPORT_DEFAULTS),validate:values=>{
  const o=valuesToStudio3DOptions(values);
  if(!o.name)return 'export.error.name';
  if(o.format!=='png'&&!ctx.hasContent)return 'export.error.empty3d';
  if(o.format!=='png'&&o.format!=='stl'&&o.format!=='obj'&&o.selectionOnly&&ctx.selected<1)return 'export.error.selection';
  if(o.format==='png'&&o.customSize){const m=Math.min(ctx.maxRender,STUDIO3D_RENDER_MAX);if(o.width<1||o.height<1||o.width>m||o.height>m)return 'export.error.size3d';}
  return null;
 },fields:[
  {id:'format',type:'select',labelKey:'export.format',options:[{value:'glb',labelKey:'GLB'},{value:'gltf',labelKey:'glTF'},{value:'stl',labelKey:'STL'},{value:'obj',labelKey:'OBJ'},{value:'png',labelKey:'export.format.still'}]},
  {id:'name',type:'text',labelKey:'export.name',maxLength:120},
  {id:'textures',type:'select',labelKey:'export.textures',group:'export.group.output',options:[{value:'embed',labelKey:'export.textures.embed'},{value:'external',labelKey:'export.textures.external'}],visibleWhen:v=>v.format==='gltf'},
  {id:'selectionOnly',type:'checkbox',labelKey:'export.selectionOnly',group:'export.group.output',visibleWhen:gltfFamily},
  {id:'unit',type:'select',labelKey:'export.unit',group:'export.group.output',options:UNIT_IDS.map(u=>({value:u,labelKey:u})),visibleWhen:mesh},
  {id:'customSize',type:'checkbox',labelKey:'export.customSize',group:'export.group.size',visibleWhen:v=>v.format==='png'},
  {id:'width',type:'number',labelKey:'export.width',group:'export.group.size',min:1,max:STUDIO3D_RENDER_MAX,step:1,unit:'px',visibleWhen:v=>v.format==='png'&&v.customSize===true},
  {id:'height',type:'number',labelKey:'export.height',group:'export.group.size',min:1,max:STUDIO3D_RENDER_MAX,step:1,unit:'px',visibleWhen:v=>v.format==='png'&&v.customSize===true},
  {id:'transparent',type:'checkbox',labelKey:'export.transparent',group:'export.group.output',visibleWhen:v=>v.format==='png'},
 ]};
}
export interface Studio3DExportStep{id:string;payload?:Record<string,unknown>}
/** The registered commands the host runs, in order. The dialog adds no export logic of its own. */
export function studio3DExportPlan(o:Studio3DAdvancedOptions):Studio3DExportStep[]{
 const name=o.name;
 if(o.format==='png')return [{id:'studio3d.render.still',payload:{name,transparent:o.transparent,...(o.customSize?{width:o.width,height:o.height}:{})}}];
 if(o.format==='stl'||o.format==='obj')return [{id:'studio3d.unit.set',payload:{unit:o.unit}},{id:'studio3d.export.mesh',payload:{format:o.format,name}}];
 const opts:Record<string,unknown>={selection:o.selectionOnly};if(o.format==='gltf')opts.textures=o.textures;
 return [{id:'studio3d.export.options',payload:opts},{id:o.format==='glb'?'studio3d.export.glb':'studio3d.export.gltf',payload:{name}}];
}
