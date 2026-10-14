/**
 * Parametric primitives and material presets. Pure data and validation, no three.js, so it runs under tsx --test.
 * A primitive remembers its parameters in the node's userData, which glTF stores as node extras, so a scene saved as GLB or
 * .som3d keeps its primitives editable. Every parameter has a range, and segment counts are capped so one edit cannot freeze the page.
 */
export type PrimitiveKind='cube'|'sphere'|'plane'|'cylinder'|'cone'|'torus';
export const PRIMITIVE_KINDS:readonly PrimitiveKind[]=['cube','sphere','plane','cylinder','cone','torus'];
export interface ParamSpec{id:string;min:number;max:number;step:number;/** whole numbers only (segment counts) */integer:boolean;default:number}
const size=(id:string,d:number):ParamSpec=>({id,min:0.001,max:1000,step:0.1,integer:false,default:d});
const seg=(id:string,d:number,min=1,max=256):ParamSpec=>({id,min,max,step:1,integer:true,default:d});
export const PARAM_SPECS:Record<PrimitiveKind,readonly ParamSpec[]>={
 cube:[size('width',1),size('height',1),size('depth',1),seg('segments',1,1,64)],
 sphere:[size('radius',0.5),seg('widthSegments',48,3),seg('heightSegments',24,2)],
 plane:[size('width',2),size('depth',2),seg('segments',1,1,256)],
 cylinder:[size('radius',0.5),size('height',1),seg('radialSegments',48,3)],
 cone:[size('radius',0.5),size('height',1),seg('radialSegments',48,3)],
 torus:[size('radius',0.5),size('tube',0.18),seg('radialSegments',24,3),seg('tubularSegments',64,3)],
};
/** Largest triangle count one primitive may reach. */
export const MAX_PRIMITIVE_TRIANGLES=100_000;
export type PrimitiveParams=Record<string,number>;
export interface PrimitiveData{kind:PrimitiveKind;params:PrimitiveParams}
export class PrimitiveError extends Error{constructor(message:string){super(message);this.name='PrimitiveError';}}
export const isPrimitiveKind=(v:unknown):v is PrimitiveKind=>typeof v==='string'&&(PRIMITIVE_KINDS as readonly string[]).includes(v);
export const defaultParams=(kind:PrimitiveKind):PrimitiveParams=>Object.fromEntries(PARAM_SPECS[kind].map(p=>[p.id,p.default]));
export function triangleCount(kind:PrimitiveKind,p:PrimitiveParams):number{
 switch(kind){
  case 'cube':return 12*p.segments*p.segments;
  case 'sphere':return 2*p.widthSegments*(p.heightSegments-1);
  case 'plane':return 2*p.segments*p.segments;
  case 'cylinder':return 4*p.radialSegments;
  case 'cone':return 2*p.radialSegments;
  case 'torus':return 2*p.radialSegments*p.tubularSegments;
 }
}
/** Applies a patch to current parameters. Unknown names, wrong types, out-of-range values and oversized results throw a readable error. */
export function patchParams(kind:PrimitiveKind,current:PrimitiveParams,patch:Record<string,unknown>):PrimitiveParams{
 if(!isPrimitiveKind(kind))throw new PrimitiveError(`Unknown primitive: ${String(kind)}.`);
 const specs=PARAM_SPECS[kind];const next:PrimitiveParams={...defaultParams(kind),...current};
 for(const [k,v] of Object.entries(patch)){
  if(v===undefined)continue;
  const spec=specs.find(s=>s.id===k);if(!spec)throw new PrimitiveError(`A ${kind} has no setting called ${k}.`);
  if(typeof v!=='number'||!Number.isFinite(v))throw new PrimitiveError(`${k} must be a finite number.`);
  if(spec.integer&&!Number.isInteger(v))throw new PrimitiveError(`${k} must be a whole number.`);
  if(v<spec.min||v>spec.max)throw new PrimitiveError(`${k} must be between ${spec.min} and ${spec.max}.`);
  next[k]=v;
 }
 if(kind==='torus'&&next.tube>next.radius*4)throw new PrimitiveError('tube must not be more than four times the radius.');
 if(triangleCount(kind,next)>MAX_PRIMITIVE_TRIANGLES)throw new PrimitiveError(`That would make more than ${MAX_PRIMITIVE_TRIANGLES.toLocaleString('en-US')} triangles. Use fewer segments.`);
 return next;
}
/** Reads stored node data (glTF extras). Anything that does not fit yields null, so imported files can never inject a bad primitive. */
export function readPrimitive(raw:unknown):PrimitiveData|null{
 if(!raw||typeof raw!=='object')return null;const d=raw as {kind?:unknown;params?:unknown};
 if(!isPrimitiveKind(d.kind)||!d.params||typeof d.params!=='object'||Array.isArray(d.params))return null;
 try{return{kind:d.kind,params:patchParams(d.kind,{},d.params as Record<string,unknown>)};}catch{return null;}
}
export interface MaterialPreset{id:string;color:string;metalness:number;roughness:number;/** Extra PBR fields the preset applies (a request value wins over the preset). */extras?:import('./materials').PbrExtras;/** Procedural texture generated at apply time, no image file needed. */procedural?:'wood'}
/** Starting points for the PBR sliders. Values follow common real-world references. */
export const MATERIAL_PRESETS:readonly MaterialPreset[]=[
 {id:'matte',color:'#b8bcc8',metalness:0,roughness:0.9},
 {id:'plastic',color:'#d94a4a',metalness:0,roughness:0.35},
 {id:'rubber',color:'#2a2a2e',metalness:0,roughness:0.95},
 {id:'ceramic',color:'#f2f0ea',metalness:0,roughness:0.12},
 {id:'steel',color:'#c4c7cc',metalness:1,roughness:0.3},
 {id:'gold',color:'#ffc857',metalness:1,roughness:0.25},
 {id:'copper',color:'#d9825b',metalness:1,roughness:0.35},
 {id:'brushed',color:'#a9adb3',metalness:1,roughness:0.55},
 {id:'glass',color:'#dfe9f2',metalness:0,roughness:0.06,extras:{opacity:0.28,alphaMode:'blend',doubleSided:true}},
 {id:'wood',color:'#8a5a33',metalness:0,roughness:0.7,procedural:'wood'},
];
export const MATERIAL_PRESET_IDS=MATERIAL_PRESETS.map(p=>p.id);
export interface MaterialRequest{preset?:string;color?:string;metalness?:number;roughness?:number}
/** A preset gives defaults; explicit values in the same request win. */
export function resolveMaterial(req:MaterialRequest):{color?:string;metalness?:number;roughness?:number}{
 let base:{color?:string;metalness?:number;roughness?:number}={};
 if(req.preset!==undefined){
  const p=MATERIAL_PRESETS.find(x=>x.id===req.preset);if(!p)throw new PrimitiveError(`Unknown material preset: ${String(req.preset)}.`);
  base={color:p.color,metalness:p.metalness,roughness:p.roughness};
 }
 return{...base,...(req.color!==undefined?{color:req.color}:{}),...(req.metalness!==undefined?{metalness:req.metalness}:{}),...(req.roughness!==undefined?{roughness:req.roughness}:{})};
}
