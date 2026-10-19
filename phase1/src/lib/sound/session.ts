import {reportError} from '../log';
import {useSyncExternalStore} from 'react';
import {SoundEngine,type SoundEngineLike} from './engine';
import {DEFAULT_SETTINGS,exportName,isNeutral,normalizeSelection,sanitizeSettings,toRecipe,type SoundSettings} from './recipe';
import type {SoundRegionMode} from './protocol';
import {fileExtension,sniffAudio} from './format';
import {getMedia,subscribeMedia} from '../media';
import {registerLifecycleAdapter} from '../lifecycle/adapters';
import {createRecipeAdapter,fingerprintOf,RecipeStash} from '../lifecycle/recipeKit';
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
const emit=()=>listeners.forEach(l=>{try{l();}catch{/* View errors cannot change a committed settings outcome. */}});
const settingRevisions=new Map<string,number>();
const nativeHistory=new Map<string,{origin:string;before:SoundSettings;after:SoundSettings;revision:number;beforeRevision:number;original:SoundVersion}[]>();
export const soundSettingsRevision=(name:string)=>settingRevisions.get(name)??0;
let editRevision=0;
const put=(s:SoundSession)=>{editRevision++;const old=sessions.get(s.name);if(old&&old.settings!==s.settings)settingRevisions.set(s.name,soundSettingsRevision(s.name)+1);sessions.set(s.name,s);emit();};
const patch=(name:string,p:Partial<SoundSession>,cause?:unknown)=>{if(p.error)reportError('sound.engine',cause??p.error,{context:{studio:'sound',file:name}});const s=sessions.get(name);if(s)put({...s,...p});};
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
 fingerprints.set(item.name,fingerprintOf(item.url));
 const restored=lifecycleStash.take(item.name,fingerprints.get(item.name)!);
 put({name:item.name,status:'loading',error:'',settings:restored?restored.settings:DEFAULT_SETTINGS,plugins:[],original:null,processed:null,listen:'processed',selection:restored?.selection??null,progress:null});
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
 }catch(e){resetEngine(e);if(sessions.has(item.name))patch(item.name,{status:'error',error:message(e)},e);}
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
 }catch(e){resetEngine(e);if(runs.get(name)===run&&sessions.has(name))patch(name,{status:'error',error:message(e),progress:null},e);}
}
/** Renders settings to a throwaway WAV URL for listening (review of an AI proposal). Does not touch the session; the caller revokes the URL. */
export async function renderSoundPreview(name:string,settings:SoundSettings):Promise<string>{
 const s=sessions.get(name),src=sources.get(name);if(!s||!src||!s.original)throw new Error('Audio is not ready.');
 const {engine:e,ready}=getEngine();await ready;
 const r=await e.process(src.bytes.slice(0),src.ext,toRecipe(sanitizeSettings(settings),8));
 return URL.createObjectURL(new Blob([r.wav],{type:'audio/wav'}));
}
export function updateSoundSettings(name:string,change:(s:SoundSettings)=>SoundSettings){
 const s=sessions.get(name);if(!s)return;const settings=sanitizeSettings(change(s.settings));schedule(name);put({...s,settings});
}
/** Reviewed settings history is owned here, not by the agent or audio renderer. */
export function commitSoundSettings(name:string,expected:{settings:SoundSettings;revision:number},next:SoundSettings,origin:string):{outcome:'applied'|'noop';undoEntries:0|1;revision:number}{
 const s=sessions.get(name);if(!s?.original||s.status==='loading'||s.status==='processing')throw Error('Sound is not ready for settings acceptance.');
 if(!origin.startsWith('ai:'))throw Error('AI origin required.');
 if(s.settings!==expected.settings||soundSettingsRevision(name)!==expected.revision)throw Error('Sound settings changed. Refresh the preview.');
 const settings=sanitizeSettings(next);
 if(JSON.stringify(settings)===JSON.stringify(s.settings))return {outcome:'noop',undoEntries:0,revision:expected.revision};
 const revision=expected.revision+1,entry={origin,before:structuredClone(s.settings),after:structuredClone(settings),revision,beforeRevision:expected.revision,original:s.original};
 const history=[...(nativeHistory.get(name)??[]).slice(-49),entry];
 // Schedule before assignment; no await or observer between complete state/history writes.
 schedule(name);nativeHistory.set(name,history);settingRevisions.set(name,revision);sessions.set(name,{...s,settings});
 const receipt={outcome:'applied' as const,undoEntries:1 as const,revision};emit();return receipt;
}
export function undoSoundSettings(name:string,origin:string):void{
 const s=sessions.get(name),history=nativeHistory.get(name),head=history?.at(-1);
 if(!s?.original||s.status==='loading'||s.status==='processing')throw Error('Sound is not ready for undo.');
 if(!head||head.origin!==origin)throw Error('A later change exists. Undo it first.');
 if(s.original!==head.original||soundSettingsRevision(name)!==head.revision||JSON.stringify(s.settings)!==JSON.stringify(head.after))throw Error('Sound settings changed after AI edit. Not restoring over your edits.');
 const settings=structuredClone(head.before),revision=soundSettingsRevision(name)+1;
 schedule(name);history!.pop();const previous=history!.at(-1);if(previous&&previous.revision===head.beforeRevision)previous.revision=revision;
 settingRevisions.set(name,revision);sessions.set(name,{...s,settings});emit();
}
export function forgetSoundSettingsHistory(name:string){nativeHistory.delete(name);}
export const resetSoundSettings=(name:string)=>updateSoundSettings(name,()=>DEFAULT_SETTINGS);
export const setSoundListen=(name:string,listen:'original'|'processed')=>patch(name,{listen});
export function closeSound(name:string){
 clearTimeout(timers.get(name));timers.delete(name);runs.delete(name);sources.delete(name);fingerprints.delete(name);
 const s=sessions.get(name);if(!s)return;nativeHistory.delete(name);settingRevisions.delete(name);revoke(s.processed,s.original);revoke(s.original);sessions.delete(name);emit();
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
 schedule(name,0);put({...s,selection:null,settings:sanitizeSettings({...s.settings,region:{mode,...s.selection}}),listen:'processed'});
}
/** Drops the region edit and shows its range as the selection again, so it can be adjusted. */
export function clearSoundRegion(name:string){
 const s=sessions.get(name);if(!s?.settings.region)return;
 const {start,end}=s.settings.region;schedule(name,0);put({...s,selection:{start,end},settings:{...s.settings,region:null}});
}
export const isSoundExportReady=(name:string|null)=>!!name&&!timers.has(name)&&getSoundSession(name)?.status==='ready'&&!!getSoundSession(name)?.processed;
export type SaveOutcome='saved'|'cancelled'|'downloaded'|'unavailable';
/** Desktop: OS save dialog and an atomic write through a one-time grant. Browser: a download. Same bytes either way. */
export async function saveSound(name:string):Promise<SaveOutcome>{
 if(!isSoundExportReady(name))return 'unavailable';
 const out=exportSound(name);if(!out)return 'unavailable';
 return saveSoundBlob(out.blob,out.fileName);
}
/** Same save path for any rendered WAV (the Advanced Export dialog passes its own bytes). */
export async function saveSoundBlob(blob:Blob,fileName:string):Promise<SaveOutcome>{
 const {isTauri,invoke}=await import('@tauri-apps/api/core');
 if(!isTauri()){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=fileName;a.click();setTimeout(()=>URL.revokeObjectURL(url),30_000);return 'downloaded';}
 const grant=await invoke<{token:string}|null>('audio_save_pick',{suggestedName:fileName});
 if(!grant)return 'cancelled';
 await invoke('audio_save_write',new Uint8Array(await blob.arrayBuffer()),{headers:{'x-somnia-token':grant.token}});
 return 'saved';
}

