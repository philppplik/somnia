import {useSyncExternalStore} from 'react';
import {isFamily} from '../vectorio';
/** Font families offered by the Text section. Always the generic/common list; installed system fonts are added on request (browser permission, Chromium-based webviews only). */
export const COMMON_FONTS=['sans-serif','serif','monospace','Arial','Helvetica','Times New Roman','Georgia','Verdana','Courier New'] as const;
const MAX_FONTS=500;
type FontStatus='idle'|'loading'|'done'|'unsupported'|'denied';
let system:string[]=[],status:FontStatus='idle';
const listeners=new Set<()=>void>();let snap:{system:string[];status:FontStatus}={system,status};
const emit=()=>{snap={system,status};listeners.forEach(l=>l());};
export const fontsAvailable=()=>typeof window!=='undefined'&&typeof (window as unknown as {queryLocalFonts?:unknown}).queryLocalFonts==='function';
/** Pure: unique, valid, sorted family names from the browser's font list. */
export function familiesOf(fonts:readonly {family?:unknown}[]):string[]{
 const set=new Set<string>();for(const f of fonts){if(isFamily(f.family))set.add(f.family);if(set.size>=MAX_FONTS*2)break;}
 return [...set].sort((a,b)=>a.localeCompare(b)).slice(0,MAX_FONTS);}
/** Must be called from a user gesture (button click): the browser asks for the "local fonts" permission. */
export async function loadSystemFonts():Promise<void>{
 const q=(window as unknown as {queryLocalFonts?:()=>Promise<{family?:unknown}[]>}).queryLocalFonts;
 if(!q){status='unsupported';emit();return;}
 status='loading';emit();
 try{system=familiesOf(await q.call(window));status='done';}catch{status='denied';}
 emit();}
export const useSystemFonts=()=>useSyncExternalStore(fn=>{listeners.add(fn);return()=>{listeners.delete(fn);};},()=>snap,()=>snap);
/** Options for the family select: common first, then system fonts, plus the current value when it is in neither list. */
export function fontOptions(current:string,sys:readonly string[]):string[]{
 const out=[...COMMON_FONTS,...sys.filter(f=>!(COMMON_FONTS as readonly string[]).includes(f))];
 return out.includes(current)?out:[current,...out];}
