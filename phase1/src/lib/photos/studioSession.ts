import {reportError} from '../log';
import {useSyncExternalStore} from 'react';
import {PhotosEngine,type PhotosResponse} from './engine';
import {getMedia,registerMediaCloseCleanup,registerMediaCloseGuard,subscribeMedia} from '../media';
import {defaultImageHost,editedName} from '../imageEditorHost';
import {renderAdvancedPhotoExport} from './advancedExport';
import type {PhotoAdvancedOptions} from './photosExportSchema';
import {t} from '../i18n';
import {registerLifecycleAdapter} from '../lifecycle/adapters';
import {createRecipeAdapter,fingerprintOf,RecipeStash} from '../lifecycle/recipeKit';
import {isNeutralPhoto,neutralPhotoSettings,photoSignature,sanitizePhotoSettings,PHOTO_INPUT,type PhotoCrop,type PhotoSettings} from './studioSettings';
import {applySpots,spotSignature,type HealSpot} from './healSpots';
import {applyLocalAdjust,dabSignature,applyGradFilters,gradSignature,applyRadialFilters,radSignature} from './localAdjust';
import {applyBrushStrokes,brushSignature} from './brushStrokes';
import {applyDefringe,applyVignette} from './lensCorrect';
import {applyLumMask,lumMaskNeutral,lumMaskSignature,neutralLumMask} from './lumMask';
import {applyCurves,curvesNeutral,curvesSignature,emptyCurves} from './curves';
import {applyHsl,hslNeutral,hslSignature,neutralHsl} from './hslMixer';
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
/** Identity of the source the singleton engine currently holds (sessions share one engine; last load wins). */
let loadedKey:string|null=null;
const sourceKey=(name:string,s:Pick<PhotoSettings,'spots'|'dabs'|'localEV'|'localSat'|'grads'|'gradEV'|'gradSat'|'rads'|'curves'|'hsl'|'brushes'|'lumMask'|'vignetteAmount'|'vignetteMidpoint'|'defringe'>)=>`${name}|${spotSignature(s.spots)}|${dabSignature(s.dabs)}|${s.localEV}|${s.localSat}|${gradSignature(s.grads)}|${s.gradEV}|${s.gradSat}|${radSignature(s.rads)}|${curvesSignature(s.curves)}|${hslSignature(s.hsl)}|${brushSignature(s.brushes)}|${lumMaskSignature(s.lumMask)}|${s.vignetteAmount}|${s.vignetteMidpoint}|${s.defringe}`;
/** Decodes the untouched source, stamps every spot and re-encodes PNG, so the engine previews and exports the healed image. */
async function healSource(bytes:ArrayBuffer,s:Pick<PhotoSettings,'spots'|'dabs'|'localEV'|'localSat'|'grads'|'gradEV'|'gradSat'|'rads'|'curves'|'hsl'|'brushes'|'lumMask'|'vignetteAmount'|'vignetteMidpoint'|'defringe'>):Promise<ArrayBuffer>{
 const bmp=await createImageBitmap(new Blob([bytes]));
 const c=document.createElement('canvas');c.width=bmp.width;c.height=bmp.height;
 const ctx=c.getContext('2d');if(!ctx)throw Error('No 2D context.');
 ctx.drawImage(bmp,0,0);bmp.close();
 const img=ctx.getImageData(0,0,c.width,c.height);
 const healed=applyDefringe(applyVignette(applyHsl(applyCurves(applyLumMask(applyBrushStrokes(applyRadialFilters(applyGradFilters(applyLocalAdjust(applySpots({bytes:img.data.buffer as ArrayBuffer,width:c.width,height:c.height},s.spots),s.dabs,s.localEV,s.localSat),s.grads,s.gradEV,s.gradSat),s.rads,s.gradEV,s.gradSat),s.brushes),s.lumMask),s.curves),s.hsl),s.vignetteAmount,s.vignetteMidpoint),s.defringe);
 img.data.set(new Uint8ClampedArray(healed.bytes));ctx.putImageData(img,0,0);
 const blob=await new Promise<Blob>((res,rej)=>c.toBlob(b=>b?res(b):rej(Error('Could not re-encode the healed source.')),'image/png'));
 return blob.arrayBuffer();
}
const emit=()=>listeners.forEach(l=>l());
let editRevision=0;
const put=(s:PhotoSession)=>{editRevision++;sessions.set(s.name,s);emit();};
const patch=(name:string,p:Partial<PhotoSession>,cause?:unknown)=>{if(p.error)reportError('photos.engine',cause??p.error,{context:{studio:'photos',file:name}});const s=sessions.get(name);if(s)put({...s,...p});};
export const getPhotoSession=(name:string|null|undefined)=>name?sessions.get(name)??null:null;
export const allPhotoSessions=()=>[...sessions.values()];
export function subscribePhotos(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};}
export function usePhotoSession(name:string|null|undefined){return useSyncExternalStore(subscribePhotos,()=>getPhotoSession(name),()=>null);}
export const dirtyPhoto=(s:PhotoSession)=>photoSignature(s.now)!==s.saved;
/** Tests replace the engine; production uses the WASM worker. Drops all sessions. */
export function setPhotoEngineFactory(f:()=>PhotoEngineLike){for(const n of [...sessions.keys()])closePhoto(n);engine?.dispose();engine=undefined;loadedKey=null;factory=f;}
function getEngine(){if(!engine)engine=factory();return engine;}
const resetEngine=(error:unknown)=>{if(/disposed|timed out|worker failed/i.test(String(error))){engine?.dispose();engine=undefined;loadedKey=null;}};
const message=(e:unknown)=>(e instanceof Error?e.message:String(e)).replace(/^Error:\s*/,'');
const frameOf=(r:PhotosResponse):PhotoFrame=>{if(!r.bytes||!r.width||!r.height)throw Error('The engine returned an empty render.');return{bytes:r.bytes,width:r.width,height:r.height};};
/** Settings as rendered: while cropping the frame shows the whole image so the crop rect can be placed. */
const effective=(s:PhotoSession):PhotoSettings=>s.cropping?{...s.now,crop:null}:s.now;
/** Opens a media item in a Photos session (idempotent). The original bytes stay untouched; every edit renders a copy. */
export async function openPhoto(item:{name:string;url:string;mime:string}):Promise<void>{
 if(sessions.has(item.name))return;
 stopMediaSync??=subscribeMedia(()=>{const live=new Set(getMedia().items.map(i=>i.name));for(const n of [...sessions.keys()])if(!live.has(n))closePhoto(n);});
 const blank:PhotoSession={name:item.name,status:'loading',error:'',now:{...neutralPhotoSettings},past:[],future:[],saved:photoSignature(neutralPhotoSettings),sourceWidth:0,sourceHeight:0,frame:null,original:null,cropping:false,cropDraft:null};
 fingerprints.set(item.name,fingerprintOf(item.url));
 const restored=lifecycleStash.take(item.name,fingerprints.get(item.name)!);
 if(restored)Object.assign(blank,restored);
 put(blank);
 if((PHOTO_INPUT.mimes as readonly string[]).includes(item.mime)===false){patch(item.name,{status:'error',error:t('photos.error.unsupported',{mime:item.mime})});return;}
 try{
  const bytes=await fetch(item.url).then(r=>r.arrayBuffer());
  if(bytes.byteLength===0||bytes.byteLength>PHOTO_INPUT.maxBytes)throw Error(t('photos.error.size',{max:PHOTO_INPUT.maxBytes/1_000_000}));
  sources.set(item.name,bytes);
  const e=getEngine();
  const loaded=await e.load(bytes.slice(0));loadedKey=sourceKey(item.name,{spots:[],dabs:[],localEV:0,localSat:0,grads:[],gradEV:0,gradSat:0,rads:[],curves:emptyCurves(),hsl:neutralHsl(),brushes:[],vignetteAmount:0,vignetteMidpoint:50,defringe:0,lumMask:neutralLumMask()});
  if(!sessions.has(item.name))return;
  const original=frameOf(await e.renderPhoto(neutralPhotoSettings));
  const session=sessions.get(item.name);if(!session)return;
  const current=frameOf(await e.renderPhoto(effective(session)));
  if(!sessions.has(item.name))return;
  patch(item.name,{status:'ready',error:'',sourceWidth:loaded.width??0,sourceHeight:loaded.height??0,original,frame:current});
 }catch(e){resetEngine(e);if(sessions.has(item.name))patch(item.name,{status:'error',error:message(e)},e);}
}
/** The engine is a singleton holding one loaded source: reload when this session's source is not the loaded one. */
async function ensureEngineSource(name:string):Promise<void>{
 const now=sessions.get(name)?.now;
 const prep={spots:now?.spots??[],dabs:now?.dabs??[],localEV:now?.localEV??0,localSat:now?.localSat??0,grads:now?.grads??[],gradEV:now?.gradEV??0,gradSat:now?.gradSat??0,rads:now?.rads??[],curves:now?.curves??emptyCurves(),hsl:now?.hsl??neutralHsl(),brushes:now?.brushes??[],vignetteAmount:now?.vignetteAmount??0,vignetteMidpoint:now?.vignetteMidpoint??50,defringe:now?.defringe??0,lumMask:now?.lumMask??neutralLumMask()};
 const key=sourceKey(name,prep);
 if(loadedKey===key)return;
 let bytes=sources.get(name);if(!bytes)return;
 if(prep.spots.length||prep.dabs.length||prep.grads.length||prep.rads.length||!curvesNeutral(prep.curves)||!hslNeutral(prep.hsl)||prep.brushes.length||!lumMaskNeutral(prep.lumMask)||prep.vignetteAmount!==0||prep.defringe!==0)bytes=await healSource(bytes,prep);
 const e=getEngine();await e.load(bytes.slice(0));loadedKey=key;
}
function schedule(name:string,delay=DEBOUNCE_MS){clearTimeout(timers.get(name));timers.set(name,setTimeout(()=>{timers.delete(name);void render(name);},delay));}
async function render(name:string){
 const s=sessions.get(name);if(!s||!sources.has(name)||s.status==='error')return;
 const run=(runs.get(name)??0)+1;runs.set(name,run);patch(name,{status:'processing',error:''});
 try{
  await ensureEngineSource(name);
  const e=getEngine();
  const r=frameOf(await e.renderPhoto(effective(s)));
  if(runs.get(name)!==run||!sessions.has(name))return;
  patch(name,{status:'ready',error:'',frame:r});
 }catch(e){resetEngine(e);if(runs.get(name)===run&&sessions.has(name))patch(name,{status:'error',error:message(e)},e);}
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
/** AE1 preview path: renders the advanced option pipeline without saving. */
export async function renderPhotoExportPreview(name:string,options:PhotoAdvancedOptions){
 const s=sessions.get(name);if(!s||s.status==='error'||!sources.has(name))throw Error(t('photos.error.notReady'));
 await ensureEngineSource(name);
 return renderAdvancedPhotoExport(getEngine(),s.now,options);
}
/** AE1 save path: renders with the advanced options and writes the file under the chosen name. The original is never overwritten. */
export async function exportPhotoCopyAdvanced(name:string,options:PhotoAdvancedOptions,injectedHost?:PhotoSaveHost):Promise<PhotoSaveOutcome>{
 const s=sessions.get(name);if(!s||s.status==='error'||!sources.has(name))throw Error(t('photos.error.notReady'));
 const snapshot=s.now;
 const r=await renderPhotoExportPreview(name,options);
 const ext=options.format==='png'?'png':options.format==='webp'?'webp':'jpg';
 const host=injectedHost??await defaultImageHost();
 const ok=await host.save(r.blob,`${options.name.replace(/\.[^.\\/]+$/,'').trim()||'image'}.${ext}`);
 if(ok)patch(name,{saved:photoSignature(snapshot)});
 return ok?'saved':'cancelled';
}
/** CA2 handoff path: renders the current settings to bytes without a save dialog. */
/** Bytes for a cross-studio handback: the developed render when the session is live, the untouched original when the engine cannot develop this photo (e.g. an unsupported transparent PNG). The original bytes are kept on error exactly so this path stays possible. */
export async function handBackPhotoBytes(name:string):Promise<Uint8Array>{
 const s=sessions.get(name);
 if(s&&s.status!=='error')return renderPhotoBytes(name);
 const bytes=sources.get(name);if(!bytes)throw Error(t('photos.error.notReady'));
 return new Uint8Array(bytes);
}
export async function renderPhotoBytes(name:string,format:'png'|'jpeg'='png'):Promise<Uint8Array>{
 const s=sessions.get(name);if(!s||s.status==='error'||!sources.has(name))throw Error(t('photos.error.notReady'));
 await ensureEngineSource(name);
 const r=await getEngine().exportPhoto(s.now,format);
 if(!r.bytes)throw Error('Export returned no bytes.');
 return new Uint8Array(r.bytes);
}
export type PhotoSaveOutcome='saved'|'cancelled';
export interface PhotoSaveHost {save(blob:Blob,suggestedName:string):Promise<boolean>}
/** Exports the developed copy at the engine's bounded source resolution. The original is never overwritten. */
export async function exportPhotoCopy(name:string,format:'png'|'jpeg',injectedHost?:PhotoSaveHost):Promise<PhotoSaveOutcome>{
 const s=sessions.get(name);if(!s||s.status==='error'||!sources.has(name))throw Error(t('photos.error.notReady'));
 const snapshot=s.now;
 await ensureEngineSource(name);
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
 window.addEventListener('beforeunload',e=>{if(allPhotoSessions().some(dirtyPhoto)||lifecycleStash.size>0){e.preventDefault();e.returnValue='';}});
}

/* Lifecycle (docs/studio-lifecycle.md): recipe-only checkpoints. Source bytes and frames are never captured; the recipe is re-applied when the same source re-opens. */
const fingerprints=new Map<string,string>();
const lifecycleStash=new RecipeStash<PhotoRecipe>();
export interface PhotoRecipe{now:PhotoSettings;past:PhotoSettings[];future:PhotoSettings[];saved:string}
const edited=(s:PhotoSession)=>dirtyPhoto(s)||s.past.length>0||s.future.length>0;
const settingsOf=(v:unknown):PhotoSettings|null=>{try{return v&&typeof v==='object'?sanitizePhotoSettings(v as PhotoSettings):null;}catch{return null;}};
export function sanitizePhotoRecipe(v:unknown):PhotoRecipe|null{
 const r=v as Partial<PhotoRecipe>|null;if(!r||typeof r.saved!=='string')return null;
 const now=settingsOf(r.now);if(!now)return null;
 const list=(a:unknown)=>(Array.isArray(a)?a.map(settingsOf).filter((x):x is PhotoSettings=>x!==null).slice(0,HISTORY_LIMIT):[]);
 return{now,past:list(r.past),future:list(r.future),saved:r.saved};
}
export function createPhotosLifecycleAdapter(){
 return createRecipeAdapter<PhotoRecipe>({
  studioId:'photos',schemaVersion:1,stash:lifecycleStash,
  capture:()=>[...sessions.values()].filter(s=>edited(s)&&fingerprints.has(s.name)).map(s=>({name:s.name,fingerprint:fingerprints.get(s.name)!,recipe:{now:{...s.now},past:s.past.map(x=>({...x})),future:s.future.map(x=>({...x})),saved:s.saved}})),
  release:()=>{for(const n of [...sessions.keys()])closePhoto(n);engine?.dispose();engine=undefined;loadedKey=null;},
  sanitize:sanitizePhotoRecipe,
  pinReasons:()=>{const r=new Set<string>();for(const s of sessions.values()){if(s.status==='loading'||s.status==='processing')r.add('photo-rendering');if(s.cropping)r.add('crop-in-progress');}if(gestures.size)r.add('edit-gesture');return[...r];},
  resourceIds:()=>['studio:photos','photos.engine',...[...sessions.keys()].map(n=>`photos:session:${n}`)],
  estimateBytes:()=>{let n=0;for(const b of sources.values())n+=b.byteLength;for(const s of sessions.values())n+=(s.frame?.bytes.byteLength??0)+(s.original?.bytes.byteLength??0);return n;},
  revision:()=>editRevision,
 });
}
/** Test seam: pending recipes of suspended documents. */
export const pendingPhotoRecipes=()=>lifecycleStash.size;
registerLifecycleAdapter('photos',createPhotosLifecycleAdapter);
