/**
 * User-saved material presets kept in local storage under one key. Pure data and validation, no three.js, so it runs under tsx --test.
 * A preset is a named PBR patch (colour, metalness, roughness, emissive, opacity, alpha mode); saving the same name again overwrites it.
 */
import {ALPHA_MODES,MAX_EMISSIVE_INTENSITY,type AlphaMode,type PbrExtras} from './materials';
export interface MaterialPreset extends Required<PbrExtras>{name:string;color:string;metalness:number;roughness:number}
export const MAX_MATERIAL_PRESETS=50;
export const MAX_PRESET_NAME=60;
const KEY='somnia.studio3d.materialPresets.v1';
const HEX=/^#[0-9a-fA-F]{6}$/;
export interface KeyValueStore{getItem(k:string):string|null;setItem(k:string,v:string):void}
export class MaterialPresetError extends Error{constructor(message:string){super(message);this.name='MaterialPresetError';}}
const num=(v:unknown,min:number,max:number,what:string):number=>{
 if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw new MaterialPresetError(`${what} must be between ${min} and ${max}.`);return v;
};
/** Validates one preset and returns a trimmed copy; throws MaterialPresetError with a readable reason. */
export function checkPreset(p:MaterialPreset):MaterialPreset{
 const name=(p?.name??'').trim();
 if(!name)throw new MaterialPresetError('A preset needs a name.');
 if(name.length>MAX_PRESET_NAME)throw new MaterialPresetError(`A preset name can be at most ${MAX_PRESET_NAME} characters.`);
 if(typeof p.color!=='string'||!HEX.test(p.color))throw new MaterialPresetError('color must look like #rrggbb.');
 if(typeof p.emissive!=='string'||!HEX.test(p.emissive))throw new MaterialPresetError('emissive must look like #rrggbb.');
 if(typeof p.doubleSided!=='boolean')throw new MaterialPresetError('doubleSided must be true or false.');
 if(!(ALPHA_MODES as readonly string[]).includes(p.alphaMode))throw new MaterialPresetError(`alphaMode must be one of ${ALPHA_MODES.join(', ')}.`);
 return{name,color:p.color,metalness:num(p.metalness,0,1,'metalness'),roughness:num(p.roughness,0,1,'roughness'),emissive:p.emissive,
  emissiveIntensity:num(p.emissiveIntensity,0,MAX_EMISSIVE_INTENSITY,'emissiveIntensity'),opacity:num(p.opacity,0,1,'opacity'),
  alphaMode:p.alphaMode,alphaCutoff:num(p.alphaCutoff,0,1,'alphaCutoff'),doubleSided:p.doubleSided};
}
/** Reads every stored preset; entries that fail validation are dropped. */
export function readPresets(store:KeyValueStore):MaterialPreset[]{
 try{
  const raw=JSON.parse(store.getItem(KEY)||'[]');
  if(!Array.isArray(raw))return[];
  const out:MaterialPreset[]=[];
  for(const r of raw){
   if(out.length>=MAX_MATERIAL_PRESETS)break;
   try{const p=checkPreset(r as MaterialPreset);if(!out.some(x=>x.name===p.name))out.push(p);}catch{/* skip one bad entry */}
  }
  return out;
 }catch{return[];}
}
const writeAll=(store:KeyValueStore,list:MaterialPreset[])=>store.setItem(KEY,JSON.stringify(list));
/** Saves a preset, replacing an existing one with the same name. Throws when the library is full. */
export function savePreset(store:KeyValueStore,preset:MaterialPreset):MaterialPreset[]{
 const p=checkPreset(preset);
 const list=readPresets(store);
 const at=list.findIndex(x=>x.name===p.name);
 if(at>=0)list[at]=p;
 else{
  if(list.length>=MAX_MATERIAL_PRESETS)throw new MaterialPresetError(`The preset library is full (${MAX_MATERIAL_PRESETS}). Remove one first.`);
  list.push(p);
 }
 writeAll(store,list);return list;
}
/** Removes a preset by name; throws when it does not exist. */
export function removePreset(store:KeyValueStore,name:string):MaterialPreset[]{
 const list=readPresets(store);
 const at=list.findIndex(x=>x.name===name);
 if(at<0)throw new MaterialPresetError(`There is no preset called "${name}".`);
 list.splice(at,1);writeAll(store,list);return list;
}
/** The PBR patch a preset applies through the material command (one undo step per apply). */
export function presetPatch(p:MaterialPreset):PbrExtras&{color:string;metalness:number;roughness:number}{
 return{color:p.color,metalness:p.metalness,roughness:p.roughness,emissive:p.emissive,emissiveIntensity:p.emissiveIntensity,opacity:p.opacity,
  alphaMode:p.alphaMode,alphaCutoff:p.alphaCutoff,doubleSided:p.doubleSided};
}
