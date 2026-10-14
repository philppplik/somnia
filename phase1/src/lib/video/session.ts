import {jobScheduler} from '../jobs/scheduler';
import {reportError} from '../log';
import {useSyncExternalStore} from 'react';
import type {VideoEngineLike} from './engine';
import {DEFAULT_FORMAT,exportName,type VideoFormat} from './recipe';
import {fullClip,isNeutralTimeline,moveClip,rippleDelete,sanitizeClips,setClipEdge,setCrossfade,splitAt,timelineDuration,type TimelineClip} from './timeline';
import {needsSourceFile} from './titles';
import {FilmstripController} from './filmstrip-controller';

import {fileExtension,sniffVideo} from './format';
import {openVideoDialog} from './open';
import {getMedia,setActiveMedia,subscribeMedia,registerMediaCloseGuard} from '../media';
import type {VideoCapabilities,VideoProbe,VideoProgress,VideoReport} from './protocol';
import {registerLifecycleAdapter} from '../lifecycle/adapters';
import type {StudioLifecycleAdapter,StudioSnapshot} from '../lifecycle/types';
import {VIDEO_SNAPSHOT_SCHEMA,verifyVideoSnapshot,videoSnapshotBytes,videoSnapshotChecksum,type VideoSessionSnapshot,type VideoSnapshotPayload} from './lifecycleSnapshot';
export type VideoStatus='loading'|'ready'|'error'|'exporting';
export interface VideoResult{blob:Blob;url:string;report:VideoReport}
export type VideoExportOutcome='downloaded'|'cancelled'|'unavailable';
export interface VideoSession{exportOutcome?:VideoExportOutcome;name:string;status:VideoStatus;error:string;probe:VideoProbe|null;capabilities:VideoCapabilities|null;clips:TimelineClip[];selectedClipId:string|null;format:VideoFormat;progress:VideoProgress|null;result:VideoResult|null;ext:string}
const sessions=new Map<string,VideoSession>();
const exports=new Map<string,AbortController>();
let filmstrip:FilmstripController|null|undefined;
let filmstripLoading:Promise<FilmstripController|null>|undefined;
/** Reading a controller never starts a worker. Activation explicitly requests it. */
export function getFilmstrip(){return filmstrip??null;}
export function ensureFilmstrip():Promise<FilmstripController|null>{
 if(filmstrip!==undefined)return Promise.resolve(filmstrip);
 filmstripLoading??=(async()=>{
  try{if(typeof Worker==='undefined')return filmstrip=null;
   const {FilmstripEngine}=await import('./filmstrip-engine');
   filmstrip=new FilmstripController(new FilmstripEngine(),{dpr:typeof window==='undefined'?1:window.devicePixelRatio});
   for(const [name,bytes]of sources)filmstrip.register(name,bytes.slice(0));emit();return filmstrip;
  }catch{return filmstrip=null;}
 })();return filmstripLoading;
}
const sources=new Map<string,ArrayBuffer>();
const listeners=new Set<()=>void>();
let stopMediaSync:(()=>void)|undefined;
let factory:()=>VideoEngineLike|Promise<VideoEngineLike>=async()=>new (await import('./engine')).VideoEngine();
let initializing:Promise<void>|undefined;
let engine:VideoEngineLike|undefined,capsPromise:Promise<VideoCapabilities>|undefined;
const emit=()=>listeners.forEach(l=>l());
const put=(s:VideoSession)=>{sessions.set(s.name,s);emit();};
const patch=(name:string,p:Partial<VideoSession>,cause?:unknown)=>{if(p.error)reportError('video.engine',cause??p.error,{context:{studio:'video',file:name}});const s=sessions.get(name);if(s)put({...s,...p});};
/** Tests replace the engine; production uses the mediabunny/WebCodecs worker. Drops all sessions. */
export function setVideoEngineFactory(f:()=>VideoEngineLike){for(const n of [...sessions.keys()])closeVideo(n);engine?.dispose();engine=undefined;capsPromise=undefined;factory=f;}
async function getEngine(){
 if(!engine){initializing??=(async()=>{const e=await factory();engine=e;capsPromise=e.capabilities();capsPromise.catch(()=>{if(engine===e){e.dispose();engine=undefined;capsPromise=undefined;}});})().finally(()=>{initializing=undefined;});await initializing;}
 return{engine:engine!,caps:capsPromise!};
}
const resetEngine=(error:unknown)=>{if(/disposed|timed out|worker failed|could not be decoded/i.test(String(error))){engine?.dispose();engine=undefined;capsPromise=undefined;}};
const message=(e:unknown)=>(e instanceof Error?e.message:String(e)).replace(/^Error:\s*/,'');
const revoke=(v:VideoResult|null)=>{if(v)URL.revokeObjectURL(v.url);};
export const getVideoSession=(name:string|null|undefined)=>name?sessions.get(name)??null:null;
export function subscribeVideo(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};}
export function useVideoSession(name:string|null|undefined){return useSyncExternalStore(subscribeVideo,()=>getVideoSession(name),()=>null);}
/** Probed durations of the clip sources that are still open; a missing source keeps its clips (they show as missing). */
const sourceDurations=(clips:TimelineClip[])=>Object.fromEntries([...new Set(clips.map(c=>c.source))].flatMap(n=>{const d=sessions.get(n)?.probe?.duration;return d?[[n,d]]:[];}));
/** Opens that are still fetching/probing, so concurrent callers await the same probe instead of racing it. */
const opening=new Map<string,Promise<void>>();
/** Probes a media item (idempotent; concurrent calls share the in-flight probe). The original bytes stay untouched; export renders a copy. */
export async function openVideo(item:{name:string;url:string}):Promise<void>{
 const inflight=opening.get(item.name);if(inflight)return inflight;
 if(sessions.has(item.name))return;
 const run=(async()=>{
  try{await openVideoFresh(item);}finally{opening.delete(item.name);}
 })();
 opening.set(item.name,run);
 return run;
}
async function openVideoFresh(item:{name:string;url:string}):Promise<void>{
 stopMediaSync??=subscribeMedia(()=>{const live=new Set(getMedia().items.map(i=>i.name));for(const n of [...sessions.keys()])if(!live.has(n))closeVideo(n);});
 put({name:item.name,status:'loading',error:'',probe:null,capabilities:null,clips:[],selectedClipId:null,format:DEFAULT_FORMAT,progress:null,result:null,ext:fileExtension(item.name)});
 if(getMedia().items.find(i=>i.name===item.name)?.kind==='video-project'){patch(item.name,{status:'ready',ext:''});applyVideoRecipe(item.name,item.url);return;}
 try{
  const bytes=await fetch(item.url).then(r=>r.arrayBuffer());
  const sniffed=sniffVideo(new Uint8Array(bytes,0,Math.min(bytes.byteLength,512)));
  if(!sniffed)throw new Error('not a supported video file');
  sources.set(item.name,bytes);
  const strip=await ensureFilmstrip();if(strip?.state(item.name)==='unknown')strip.register(item.name,bytes.slice(0));
  const {engine:e,caps}=await getEngine();
  const probe=await e.probe(bytes.slice(0));
  if(!sessions.has(item.name))return;
  if(!probe.video)throw new Error('no video track');
  patch(item.name,{status:'ready',error:'',probe,ext:sniffed.ext,capabilities:await caps.catch(()=>null),clips:[fullClip(item.name,probe.duration)]});
  applyVideoRecipe(item.name,item.url);
 }catch(e){resetEngine(e);if(sessions.has(item.name))patch(item.name,{status:'error',error:message(e)},e);}
}

