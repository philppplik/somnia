/**
 * Drag payloads from the asset panels (insert primitives, material list, material presets) into the viewport.
 * Pure data and validation, no three.js, so it runs under tsx --test.
 */
import {PRIMITIVE_KINDS,MATERIAL_PRESETS,type PrimitiveKind} from './primitives';
export const ASSET_MIME='application/x-somnia3d-asset';
/** A primitive placed at the drop point, a scene material assigned to the dropped mesh, or a preset applied to it. */
export type AssetDrag=
 |{kind:'primitive';primitive:PrimitiveKind}
 |{kind:'material';key:string}
 |{kind:'preset';preset:string}
 |{kind:'userPreset';name:string};
const BUILT_IN=new Set<string>(MATERIAL_PRESETS.map(p=>p.id));
export const assetDragData=(a:AssetDrag):string=>JSON.stringify(a);
/** Parses a drop payload; anything not produced by assetDragData is rejected. */
export function parseAssetDrag(text:string):AssetDrag|null{
 if(!text)return null;
 let v:unknown;try{v=JSON.parse(text);}catch{return null;}
 if(typeof v!=='object'||v===null)return null;
 const o=v as Record<string,unknown>;
 if(o.kind==='primitive')return PRIMITIVE_KINDS.includes(o.primitive as PrimitiveKind)?{kind:'primitive',primitive:o.primitive as PrimitiveKind}:null;
 if(o.kind==='material')return typeof o.key==='string'&&o.key.length>0&&o.key.length<=64?{kind:'material',key:o.key}:null;
 if(o.kind==='preset')return typeof o.preset==='string'&&BUILT_IN.has(o.preset)?{kind:'preset',preset:o.preset}:null;
 if(o.kind==='userPreset')return typeof o.name==='string'&&o.name.length>0&&o.name.length<=60?{kind:'userPreset',name:o.name}:null;
 return null;
}
