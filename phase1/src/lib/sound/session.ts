import {useSyncExternalStore} from 'react';
import {SoundEngine,type SoundEngineLike} from './engine';
import {DEFAULT_SETTINGS,exportName,isNeutral,normalizeSelection,sanitizeSettings,toRecipe,type SoundSettings} from './recipe';
import type {SoundRegionMode} from './protocol';
import {fileExtension,sniffAudio} from './format';
import {getMedia,subscribeMedia} from '../media';
import type {SoundPlugin,SoundProgress,SoundReport} from './protocol';
/** One rendered result: a WAV blob (also what the player plays), its waveform columns and the engine report. */
export interface SoundVersion{blob:Blob;url:string;peaks:Float32Array;report:SoundReport;ms:number}
export type SoundStatus='loading'|'ready'|'processing'|'error';
export interface SoundSession{name:string;status:SoundStatus;error:string;settings:SoundSettings;plugins:readonly SoundPlugin[];original:SoundVersion|null;processed:SoundVersion|null;listen:'original'|'processed';selection:{start:number;end:number}|null;progress:SoundProgress|null}
const DEBOUNCE_MS=200;
let factory:()=>SoundEngineLike=()=>new SoundEngine();
let engine:SoundEngineLike|undefined,engineReady:Promise<readonly SoundPlugin[]>|undefined;
const sessions=new Map<string,SoundSession>();
const sources=new Map<string,{bytes:ArrayBuffer;ext:string}>();
const timers=new Map<string,ReturnType<typeof setTimeout>>();
const runs=new Map<string,number>();
const listeners=new Set<()=>void>();
let stopMediaSync:(()=>void)|undefined;
const emit=()=>listeners.forEach(l=>l());
const put=(s:SoundSession)=>{sessions.set(s.name,s);emit();};
const patch=(name:string,p:Partial<SoundSession>)=>{const s=sessions.get(name);if(s)put({...s,...p});};
/** Tests replace the engine; production uses the WASM worker. Drops all sessions. */
export function setSoundEngineFactory(f:()=>SoundEngineLike){for(const n of [...sessions.keys()])closeSound(n);engine?.dispose();engine=undefined;engineReady=undefined;factory=f;}
function getEngine(){
 if(!engine){const e=factory();engine=e;engineReady=e.init();engineReady.catch(()=>{if(engine===e){e.dispose();engine=undefined;engineReady=undefined;}});}
 return{engine,ready:engineReady!};
}
const resetEngine=(error:unknown)=>{if(/disposed|timed out|worker failed|could not be decoded/i.test(String(error))){engine?.dispose();engine=undefined;engineReady=undefined;}};
const message=(e:unknown)=>(e instanceof Error?e.message:String(e)).replace(/^Error:\s*/,'');
const version=(r:{wav:ArrayBuffer;peaks:Float32Array;report:SoundReport;ms:number}):SoundVersion=>{const blob=new Blob([r.wav],{type:'audio/wav'});return{blob,url:URL.createObjectURL(blob),peaks:r.peaks,report:r.report,ms:r.ms};};
const revoke=(v:SoundVersion|null,keep?:SoundVersion|null)=>{if(v&&v!==keep)URL.revokeObjectURL(v.url);};
export const getSoundSession=(name:string|null|undefined)=>name?sessions.get(name)??null:null;
export function subscribeSound(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};}
export function useSoundSession(name:string|null|undefined){return useSyncExternalStore(subscribeSound,()=>getSoundSession(name),()=>null);}
/** Starts decoding a media item (idempotent). The original bytes stay untouched; every edit renders a copy. */
export async function openSound(item:{name:string;url:string}):Promise<void>{
 if(sessions.has(item.name))return;
 stopMediaSync??=subscribeMedia(()=>{const live=new Set(getMedia().items.map(i=>i.name));for(const n of [...sessions.keys()])if(!live.has(n))closeSound(n);});
 put({name:item.name,status:'loading',error:'',settings:DEFAULT_SETTINGS,plugins:[],original:null,processed:null,listen:'processed',selection:null,progress:null});
 try{
  const bytes=await fetch(item.url).then(r=>r.arrayBuffer());
  const ext=sniffAudio(new Uint8Array(bytes,0,Math.min(bytes.byteLength,16)))?.ext??fileExtension(item.name);
  sources.set(item.name,{bytes,ext});
  const {engine:e,ready}=getEngine();const plugins=await ready;
  const first=await e.process(bytes.slice(0),ext,toRecipe(DEFAULT_SETTINGS));
  if(!sessions.has(item.name))return;
  const original=version(first);
  patch(item.name,{status:'ready',error:'',plugins:plugins.filter(p=>!p.instrument&&p.offline!==false),original,processed:original});
  if(!isNeutral(sessions.get(item.name)!.settings))schedule(item.name,0);
 }catch(e){resetEngine(e);if(sessions.has(item.name))patch(item.name,{status:'error',error:message(e)});}
}
function schedule(name:string,delay=DEBOUNCE_MS){
 clearTimeout(timers.get(name));timers.set(name,setTimeout(()=>{timers.delete(name);void render(name);},delay));
}
async function render(name:string){
 const s=sessions.get(name),src=sources.get(name);if(!s||!src||!s.original)return;
 if(isNeutral(s.settings)){revoke(s.processed,s.original);runs.set(name,(runs.get(name)??0)+1);patch(name,{status:'ready',error:'',processed:s.original});return;}
 const run=(runs.get(name)??0)+1;runs.set(name,run);patch(name,{status:'processing',error:'',progress:null});
 try{
  const {engine:e,ready}=getEngine();await ready;
  const r=await e.process(src.bytes.slice(0),src.ext,toRecipe(s.settings),p=>{if(runs.get(name)===run)patch(name,{progress:p});});
  if(runs.get(name)!==run||!sessions.has(name))return;
  const next=version(r),cur=sessions.get(name)!;revoke(cur.processed,cur.original);patch(name,{status:'ready',error:'',processed:next,progress:null});
 }catch(e){resetEngine(e);if(runs.get(name)===run&&sessions.has(name))patch(name,{status:'error',error:message(e),progress:null});}
}
/** Renders settings to a throwaway WAV URL for listening (review of an AI proposal). Does not touch the session; the caller revokes the URL. */
export async function renderSoundPreview(name:string,settings:SoundSettings):Promise<string>{
 const s=sessions.get(name),src=sources.get(name);if(!s||!src||!s.original)throw new Error('Audio is not ready.');
 const {engine:e,ready}=getEngine();await ready;
 const r=await e.process(src.bytes.slice(0),src.ext,toRecipe(sanitizeSettings(settings),8));
 return URL.createObjectURL(new Blob([r.wav],{type:'audio/wav'}));
}
export function updateSoundSettings(name:string,change:(s:SoundSettings)=>SoundSettings){
 const s=sessions.get(name);if(!s)return;put({...s,settings:sanitizeSettings(change(s.settings))});schedule(name);
}
export const resetSoundSettings=(name:string)=>updateSoundSettings(name,()=>DEFAULT_SETTINGS);
export const setSoundListen=(name:string,listen:'original'|'processed')=>patch(name,{listen});
export function closeSound(name:string){
 clearTimeout(timers.get(name));timers.delete(name);runs.delete(name);sources.delete(name);
 const s=sessions.get(name);if(!s)return;revoke(s.processed,s.original);revoke(s.original);sessions.delete(name);emit();
}
/** The rendered WAV for download, or null while nothing has been decoded. Playback and export use the same bytes. */
export function exportSound(name:string):{blob:Blob;fileName:string}|null{
 const s=sessions.get(name);const v=s?.processed;if(!s||!v)return null;return{blob:v.blob,fileName:exportName(name,s.settings)};
}
export function downloadSound(name:string){
 const out=exportSound(name);if(!out)return false;
 const url=URL.createObjectURL(out.blob);const a=document.createElement('a');a.href=url;a.download=out.fileName;a.click();setTimeout(()=>URL.revokeObjectURL(url),30_000);return true;
}