/** Recipes stashed by the lifecycle resume, keyed by session name. Applied once when the same source re-opens. */
const pendingVideoRecipes=new Map<string,VideoSessionSnapshot>();
/**
 * Re-applies a stashed timeline after a fresh open, but only when the source
 * fingerprint matches: a re-used name with different bytes must not inherit
 * the old edit. Clips are re-sanitized against the freshly probed durations.
 */
function applyVideoRecipe(name:string,url:string){
 const recipe=pendingVideoRecipes.get(name);if(!recipe)return;
 pendingVideoRecipes.delete(name);
 if(recipe.source!==url)return;
 const s=sessions.get(name);if(!s||s.status!=='ready')return;
 const clips=sanitizeClips([...recipe.clips],sourceDurations([...recipe.clips]));
 patch(name,{clips,selectedClipId:clips.some(c=>c.id===recipe.selectedClipId)?recipe.selectedClipId:null,format:recipe.format});
}
/** Applies a timeline edit and keeps every clip inside its source bounds. */
export function editTimeline(root:string,edit:(clips:TimelineClip[])=>TimelineClip[]|null){
 const s=sessions.get(root);if(!s)return;
 const next=edit(s.clips);
 if(!next)return;
 const clean=sanitizeClips(next,sourceDurations(next));
 put({...s,clips:clean,selectedClipId:clean.some(c=>c.id===s.selectedClipId)?s.selectedClipId:null});
}
/** Appends a full-length clip of another video source (opened and probed on demand) and selects it. */
export async function addTimelineClip(root:string,item:{name:string;url:string}){
 await openVideo(item);
 const probe=sessions.get(item.name)?.probe;if(!probe)return;
 if(!sessions.get(root)?.probe)patch(root,{probe,capabilities:sessions.get(item.name)?.capabilities??null});
 const clip=fullClip(item.name,probe.duration);
 editTimeline(root,clips=>[...clips,clip]);
 patch(root,{selectedClipId:clip.id});
}
/** Adds clips straight from the file dialog and returns to the project tab (opening a file activates its own tab first). */
export async function addTimelineClipsFromDialog(root:string){
 const before=new Set(getMedia().items.map(i=>i.name));
 await openVideoDialog();
 const added=getMedia().items.filter(i=>i.kind==='video'&&!before.has(i.name));
 for(const item of added)await addTimelineClip(root,item);
 if(added.length)setActiveMedia(root);
}
export const splitTimelineAt=(root:string,time:number)=>editTimeline(root,clips=>splitAt(clips,time));
export function deleteTimelineClip(root:string,id:string){
 editTimeline(root,clips=>clips.length>1||getMedia().items.find(i=>i.name===root)?.kind==='video-project'?rippleDelete(clips,id):clips);
}
export const moveTimelineClip=(root:string,id:string,by:number)=>editTimeline(root,clips=>{const i=clips.findIndex(c=>c.id===id);return i<0?clips:moveClip(clips,id,i+by);});
export const trimTimelineClip=(root:string,id:string,edge:'in'|'out',at:number)=>editTimeline(root,clips=>setClipEdge(clips,id,edge,at));
export const setTimelineClipCrossfade=(root:string,id:string,seconds:number)=>editTimeline(root,clips=>setCrossfade(clips,id,seconds));
export function setTimelineClipGain(root:string,id:string,gain:number){
 editTimeline(root,clips=>clips.map(c=>c.id===id?{...c,gain}:c));
}
export function toggleTimelineClipMute(root:string,id:string){
 editTimeline(root,clips=>clips.map(c=>c.id===id?{...c,muted:!c.muted}:c));
}
export const selectTimelineClip=(root:string,id:string|null)=>patch(root,{selectedClipId:id});
/** Back to the original: one full-length clip of the root source, output format kept. */
export function resetTimeline(root:string){
 const s=sessions.get(root);if(!s)return;
 if(getMedia().items.find(i=>i.name===root)?.kind==='video-project'){revoke(s.result);put({...s,clips:[],selectedClipId:null,result:null});return;}
 if(!s.probe)return;
 revoke(s.result);
 put({...s,clips:[fullClip(root,s.probe.duration)],selectedClipId:null,result:null});
}
export const setVideoFormat=(root:string,format:VideoFormat)=>patch(root,{format});
/** Runs the export in the worker and keeps the result on the session. Cancel rejects quietly. */
export async function runVideoExport(name:string):Promise<'exported'|'cancelled'|'unavailable'>{
 const s=sessions.get(name);
 if(!s||s.status!=='ready'||!s.clips.length)return'unavailable';
 const clips=structuredClone(s.clips),format=s.format;
 const input:Record<string,ArrayBuffer>={};
 for(const n of new Set(clips.filter(needsSourceFile).map(c=>c.source))){
  const bytes=sources.get(n);if(!bytes){patch(name,{status:'error',error:`Clip source is no longer open: ${n}`});return'unavailable';}input[n]=bytes;
 }
 const controller=new AbortController();exports.set(name,controller);
 revoke(s.result);put({...s,status:'exporting',error:'',progress:null,result:null,exportOutcome:undefined});
 try{
  const r=await jobScheduler.run({kind:'export',priority:2,documentId:name,resources:['video.engine',...Object.keys(input).map(n=>'video.source:'+n)],exclusive:['video.export'],estimatedBytes:Object.values(input).reduce((sum,b)=>sum+b.byteLength,0),signal:controller.signal},async lease=>{
   const {engine:e}=await getEngine();const cancel=()=>e.cancelExport();lease.signal.addEventListener('abort',cancel,{once:true});
   try{lease.signal.throwIfAborted();return await e.export(Object.fromEntries(Object.entries(input).map(([n,b])=>[n,b.slice(0)])),clips,format,p=>{lease.progress(p.ratio);if(sessions.get(name)?.status==='exporting')patch(name,{progress:p});});}
   finally{lease.signal.removeEventListener('abort',cancel);}
  });
  const cur=sessions.get(name);if(!cur)return'unavailable';
  const blob=new Blob([r.bytes],{type:r.mime});
  put({...cur,status:'ready',progress:null,result:{blob,url:URL.createObjectURL(blob),report:r.report}});
  return'exported';
 }catch(e){
  if(controller.signal.aborted||e instanceof Error&&e.name==='ExportCancelled'){patch(name,{status:'ready',progress:null});return'cancelled';}
  resetEngine(e);if(sessions.has(name))patch(name,{status:'error',error:message(e),progress:null},e);
  return'unavailable';
 }finally{if(exports.get(name)===controller)exports.delete(name);}
}
/** The rendered file for download, or null while nothing has been exported. */
export function exportVideo(name:string):{blob:Blob;fileName:string}|null{
 const s=sessions.get(name);if(!s?.result)return null;
 return{blob:s.result.blob,fileName:exportName(name,!isNeutralTimeline(s.clips,name,s.probe?.duration??0),s.format)};
}
export function downloadVideo(name:string):boolean{
 const out=exportVideo(name);if(!out)return false;
 const a=document.createElement('a');a.href=URL.createObjectURL(out.blob);a.download=out.fileName;a.click();
 setTimeout(()=>URL.revokeObjectURL(a.href),30_000);return true;
}
/** Full UI flow: encode, then download the result. */
export async function exportVideoFile(name:string):Promise<'downloaded'|'cancelled'|'unavailable'>{
 // Clear the previous notification even when encoding cannot start.
 patch(name,{exportOutcome:undefined});
 const r=await runVideoExport(name);
 const outcome=r==='exported'?(downloadVideo(name)?'downloaded':'unavailable'):r;
 patch(name,{exportOutcome:outcome});
 return outcome;
}
export function cancelVideoExport(name:string){if(sessions.get(name)?.status==='exporting')exports.get(name)?.abort();}
export function closeVideo(name:string){
 sources.delete(name);
 getFilmstrip()?.unregister(name);
 const s=sessions.get(name);if(!s)return;revoke(s.result);sessions.delete(name);emit();
}
export const videoIsEdited=(s:VideoSession|null)=>!!s&&!isNeutralTimeline(s.clips,s.name,s.probe?.duration??0);
export const videoTimelineDuration=(s:VideoSession|null)=>s?timelineDuration(s.clips):0;

