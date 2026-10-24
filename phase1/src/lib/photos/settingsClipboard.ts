import {sanitizePhotoSettings,type PhotoSettings} from './studioSettings';
/** Wire format for a copied develop-settings payload (also persisted in panel state for reactivity). */
export interface SettingsPayload{v:1;settings:PhotoSettings;}
export const SETTINGS_PAYLOAD_KIND='somnia/photo-settings';
/** Encode full develop settings for the sync clipboard. Geometry (crop, straighten, orientation, flips) travels too. */
export function encodeSettingsPayload(s:PhotoSettings):SettingsPayload{
 return{v:1,settings:sanitizePhotoSettings(s)};
}
/** Untrusted read back: anything malformed, unknown or the wrong version becomes null, numbers clamp into engine ranges. */
export function decodeSettingsPayload(raw:unknown):PhotoSettings|null{
 try{
  if(!raw||typeof raw!=='object')return null;
  const p=raw as Record<string,unknown>;
  if(p.v!==1||!p.settings||typeof p.settings!=='object')return null;
  return sanitizePhotoSettings(p.settings as PhotoSettings);
 }catch{return null;}
}
/** Serialized form for the optional system clipboard (best-effort; the in-app payload is the source of truth). */
export function settingsPayloadToText(p:SettingsPayload):string{
 return JSON.stringify({kind:SETTINGS_PAYLOAD_KIND,...p});
}
export function settingsPayloadFromText(text:string):PhotoSettings|null{
 try{
  const raw=JSON.parse(text) as Record<string,unknown>;
  if(!raw||raw.kind!==SETTINGS_PAYLOAD_KIND)return null;
  return decodeSettingsPayload(raw);
 }catch{return null;}
}