/** Pending selection in seconds of the original clip (not yet an edit). Clamped to the clip; null clears it. */
export function setSoundSelection(name:string,range:{start:number;end:number}|null){
 const s=sessions.get(name);if(!s)return;
 const d=s.original?.report.input.duration_s??0;
 patch(name,{selection:range?normalizeSelection(range.start,range.end,d):null});
}
/** Turns the pending selection into an edit: crop, cut, or "apply the other steps to the selection only". */
export function applySoundRegion(name:string,mode:SoundRegionMode){
 const s=sessions.get(name);if(!s?.selection)return;
 put({...s,selection:null,settings:sanitizeSettings({...s.settings,region:{mode,...s.selection}}),listen:'processed'});schedule(name,0);
}
/** Drops the region edit and shows its range as the selection again, so it can be adjusted. */
export function clearSoundRegion(name:string){
 const s=sessions.get(name);if(!s?.settings.region)return;
 const {start,end}=s.settings.region;put({...s,selection:{start,end},settings:{...s.settings,region:null}});schedule(name,0);
}
export type SaveOutcome='saved'|'cancelled'|'downloaded'|'unavailable';
/** Desktop: OS save dialog and an atomic write through a one-time grant. Browser: a download. Same bytes either way. */
export async function saveSound(name:string):Promise<SaveOutcome>{
 const out=exportSound(name);if(!out)return 'unavailable';
 const {isTauri,invoke}=await import('@tauri-apps/api/core');
 if(!isTauri())return downloadSound(name)?'downloaded':'unavailable';
 const grant=await invoke<{token:string}|null>('audio_save_pick',{suggestedName:out.fileName});
 if(!grant)return 'cancelled';
 await invoke('audio_save_write',new Uint8Array(await out.blob.arrayBuffer()),{headers:{'x-somnia-token':grant.token}});
 return 'saved';
}
