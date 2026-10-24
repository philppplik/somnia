import {neutralPhotoSettings,sanitizePhotoSettings,type PhotoSettings} from './studioSettings';
/**
 * Looks for the Photos presets panel. A look is only the tonal and colour part of PhotoSettings:
 * geometry (orientation, flips, crop, straighten) always stays with the photo, so applying a look never moves a crop.
 */
export const LOOK_KEYS=['exposure','contrast','highlights','shadows','whites','blacks','temp','tint','vibrance','saturation','texture','clarity','dehaze','sharpen','noiseLuminance','noiseColor'] as const;
export type LookKey=(typeof LOOK_KEYS)[number];
export type Look=Partial<Record<LookKey,number>>;
export interface BuiltInPreset{id:string;/** i18n key */labelKey:string;look:Look}
/** Values stay inside the engine ranges; sanitizePhotoSettings clamps anyway. Each look is a full replacement of the look keys. */
export const BUILT_IN_PRESETS:readonly BuiltInPreset[]=[
 {id:'neutral',labelKey:'photos.preset.neutral',look:{}},
 {id:'vivid',labelKey:'photos.preset.vivid',look:{contrast:18,vibrance:35,saturation:12,clarity:15,sharpen:30}},
 {id:'matte',labelKey:'photos.preset.matte',look:{contrast:-18,blacks:40,highlights:-15,saturation:-10,clarity:-8}},
 {id:'bw',labelKey:'photos.preset.bw',look:{saturation:-100,vibrance:-100,contrast:20,clarity:18}},
 {id:'warm',labelKey:'photos.preset.warm',look:{temp:7800,tint:6,vibrance:15,highlights:-10}},
 {id:'cool',labelKey:'photos.preset.cool',look:{temp:5400,tint:-4,saturation:-4,shadows:8}},
 {id:'portrait',labelKey:'photos.preset.portrait',look:{exposure:0.15,contrast:-8,highlights:-20,shadows:18,texture:-18,clarity:-10,vibrance:8}},
 {id:'landscape',labelKey:'photos.preset.landscape',look:{contrast:15,highlights:-25,shadows:25,dehaze:20,vibrance:30,clarity:20,sharpen:35}},
 {id:'lowlight',labelKey:'photos.preset.lowlight',look:{exposure:0.6,shadows:35,blacks:10,noiseLuminance:35,noiseColor:30,sharpen:20}},
 {id:'punch',labelKey:'photos.preset.punch',look:{contrast:30,whites:15,blacks:-20,clarity:25,dehaze:10,saturation:10}},
];
/** Neutral look values, used so a preset replaces earlier values instead of stacking on them. */
const NEUTRAL_LOOK:Record<LookKey,number>=Object.fromEntries(LOOK_KEYS.map(k=>[k,neutralPhotoSettings[k]])) as Record<LookKey,number>;
/** Settings with `look` applied over a neutral look; geometry is copied from `current`. */
export function applyLook(current:PhotoSettings,look:Look):PhotoSettings{
 return sanitizePhotoSettings({...current,...NEUTRAL_LOOK,...pickLook(look)});
}
function pickLook(input:Look):Look{
 const out:Look={};for(const k of LOOK_KEYS){const v=input[k];if(typeof v==='number'&&Number.isFinite(v))out[k]=v;}return out;
}
/** Only the look keys that differ from neutral, so saved presets stay small and readable. */
export function extractLook(s:PhotoSettings):Look{
 const out:Look={};for(const k of LOOK_KEYS)if(s[k]!==neutralPhotoSettings[k])out[k]=s[k];return out;
}
export const isNeutralLook=(s:PhotoSettings)=>Object.keys(extractLook(s)).length===0;
export interface UserPreset{id:string;name:string;look:Look}
export const MAX_USER_PRESETS=30,MAX_PRESET_NAME=40;
export const cleanPresetName=(name:string)=>name.replace(/\s+/g,' ').trim().slice(0,MAX_PRESET_NAME);
/** Persisted JSON is untrusted: keep only well-formed presets, clamp values through the engine ranges. */
export function parseUserPresets(raw:unknown):UserPreset[]{
 if(!Array.isArray(raw))return [];const out:UserPreset[]=[];const seen=new Set<string>();
 for(const e of raw){
  if(!e||typeof e!=='object')continue;const {id,name,look}=e as Record<string,unknown>;
  if(typeof id!=='string'||!id||seen.has(id)||typeof name!=='string'||!cleanPresetName(name)||!look||typeof look!=='object')continue;
  try{const l=extractLook(applyLook(neutralPhotoSettings,look as Look));seen.add(id);out.push({id,name:cleanPresetName(name),look:l});}catch{/* skip invalid */}
  if(out.length>=MAX_USER_PRESETS)break;
 }
 return out;
}
/** New preset from the current settings. Same name replaces (case-insensitive) so the list never grows duplicates. */
export function addUserPreset(list:readonly UserPreset[],name:string,s:PhotoSettings,newId:()=>string):UserPreset[]{
 const n=cleanPresetName(name);if(!n)return [...list];
 const key=n.toLowerCase();const existing=list.find(p=>p.name.toLowerCase()===key);
 const preset:UserPreset={id:existing?.id??newId(),name:n,look:extractLook(s)};
 const next=existing?list.map(p=>p===existing?preset:p):[...list,preset];
 return next.slice(0,MAX_USER_PRESETS);
}
export const removeUserPreset=(list:readonly UserPreset[],id:string)=>list.filter(p=>p.id!==id);
