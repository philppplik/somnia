import {useSyncExternalStore} from 'react';
import {PhotosEngine,type PhotosResponse} from './engine';
import {getMedia,registerMediaCloseCleanup,registerMediaCloseGuard,subscribeMedia} from '../media';
import {defaultImageHost,editedName} from '../imageEditorHost';
import {t} from '../i18n';
import {isNeutralPhoto,neutralPhotoSettings,photoSignature,sanitizePhotoSettings,PHOTO_INPUT,type PhotoCrop,type PhotoSettings} from './studioSettings';
/** One decoded preview frame straight from the engine (RGBA bytes). */
export interface PhotoFrame {bytes:ArrayBuffer;width:number;height:number}
export type PhotoStatus='loading'|'ready'|'processing'|'error';
export interface PhotoSession {
 name:string;status:PhotoStatus;error:string;
 now:PhotoSettings;past:PhotoSettings[];future:PhotoSettings[];saved:string;
 sourceWidth:number;sourceHeight:number;
 /** Preview of the current settings (whole frame while cropping). */
 frame:PhotoFrame|null;
 /** Neutral render, kept for hold-to-compare. */
 original:PhotoFrame|null;
 cropping:boolean;cropDraft:PhotoCrop|null;
}
export interface PhotoEngineLike {
 load(bytes:ArrayBuffer):Promise<PhotosResponse>;
 renderPhoto(settings:PhotoSettings):Promise<PhotosResponse>;
 exportPhoto(settings:PhotoSettings,format:'png'|'jpeg'):Promise<PhotosResponse>;
 dispose():void;
}
const HISTORY_LIMIT=50;
const DEBOUNCE_MS=150;
let factory:()=>PhotoEngineLike=()=>new PhotosEngine();
let engine:PhotoEngineLike|undefined;
const sessions=new Map<string,PhotoSession>();
const sources=new Map<string,ArrayBuffer>();
const timers=new Map<string,ReturnType<typeof setTimeout>>();
const runs=new Map<string,number>();
const gestures=new Map<string,PhotoSettings>();
const listeners=new Set<()=>void>();
let stopMediaSync:(()=>void)|undefined;
const emit=()=>listeners.forEach(l=>l());
const put=(s:PhotoSession)=>{sessions.set(s.name,s);emit();};
const patch=(name:string,p:Partial<PhotoSession>)=>{const s=sessions.get(name);if(s)put({...s,...p});};
export const getPhotoSession=(name:string|null|undefined)=>name?sessions.get(name)??null:null;
export const allPhotoSessions=()=>[...sessions.values()];
export function subscribePhotos(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};}
export function usePhotoSession(name:string|null|undefined){return useSyncExternalStore(subscribePhotos,()=>getPhotoSession(name),()=>null);}
export const dirtyPhoto=(s:PhotoSession)=>photoSignature(s.now)!==s.saved;
/** Tests replace the engine; production uses the WASM worker. Drops all sessions. */
export function setPhotoEngineFactory(f:()=>PhotoEngineLike){for(const n of [...sessions.keys()])closePhoto(n);engine?.dispose();engine=undefined;factory=f;}
function getEngine(){if(!engine)engine=factory();return engine;}
const resetEngine=(error:unknown)=>{if(/disposed|timed out|worker failed/i.test(String(error))){engine?.dispose();engine=undefined;}};
const message=(e:unknown)=>(e instanceof Error?e.message:String(e)).replace(/^Error:\s*/,'');
const frameOf=(r:PhotosResponse):PhotoFrame=>{if(!r.bytes||!r.width||!r.height)throw Error('The engine returned an empty render.');return{bytes:r.bytes,width:r.width,height:r.height};};
/** Settings as rendered: while cropping the frame shows the whole image so the crop rect can be placed. */
const effective=(s:PhotoSession):PhotoSettings=>s.cropping?{...s.now,crop:null}:s.now;
/** Opens a media item in a Photos session (idempotent). The original bytes stay untouched; every edit renders a copy. */
export async function openPhoto(item:{name:string;url:string;mime:string}):Promise<void>{
 if(sessions.has(item.name))return;
 stopMediaSync??=subscribeMedia(()=>{const live=new Set(getMedia().items.map(i=>i.name));for(const n of [...sessions.keys()])if(!live.has(n))closePhoto(n);});
 const blank:PhotoSession={name:item.name,status:'loading',error:'',now:{...neutralPhotoSettings},past:[],future:[],saved:photoSignature(neutralPhotoSettings),sourceWidth:0,sourceHeight:0,frame:null,original:null,cropping:false,cropDraft:null};
 put(blank);
 if((PHOTO_INPUT.mimes as readonly string[]).includes(item.mime)===false){patch(item.name,{status:'error',error:t('photos.error.unsupported',{mime:item.mime})});return;}
 try{
  const bytes=await fetch(item.url).then(r=>r.arrayBuffer());
  if(bytes.byteLength===0||bytes.byteLength>PHOTO_INPUT.maxBytes)throw Error(t('photos.error.size',{max:PHOTO_INPUT.maxBytes/1_000_000}));
  sources.set(item.name,bytes);
  const e=getEngine();
  const loaded=await e.load(bytes.slice(0));
  if(!sessions.has(item.name))return;
  const original=frameOf(await e.renderPhoto(neutralPhotoSettings));
  const session=sessions.get(item.name);if(!session)return;
  const current=frameOf(await e.renderPhoto(effective(session)));
  if(!sessions.has(item.name))return;
  patch(item.name,{status:'ready',error:'',sourceWidth:loaded.width??0,sourceHeight:loaded.height??0,original,frame:current});
 }catch(e){resetEngine(e);sources.delete(item.name);if(sessions.has(item.name))patch(item.name,{status:'error',error:message(e)});}
}
function schedule(name:string,delay=DEBOUNCE_MS){clearTimeout(timers.get(name));timers.set(name,setTimeout(()=>{timers.delete(name);void render(name);},delay));}
async function render(name:string){
 const s=sessions.get(name);if(!s||!sources.has(name)||s.status==='error')return;
 const run=(runs.get(name)??0)+1;runs.set(name,run);patch(name,{status:'processing',error:''});
 try{
  const e=getEngine();
  const r=frameOf(await e.renderPhoto(effective(s)));
  if(runs.get(name)!==run||!sessions.has(name))return;
  patch(name,{status:'ready',error:'',frame:r});
 }catch(e){resetEngine(e);if(runs.get(name)===run&&sessions.has(name))patch(name,{status:'error',error:message(e)});}
}
/** Starts a coalesced edit gesture (a slider drag, a crop drag): one gesture is one undo step. */
export function beginPhotoGesture(name:string){const s=sessions.get(name);if(s&&!gestures.has(name))gestures.set(name,{...s.now});}
/** Updates settings inside an open gesture (no history entry yet) or as a no-op preview. */
export function previewPhotoSettings(name:string,change:(s:PhotoSettings)=>PhotoSettings){
 const s=sessions.get(name);if(!s)return;put({...s,now:sanitizePhotoSettings(change(s.now))});schedule(name);
}
/** Ends a gesture: one history entry when the settings actually changed. */
export function endPhotoGesture(name:string){
 const base=gestures.get(name);gestures.delete(name);const s=sessions.get(name);if(!s||!base)return;
 if(photoSignature(base)===photoSignature(s.now))return;
 put({...s,past:[...s.past.slice(-(HISTORY_LIMIT-1)),base],future:[]});emit();
}
/** One atomic change = one undo step (buttons: flip, rotate, reset, crop apply). */
export function commitPhotoSettings(name:string,change:(s:PhotoSettings)=>PhotoSettings){
 const s=sessions.get(name);if(!s)return;
 const next=sanitizePhotoSettings(change(s.now));
 if(photoSignature(next)===photoSignature(s.now))return;
 put({...s,now:next,past:[...s.past.slice(-(HISTORY_LIMIT-1)),{...s.now}],future:[]});schedule(name,0);
}
export const resetPhoto=(name:string)=>commitPhotoSettings(name,()=>({...neutralPhotoSettings}));
export function historyPhoto(name:string,redo:boolean){
 const s=sessions.get(name);if(!s)return;
 // future is newest-first: undo prepends, redo consumes from the front.
 const next=redo?s.future[0]:s.past[s.past.length-1];if(!next)return;
 put({...s,now:{...next},past:redo?[...s.past,{...s.now}]:s.past.slice(0,-1),future:redo?s.future.slice(1):[{...s.now},...s.future]});schedule(name,0);
}
/** Rotates in quarter turns. The crop frame is reset, because its rect lives in the oriented frame. */
export function rotatePhoto(name:string,direction:1|-1){
 commitPhotoSettings(name,s=>({...s,orientation:(((s.orientation+direction)%4+4)%4) as PhotoSettings['orientation'],crop:null}));
 if(sessions.get(name)?.cropping)patch(name,{cropping:false,cropDraft:null});
}
export const flipPhoto=(name:string,axis:'h'|'v')=>commitPhotoSettings(name,s=>axis==='h'?{...s,flipH:!s.flipH}:{...s,flipV:!s.flipV});
/** Crop mode: the preview switches to the whole frame and the overlay edits a draft rect. */
export function setPhotoCropping(name:string,cropping:boolean){
 const s=sessions.get(name);if(!s||s.cropping===cropping)return;
 put({...s,cropping,cropDraft:cropping?(s.now.crop??{x0:0,y0:0,x1:1,y1:1}):null});schedule(name,0);
}
export function setPhotoCropDraft(name:string,rect:PhotoCrop){const s=sessions.get(name);if(s?.cropping)put({...s,cropDraft:rect});}
/** Applies the draft rect as one undo step; a near-full frame counts as no crop. */
export function applyPhotoCrop(name:string){
 const s=sessions.get(name);if(!s?.cropping||!s.cropDraft)return;
 const r=s.cropDraft;const full=r.x0<=0.001&&r.y0<=0.001&&r.x1>=0.999&&r.y1>=0.999;
 const crop=full?null:r;
 put({...s,cropping:false,cropDraft:null});
 commitPhotoSettings(name,now=>({...now,crop}));
}
export function cancelPhotoCrop(name:string){const s=sessions.get(name);if(s?.cropping){put({...s,cropping:false,cropDraft:null});schedule(name,0);}}
export function closePhoto(name:string){
 clearTimeout(timers.get(name));timers.delete(name);runs.delete(name);gestures.delete(name);sources.delete(name);
 if(sessions.delete(name))emit();
}
export type PhotoSaveOutcome='saved'|'cancelled';
export interface PhotoSaveHost {save(blob:Blob,suggestedName:string):Promise<boolean>}
/** Exports the developed copy at the engine's bounded source resolution. The original is never overwritten. */
export async function exportPhotoCopy(name:string,format:'png'|'jpeg',injectedHost?:PhotoSaveHost):Promise<PhotoSaveOutcome>{
 const s=sessions.get(name);if(!s||s.status==='error'||!sources.has(name))throw Error(t('photos.error.notReady'));
 const snapshot=s.now;
 const r=await getEngine().exportPhoto(snapshot,format);
 if(!r.bytes)throw Error('Export returned no bytes.');
 const host=injectedHost??await defaultImageHost();
 const ok=await host.save(new Blob([r.bytes],{type:format==='png'?'image/png':'image/jpeg'}),editedName(name,format==='png'?'png':'jpg'));
 if(ok)patch(name,{saved:photoSignature(snapshot)});
 return ok?'saved':'cancelled';
}
/** A neutral re-render exists per session, so "is anything unexported" is exact. */
export function markPhotoExportedForTest(name:string,snapshot:PhotoSettings){patch(name,{saved:photoSignature(snapshot)});}
if(typeof window!=='undefined'){
 registerMediaCloseGuard(name=>{
  const s=getPhotoSession(name);
  return!s||!dirtyPhoto(s)||window.confirm(t('photos.discard',{name}));
 });
 registerMediaCloseCleanup(name=>closePhoto(name));
 window.addEventListener('beforeunload',e=>{if(allPhotoSessions().some(dirtyPhoto)){e.preventDefault();e.returnValue='';}});
}
