import {decodeSettingsPayload,encodeSettingsPayload,type SettingsPayload} from './settingsClipboard';
import {photoSignature,type PhotoSettings} from './studioSettings';
/**
 * Named snapshots of one photo's FULL develop settings (geometry included), stored per photo name.
 * Unlike the linear undo history, versions survive jumps and later edits; unlike presets (looks),
 * a version restores the whole state of one specific photo. Persisted via the panel-state store.
 */
export interface PhotoVersion{id:string;name:string;payload:SettingsPayload}
export type VersionBook=Record<string,PhotoVersion[]>;
export const MAX_VERSIONS_PER_PHOTO=20,MAX_VERSION_NAME=40;
export const cleanVersionName=(name:string)=>name.replace(/\s+/g,' ').trim().slice(0,MAX_VERSION_NAME);
/** Persisted JSON is untrusted: keep only well-formed versions with a decodable settings payload. */
export function parseVersionBook(raw:unknown):VersionBook{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return {};
 const out:VersionBook={};
 for(const [photo,list] of Object.entries(raw as Record<string,unknown>)){
  if(!photo||!Array.isArray(list))continue;
  const seen=new Set<string>();const vs:PhotoVersion[]=[];
  for(const e of list){
   if(!e||typeof e!=='object')continue;const {id,name,payload}=e as Record<string,unknown>;
   if(typeof id!=='string'||!id||seen.has(id)||typeof name!=='string'||!cleanVersionName(name))continue;
   if(decodeSettingsPayload(payload)===null)continue;
   seen.add(id);vs.push({id,name:cleanVersionName(name),payload:payload as SettingsPayload});
   if(vs.length>=MAX_VERSIONS_PER_PHOTO)break;
  }
  if(vs.length>0)out[photo]=vs;
 }
 return out;
}
/** Snapshot of `settings` under `name`. Same name replaces (case-insensitive); past the cap the oldest version goes. */
export function addVersion(book:VersionBook,photo:string,name:string,settings:PhotoSettings,newId:()=>string):VersionBook{
 const n=cleanVersionName(name);if(!photo||!n)return {...book};
 const list=book[photo]??[];const key=n.toLowerCase();const existing=list.find(v=>v.name.toLowerCase()===key);
 const version:PhotoVersion={id:existing?.id??newId(),name:n,payload:encodeSettingsPayload(settings)};
 const next=existing?list.map(v=>v===existing?version:v):[...list,version].slice(-MAX_VERSIONS_PER_PHOTO);
 return {...book,[photo]:next};
}
/** Removes one version; an empty photo entry leaves the book so the store stays small. */
export function removeVersion(book:VersionBook,photo:string,id:string):VersionBook{
 const list=(book[photo]??[]).filter(v=>v.id!==id);
 const next={...book};if(list.length>0)next[photo]=list;else delete next[photo];
 return next;
}
/** The settings a version restores, or null when its payload no longer decodes (already filtered by parse, kept for safety). */
export const versionSettings=(v:PhotoVersion)=>decodeSettingsPayload(v.payload);
/** Render-equality with the live settings: drives the "you are here" marker, so geometry-only twins still match. */
export const isCurrentVersion=(v:PhotoVersion,settings:PhotoSettings)=>{
 const s=versionSettings(v);return s!==null&&photoSignature(s)===photoSignature(settings);
};
