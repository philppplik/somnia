import {settingsProblems,type ExportSettings} from './exportSettings';
/** Own export presets: the reusable part of the export setup under a name. The frame range and file name belong to one document, so they are not saved. Kept in the browser (localStorage), at most MAX_USER_PRESETS. */
export const MAX_USER_PRESETS=12;
export const MAX_PRESET_NAME=40;
const KEEP=['scale','fps','columns','dither','loop','quality','background','blur','firstNumber','colors','frameFormat','frameQuality','sheetPadding'] as const;
export type PresetSettings=Pick<ExportSettings,typeof KEEP[number]>;
export interface UserExportPreset{id:string;name:string;settings:PresetSettings;transparent:boolean}
const KEY='somnia.exportPresets.v1';
export interface PresetStore{getItem(k:string):string|null;setItem(k:string,v:string):void}
let store:PresetStore|null|undefined;let cache:readonly UserExportPreset[]|null=null;const listeners=new Set<()=>void>();
const backing=():PresetStore|null=>{if(store!==undefined)return store;try{return typeof localStorage==='undefined'?null:localStorage;}catch{return null;}};
/** Tests and non-browser hosts supply their own storage (null = none). Drops the cache. */
export function setPresetStore(s:PresetStore|null|undefined){store=s;cache=null;listeners.forEach(l=>l());}
export const presetId=(name:string)=>name.trim().toLowerCase().replace(/\s+/g,' ');
export const pickPresetSettings=(s:ExportSettings):PresetSettings=>{const o:Record<string,unknown>={};for(const k of KEEP)if(s[k]!==undefined)o[k]=s[k];return o as PresetSettings;};
function sane(x:unknown):UserExportPreset|null{
 if(!x||typeof x!=='object')return null;const p=x as Record<string,unknown>;
 if(typeof p.name!=='string'||!p.name.trim()||p.name.length>MAX_PRESET_NAME||typeof p.settings!=='object'||!p.settings||typeof p.transparent!=='boolean')return null;
 const settings=pickPresetSettings({scale:100,fps:null,from:null,to:null,...(p.settings as object)} as ExportSettings);
 if(typeof settings.scale!=='number'||settingsProblems({...settings,from:null,to:null}).length)return null;
 return {id:presetId(p.name),name:p.name.trim(),settings,transparent:p.transparent};
}
export function userExportPresets():readonly UserExportPreset[]{
 if(cache)return cache;let out:UserExportPreset[]=[];
 try{const raw=backing()?.getItem(KEY);const a=raw?JSON.parse(raw):[];if(Array.isArray(a)){const seen=new Set<string>();for(const x of a){const p=sane(x);if(p&&!seen.has(p.id)&&out.length<MAX_USER_PRESETS){seen.add(p.id);out.push(p);}}}}catch{out=[];}
 cache=out;return cache;
}
function commit(next:UserExportPreset[]){cache=next;try{backing()?.setItem(KEY,JSON.stringify(next));}catch{/* kept for this session only */}listeners.forEach(l=>l());}
export const subscribeUserPresets=(l:()=>void)=>{listeners.add(l);return()=>{listeners.delete(l);};};
const fail=(m:string):never=>{throw Object.assign(new Error(m),{expected:true});};
/** Saves (or replaces the preset of the same name). Returns the saved preset. */
export function saveUserPreset(name:string,s:ExportSettings,transparent:boolean):UserExportPreset{
 const n=typeof name==='string'?name.trim().replace(/\s+/g,' '):'';
 if(!n)return fail('Give the preset a name.');if(n.length>MAX_PRESET_NAME)return fail(`The preset name must be at most ${MAX_PRESET_NAME} characters.`);
 const settings=pickPresetSettings(s);if(settingsProblems({...settings,from:null,to:null}).length)return fail('These export settings are not valid.');
 const p:UserExportPreset={id:presetId(n),name:n,settings,transparent},cur=userExportPresets(),i=cur.findIndex(x=>x.id===p.id);
 if(i<0&&cur.length>=MAX_USER_PRESETS)return fail(`Up to ${MAX_USER_PRESETS} own presets. Delete one first.`);
 commit(i<0?[...cur,p]:cur.map((x,j)=>j===i?p:x));return p;
}
export function deleteUserPreset(id:string):void{
 const cur=userExportPresets();if(!cur.some(x=>x.id===id))return fail('Unknown preset.');commit(cur.filter(x=>x.id!==id));
}
/** Settings patch that makes the preset's fields exact (fields the preset does not set go back to their default). Range and file name are left alone. */
export function presetPatch(p:UserExportPreset):Partial<ExportSettings>{
 const o:Record<string,unknown>={};for(const k of KEEP)o[k]=p.settings[k];return o as Partial<ExportSettings>;
}