// Closing a view is safe; closing an exporting document requires cancelling its job first.
registerMediaCloseGuard(name=>!exports.has(name)&&!jobScheduler.needsResource('video.source:'+name));

/** RAM retained by open sessions: source bytes plus rendered export blobs. */
const estimateVideoBytes=():number=>{
 let total=0;
 for(const b of sources.values())total+=b.byteLength;
 for(const s of sessions.values())total+=s.result?.blob.size??0;
 return total;
};
/** Closes every session and disposes the decode engine; recipes live in the checkpoint. */
const suspendVideoState=():void=>{
 for(const n of [...sessions.keys()])closeVideo(n);
 engine?.dispose();engine=undefined;capsPromise=undefined;
};
let videoSnapshotRevision=0;

/**
 * Recipe-only lifecycle adapter (see lifecycleSnapshot.ts): snapshot captures
 * timelines and the source fingerprint, never source bytes. Suspension is
 * refused while a probe or export is in flight; exports additionally pin the
 * studio through their job leases (video.engine/video.export/video.source:*).
 * Playback is view-owned and stops when the lazy host unmounts, so only the
 * active studio can play - and the active studio is never a suspend candidate.
 */
export function createVideoLifecycleAdapter():StudioLifecycleAdapter{
 return{
  estimateBytes:estimateVideoBytes,
  async snapshot():Promise<StudioSnapshot|null>{
   if(opening.size>0||exports.size>0)return null;
   if([...sessions.values()].some(s=>s.status==='loading'||s.status==='exporting'))return null;
   const media=getMedia();
   const captured:VideoSessionSnapshot[]=[...sessions.values()].map(s=>({
    name:s.name,
    source:media.items.find(i=>i.name===s.name)?.url??'',
    ext:s.ext,
    clips:s.clips,
    selectedClipId:s.selectedClipId,
    format:s.format,
   }));
   // Recipes stashed by a resume but not yet re-opened stay in the checkpoint.
   const open=new Set(captured.map(s=>s.name));
   for(const [name,recipe] of pendingVideoRecipes)if(!open.has(name))captured.push(recipe);
   const payload:VideoSnapshotPayload={sessions:captured};
   // Stash immediately: a shell preview pane can re-open the file before
   // resume() runs, and the recipe must already be waiting for that open.
   for(const session of captured)pendingVideoRecipes.set(session.name,session);
   return{studioId:'video',schemaVersion:VIDEO_SNAPSHOT_SCHEMA,revision:++videoSnapshotRevision,capturedAt:Date.now(),bytesEstimate:videoSnapshotBytes(payload),checksum:videoSnapshotChecksum(payload),payload};
  },
  async suspend():Promise<void>{suspendVideoState();},
  async resume(snapshot:StudioSnapshot):Promise<void>{
   if(!verifyVideoSnapshot(snapshot))throw new Error('Video checkpoint failed verification.');
   const payload=snapshot.payload as VideoSnapshotPayload;
   for(const session of payload.sessions)pendingVideoRecipes.set(session.name,session);
  },
  async dispose():Promise<void>{pendingVideoRecipes.clear();suspendVideoState();},
 };
}
registerLifecycleAdapter('video',createVideoLifecycleAdapter);