/* Lifecycle (docs/studio-lifecycle.md): recipe-only checkpoints. Audio bytes, rendered WAVs and peaks are never captured; the recipe is re-applied when the same source re-opens. */
const fingerprints=new Map<string,string>();
const lifecycleStash=new RecipeStash<SoundRecipe>();
export interface SoundRecipe{settings:SoundSettings;selection:{start:number;end:number}|null}
const edited=(s:SoundSession)=>!isNeutral(s.settings)||s.selection!==null;
export function sanitizeSoundRecipe(v:unknown):SoundRecipe|null{
 const r=v as Partial<SoundRecipe>|null;if(!r||typeof r!=='object'||!r.settings||typeof r.settings!=='object')return null;
 try{
  const settings=sanitizeSettings(r.settings);
  const sel=r.selection&&Number.isFinite(r.selection.start)&&Number.isFinite(r.selection.end)&&r.selection.end>r.selection.start?{start:Math.max(0,r.selection.start),end:r.selection.end}:null;
  return{settings,selection:sel};
 }catch{return null;}
}
export function createSoundLifecycleAdapter(){
 return createRecipeAdapter<SoundRecipe>({
  studioId:'sound',schemaVersion:1,stash:lifecycleStash,
  capture:()=>[...sessions.values()].filter(s=>edited(s)&&fingerprints.has(s.name)).map(s=>({name:s.name,fingerprint:fingerprints.get(s.name)!,recipe:{settings:structuredClone(s.settings),selection:s.selection?{...s.selection}:null}})),
  release:()=>{for(const n of [...sessions.keys()])closeSound(n);engine?.dispose();engine=undefined;engineReady=undefined;},
  sanitize:sanitizeSoundRecipe,
  pinReasons:()=>{const r=new Set<string>();for(const s of sessions.values()){if(s.status==='loading'||s.status==='processing')r.add('audio-rendering');}for(const n of sessions.keys())if(timers.has(n))r.add('render-scheduled');return[...r];},
  resourceIds:()=>['studio:sound',...[...sessions.keys()].flatMap(n=>[`sound:session:${n}`,`sound.playback:${n}`])],
  estimateBytes:()=>{let n=0;for(const b of sources.values())n+=b.bytes.byteLength;for(const s of sessions.values())n+=(s.original?.blob.size??0)+(s.processed&&s.processed!==s.original?s.processed.blob.size:0);return n;},
  revision:()=>editRevision,
 });
}
/** Test seam: pending recipes of suspended documents. */
export const pendingSoundRecipes=()=>lifecycleStash.size;
registerLifecycleAdapter('sound',createSoundLifecycleAdapter);
