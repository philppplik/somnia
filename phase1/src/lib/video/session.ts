import {reportError} from '../log';
import {useSyncExternalStore} from 'react';
import {VideoEngine,type VideoEngineLike} from './engine';
import {DEFAULT_EXPORT_OPTIONS,DEFAULT_FORMAT,exportName,sanitizeExportOptions,type VideoExportOptions,type VideoFormat} from './recipe';
import {LOWER_THIRD,CENTER_OVERLAY,newImageOverlay,newVideoOverlay,newTitleOverlay,overlaysAt as _overlaysAt,sanitizeOverlayClips,sanitizeRect,type OverlayClip,type OverlayRect} from './overlayTrack';
import {cuesToTitleOverlays,parseSubtitles} from './subtitles';
import {cropOf,fadeInOf,fadeOutOf,flipOf,hasCrop,rotationOf,CLIP_ROTATIONS,fullClip,isFreeze,IMAGE_DEFAULT_SECONDS,newClipId,MIN_CLIP_SECONDS as MIN_EXPORT_RANGE,sliceTimeline,type ClipCrop,type ClipFlip,type ClipRotation,type ClipTransition,isNeutralTimeline,moveClip,rippleDelete,sanitizeClips,setClipEdge,setClipFades,setClipSpeed,setCropKey,setCropKeys,clearCropKeys,setGainKey,setGainKeys,clearGainKeys,setCrossfade,setReversed,setTransition,transitionOf,isReversed,speedOf,splitAt,timelineDuration,type TimelineClip} from './timeline';
import {VIDEO_HISTORY_LIMIT,emptyVideoHistory,pushHistory,redoHistory,undoHistory,type VideoHistory,type VideoSnapshot} from './history';
import {audioTrackEnd,duplicateAudioClip,fullAudioClip,moveAudioClip,removeAudioClip,resizeAudioClip,sanitizeAudioClips,setAudioClipDuck,setAudioClipEdge,setAudioClipFades,setAudioClipGain,setAudioClipMuted,type AudioClip,sliceAudioClips} from './audioTrack';
import {clipsSignature,parseVideoProject,projectFileName,serializeVideoProject} from './projectFile';
import {upsertKey,type Key} from './keyframes';
import {sanitizeTitleSpec,clampTitleSeconds,insertClip,insertIndexAfter,isTitleClip,needsSourceFile} from './titles';
import {FilmstripController} from './filmstrip-controller';
import {FilmstripEngine} from './filmstrip-engine';
import {fileExtension,sniffVideo} from './format';
import {openVideoDialog} from './open';
import {closeMediaForced,getMedia,setActiveMedia,subscribeMedia,type MediaKind} from '../media';
import {registerWorkProvider} from '../workDocs';
import {registerLifecycleAdapter} from '../lifecycle/adapters';
import {createRecipeAdapter,fingerprintOf,RecipeStash} from '../lifecycle/recipeKit';
import type {VideoCapabilities,VideoProbe,VideoProgress,VideoReport} from './protocol';
export type VideoStatus='loading'|'ready'|'error'|'exporting';
export interface VideoResult{blob:Blob;url:string;report:VideoReport}
export type VideoExportOutcome='downloaded'|'cancelled'|'unavailable';
export interface VideoSession{exportOutcome?:VideoExportOutcome;name:string;status:VideoStatus;error:string;probe:VideoProbe|null;capabilities:VideoCapabilities|null;clips:TimelineClip[];/** The free-placed audio track (music/voiceover), mixed over the edit list. */
audioClips:AudioClip[];selectedClipId:string|null;/** Selection on the audio track; selecting one track clears the other. */
selectedAudioClipId:string|null;/** Titles and images drawn over the running video. */overlayClips:OverlayClip[];selectedOverlayClipId:string|null;history:VideoHistory;/** Signature of the clip list at the last save/load; the session is dirty when the current list differs. */
savedSig:string;format:VideoFormat;exportOptions:VideoExportOptions;exportRange:{start:number;end:number}|null;progress:VideoProgress|null;result:VideoResult|null;ext:string}
const sessions=new Map<string,VideoSession>();
let filmstrip:FilmstripController|null|undefined;
/** One filmstrip controller per app run; null where workers are unavailable (unit tests, SSR). */
export function getFilmstrip(){
 if(filmstrip===undefined){
  try{filmstrip=typeof Worker==='undefined'?null:new FilmstripController(new FilmstripEngine(),{dpr:typeof window==='undefined'?1:window.devicePixelRatio});}
  catch{filmstrip=null;}
 }
 return filmstrip;
}
const sources=new Map<string,ArrayBuffer>();
const listeners=new Set<()=>void>();
let stopMediaSync:(()=>void)|undefined;
let factory:()=>VideoEngineLike=()=>new VideoEngine();
let engine:VideoEngineLike|undefined,capsPromise:Promise<VideoCapabilities>|undefined;
const emit=()=>listeners.forEach(l=>l());
let editRevision=0;
const put=(s:VideoSession)=>{editRevision++;sessions.set(s.name,s);emit();};
const patch=(name:string,p:Partial<VideoSession>,cause?:unknown)=>{if(p.error)reportError('video.engine',cause??p.error,{context:{studio:'video',file:name}});const s=sessions.get(name);if(s)put({...s,...p});};
/** Tests replace the engine; production uses the mediabunny/WebCodecs worker. Drops all sessions. */
export function setVideoEngineFactory(f:()=>VideoEngineLike){for(const n of [...sessions.keys()])closeVideo(n);engine?.dispose();engine=undefined;capsPromise=undefined;factory=f;}
function getEngine(){
 if(!engine){const e=factory();engine=e;capsPromise=e.capabilities();capsPromise.catch(()=>{if(engine===e){e.dispose();engine=undefined;capsPromise=undefined;}});}
 return{engine,caps:capsPromise!};
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
 fingerprints.set(item.name,fingerprintOf(item.url));
 const restored=lifecycleStash.take(item.name,fingerprints.get(item.name)!);
 const restore=()=>{if(restored&&sessions.has(item.name))patch(item.name,recipePatch(restored));};
 put({name:item.name,status:'loading',error:'',probe:null,capabilities:null,clips:[],audioClips:[],overlayClips:[],selectedOverlayClipId:null,selectedClipId:null,selectedAudioClipId:null,history:emptyVideoHistory(),savedSig:clipsSignature([],[]),format:DEFAULT_FORMAT,exportOptions:DEFAULT_EXPORT_OPTIONS,exportRange:null,progress:null,result:null,ext:fileExtension(item.name)});
 if(getMedia().items.find(i=>i.name===item.name)?.kind==='video-project'){
  try{
   const text=await fetch(item.url).then(r=>r.text());
   if(!text.trim()){patch(item.name,{status:'ready',ext:''});restore();return;}
   const parsed=parseVideoProject(text);
   const clips=sanitizeClips(parsed.clips,sourceDurations(parsed.clips));
   const audioClips=sanitizeAudioClips(parsed.audioClips,{});
   const overlayClips=parsed.overlayClips;
   patch(item.name,{status:'ready',ext:'',clips,audioClips,overlayClips,format:parsed.format,exportOptions:parsed.exportOptions,savedSig:clipsSignature(clips,audioClips,overlayClips)});
   restore();
  }catch(e){patch(item.name,{status:'error',error:message(e)},e);}
  return;
 }
 try{
  const bytes=await fetch(item.url).then(r=>r.arrayBuffer());
  const sniffed=sniffVideo(new Uint8Array(bytes,0,Math.min(bytes.byteLength,512)));
  if(!sniffed)throw new Error('not a supported video file');
  sources.set(item.name,bytes);
  getFilmstrip()?.register(item.name,bytes.slice(0));
  const {engine:e,caps}=getEngine();
  const probe=await e.probe(bytes.slice(0));
  if(!sessions.has(item.name))return;
  if(!probe.video)throw new Error('no video track');
  const first=[fullClip(item.name,probe.duration)];
  patch(item.name,{status:'ready',error:'',probe,ext:sniffed.ext,capabilities:await caps.catch(()=>null),clips:first,savedSig:clipsSignature(first,[])});
  restore();
 }catch(e){resetEngine(e);if(sessions.has(item.name))patch(item.name,{status:'error',error:message(e)},e);}
}
/** Field-level clip equality: a clamped no-op edit must not flood the undo stack. */
const sameClips=(a:TimelineClip[],b:TimelineClip[])=>a.length===b.length&&a.every((c,i)=>{
 const d=b[i];return c.id===d.id&&c.source===d.source&&c.in_s===d.in_s&&c.out_s===d.out_s&&c.gain===d.gain&&c.muted===d.muted&&c.kind===d.kind&&c.crossfade_s===d.crossfade_s&&c.title===d.title&&flipOf(c)===flipOf(d)&&fadeInOf(c)===fadeInOf(d)&&fadeOutOf(c)===fadeOutOf(d)&&c.freeze===d.freeze&&rotationOf(c)===rotationOf(d)&&transitionOf(c)===transitionOf(d)&&isReversed(c)===isReversed(d)&&JSON.stringify(cropOf(c))===JSON.stringify(cropOf(d))&&JSON.stringify(c.cropKeys??null)===JSON.stringify(d.cropKeys??null)&&JSON.stringify(c.gainKeys??null)===JSON.stringify(d.gainKeys??null);
});
/** Applies a timeline edit, keeps every clip inside its source bounds and records the previous state as one undo step. `historyKey` coalesces a continuous gesture (trim drag, gain slider, title typing) into a single step. */
export function editTimeline(root:string,edit:(clips:TimelineClip[])=>TimelineClip[]|null,opts?:{historyKey?:string}){
 const s=sessions.get(root);if(!s)return;
 const next=edit(s.clips);
 if(!next)return;
 const clean=sanitizeClips(next,sourceDurations(next));
 if(sameClips(clean,s.clips))return;
 put({...s,clips:clean,selectedClipId:clean.some(c=>c.id===s.selectedClipId)?s.selectedClipId:null,history:pushHistory(s.history,{clips:s.clips,audioClips:s.audioClips,overlayClips:s.overlayClips},opts?.historyKey??null,Date.now())});
}
/** Restores a snapshot: clamps both tracks against the sources that are still open and keeps the selection only when it survives. */
const restoreTimeline=(root:string,step:{history:VideoHistory;snapshot:VideoSnapshot}|null)=>{
 const s=sessions.get(root);if(!s||!step)return;
 const clean=sanitizeClips(step.snapshot.clips,sourceDurations(step.snapshot.clips));
 const cleanAudio=sanitizeAudioClips(step.snapshot.audioClips,audioDurationsOf(step.snapshot.audioClips));
 const cleanOverlays=sanitizeOverlayClips(step.snapshot.overlayClips??s.overlayClips);
 put({...s,clips:clean,audioClips:cleanAudio,overlayClips:cleanOverlays,selectedOverlayClipId:cleanOverlays.some(c=>c.id===s.selectedOverlayClipId)?s.selectedOverlayClipId:null,selectedClipId:clean.some(c=>c.id===s.selectedClipId)?s.selectedClipId:null,selectedAudioClipId:cleanAudio.some(c=>c.id===s.selectedAudioClipId)?s.selectedAudioClipId:null,history:step.history});
};
const snapshotOf=(s:VideoSession):VideoSnapshot=>({clips:s.clips,audioClips:s.audioClips,overlayClips:s.overlayClips});
/** One timeline edit back (video AND audio track). The export result is not revived - re-export after undoing. */
export const undoVideoEdit=(root:string)=>{const s=sessions.get(root);restoreTimeline(root,s?undoHistory(s.history,snapshotOf(s)):null);};
/** Re-applies the newest undone edit. */
export const redoVideoEdit=(root:string)=>{const s=sessions.get(root);restoreTimeline(root,s?redoHistory(s.history,snapshotOf(s)):null);};
export const videoCanUndo=(s:VideoSession|null)=>!!s&&s.history.past.length>0;
export const videoCanRedo=(s:VideoSession|null)=>!!s&&s.history.future.length>0;
/** Probed durations of audio-track sources (audio files and videos alike), filled when a clip is added. */
const audioDurations=new Map<string,number>();
const audioDurationsOf=(clips:AudioClip[])=>Object.fromEntries([...new Set(clips.map(c=>c.source))].flatMap(n=>{const d=audioDurations.get(n);return d?[[n,d]]:[];}));
const sameAudio=(a:AudioClip[],b:AudioClip[])=>a.length===b.length&&a.every((c,i)=>{const d=b[i];return c.id===d.id&&c.source===d.source&&c.in_s===d.in_s&&c.out_s===d.out_s&&c.at===d.at&&c.gain===d.gain&&c.muted===d.muted&&c.duck===d.duck&&c.fadeIn===d.fadeIn&&c.fadeOut===d.fadeOut;});
/** Applies an audio-track edit and records the previous state (both tracks) as one undo step. */
export function editAudioTrack(root:string,edit:(clips:AudioClip[])=>AudioClip[]|null,opts?:{historyKey?:string}){
 const s=sessions.get(root);if(!s)return;
 const next=edit(s.audioClips);
 if(!next)return;
 const clean=sanitizeAudioClips(next,audioDurationsOf(next));
 if(sameAudio(clean,s.audioClips))return;
 put({...s,audioClips:clean,selectedAudioClipId:clean.some(c=>c.id===s.selectedAudioClipId)?s.selectedAudioClipId:null,history:pushHistory(s.history,{clips:s.clips,audioClips:s.audioClips,overlayClips:s.overlayClips},opts?.historyKey??null,Date.now())});
}
/** Adds an audio file's full range to the track at `at` (default: end of the current content). Probes the source on demand. */
export async function addAudioTrackClip(root:string,item:{name:string;url:string},at?:number):Promise<string|null>{
 const s=sessions.get(root);if(!s)return null;
 let duration=audioDurations.get(item.name);
 if(duration===undefined){
  const cached=sources.get(item.name);
  const bytes:ArrayBuffer=cached??await fetch(item.url).then(r=>r.arrayBuffer());
  if(!cached)sources.set(item.name,bytes);
  const{engine:e}=getEngine();
  const probe=await e.probe(bytes.slice(0));
  if(!probe.audio){patch(root,{status:'error',error:`"${item.name}" has no audio track.`});return null;}
  // Register audio-only sources for the waveform peaks decode; video sources registered themselves on open.
  const fs=getFilmstrip();
  if(fs&&fs.state(item.name)==='unknown')fs.register(item.name,bytes.slice(0));
  duration=probe.duration;audioDurations.set(item.name,duration);
 }
 const clip=fullAudioClip(item.name,duration,at??Math.max(timelineDuration(s.clips),audioTrackEnd(s.audioClips)));
 editAudioTrack(root,clips=>[...clips,clip]);
 return clip.id;
}
export const moveAudioTrackClip=(root:string,id:string,at:number,historyKey?:string)=>editAudioTrack(root,clips=>moveAudioClip(clips,id,at),historyKey?{historyKey}:undefined);
export const trimAudioTrackClip=(root:string,id:string,edge:'in'|'out',at:number,historyKey?:string)=>editAudioTrack(root,clips=>setAudioClipEdge(clips,id,edge,at),historyKey?{historyKey}:undefined);
/** Drags an audio clip edge to a timeline time (lane interaction; see resizeAudioClip). */
export const resizeAudioTrackClip=(root:string,id:string,edge:'in'|'out',timelineTime:number,historyKey?:string)=>editAudioTrack(root,clips=>resizeAudioClip(clips,id,edge,timelineTime),historyKey?{historyKey}:undefined);
export const setAudioTrackClipGain=(root:string,id:string,gain:number,historyKey?:string)=>editAudioTrack(root,clips=>setAudioClipGain(clips,id,gain),historyKey?{historyKey}:undefined);
export const setAudioTrackClipFades=(root:string,id:string,fadeIn:number,fadeOut:number)=>editAudioTrack(root,clips=>setAudioClipFades(clips,id,fadeIn,fadeOut));
export const deleteAudioTrackClip=(root:string,id:string)=>editAudioTrack(root,clips=>removeAudioClip(clips,id));

const sameOverlays=(a:OverlayClip[],b:OverlayClip[])=>a.length===b.length&&a.every((c,i)=>JSON.stringify(c)===JSON.stringify(b[i]));
/** Applies an overlay-track edit and records the previous state (all tracks) as one undo step. */
export function editOverlays(root:string,edit:(clips:OverlayClip[])=>OverlayClip[]|null,opts?:{historyKey?:string}){
 const s=sessions.get(root);if(!s)return;
 const next=edit(s.overlayClips);
 if(!next)return;
 const clean=sanitizeOverlayClips(next);
 if(sameOverlays(clean,s.overlayClips))return;
 put({...s,overlayClips:clean,selectedOverlayClipId:clean.some(c=>c.id===s.selectedOverlayClipId)?s.selectedOverlayClipId:null,history:pushHistory(s.history,{clips:s.clips,audioClips:s.audioClips,overlayClips:s.overlayClips},opts?.historyKey??null,Date.now())});
}
/** Adds a title overlay (lower third) at `at` and selects it. */
export const addOverlayTitle=(root:string,at:number)=>{const c=newTitleOverlay({},at);editOverlays(root,clips=>[...clips,c]);patch(root,{selectedOverlayClipId:c.id,selectedClipId:null,selectedAudioClipId:null});return c.id;};
/** Adds an image overlay (centered half-frame) at `at` and selects it. */
export const addOverlayImage=(root:string,source:string,at:number)=>{const c=newImageOverlay(source,at);editOverlays(root,clips=>[...clips,c]);patch(root,{selectedOverlayClipId:c.id,selectedClipId:null,selectedAudioClipId:null});return c.id;};
/** Imports SRT/VTT subtitle text as lower-third title overlays; returns the cue count (0 = nothing parsed). */
export const importSubtitleText=(root:string,text:string):number=>{
 const ovs=cuesToTitleOverlays(parseSubtitles(text));
 if(!ovs.length)return 0;
 editOverlays(root,clips=>[...clips,...ovs]);
 patch(root,{selectedOverlayClipId:ovs[ovs.length-1].id,selectedClipId:null,selectedAudioClipId:null});
 return ovs.length;
};
export const addOverlayVideo=(root:string,source:string,at:number)=>{const c=newVideoOverlay(source,at);editOverlays(root,clips=>[...clips,c]);patch(root,{selectedOverlayClipId:c.id,selectedClipId:null,selectedAudioClipId:null});return c.id;};
export const selectOverlayClip=(root:string,id:string|null)=>patch(root,{selectedOverlayClipId:id,...(id?{selectedClipId:null,selectedAudioClipId:null}:{})});
export const deleteOverlayClip=(root:string,id:string)=>editOverlays(root,clips=>clips.filter(c=>c.id!==id));
export const moveOverlayClip=(root:string,id:string,at:number,historyKey?:string)=>editOverlays(root,clips=>clips.map(c=>c.id===id?{...c,at:Math.max(0,at)}:c),historyKey?{historyKey}:undefined);
export const setOverlayInS=(root:string,id:string,seconds:number,historyKey?:string)=>editOverlays(root,clips=>clips.map(c=>c.id===id&&c.kind==='video'?{...c,in_s:Math.max(0,seconds)}:c),historyKey?{historyKey}:undefined);
export const setOverlayDuration=(root:string,id:string,seconds:number,historyKey?:string)=>editOverlays(root,clips=>clips.map(c=>c.id===id?{...c,duration:seconds}:c),historyKey?{historyKey}:undefined);
export const setOverlayRect=(root:string,id:string,rect:OverlayRect,historyKey?:string)=>editOverlays(root,clips=>clips.map(c=>c.id===id?{...c,rect:sanitizeRect(rect)}:c),historyKey?{historyKey}:undefined);
export const setOverlayGain=(root:string,id:string,gain:number,historyKey?:string)=>editOverlays(root,clips=>clips.map(c=>c.id===id&&c.kind==='video'?{...c,gain}:c),historyKey?{historyKey}:undefined);
export const setOverlayOpacity=(root:string,id:string,opacity:number,historyKey?:string)=>editOverlays(root,clips=>clips.map(c=>c.id===id?{...c,opacity}:c),historyKey?{historyKey}:undefined);
/** Sets or replaces a rect key at overlay-local time t (the first key seeds t=0 with the current static rect). */
export const setOverlayRectKey=(root:string,id:string,t:number,rect:OverlayRect,historyKey?:string)=>editOverlays(root,clips=>clips.map(c=>c.id===id?{...c,rectKeys:upsertKey(c.rectKeys,{t:0,v:c.rect},t,sanitizeRect(rect))}:c),historyKey?{historyKey}:undefined);
/** Sets or replaces an opacity key at overlay-local time t (the first key seeds t=0 with the current static opacity). */
export const setOverlayOpacityKey=(root:string,id:string,t:number,opacity:number,historyKey?:string)=>editOverlays(root,clips=>clips.map(c=>c.id===id?{...c,opacityKeys:upsertKey(c.opacityKeys,{t:0,v:c.opacity},t,Math.min(1,Math.max(0,opacity)))}:c),historyKey?{historyKey}:undefined);
/** Clears one animated property (rect or opacity) back to its static value. */
export const clearOverlayKeys=(root:string,id:string,prop:'rect'|'opacity')=>editOverlays(root,clips=>clips.map(c=>{if(c.id!==id)return c;const o={...c};if(prop==='rect')delete o.rectKeys;else delete o.opacityKeys;return o;}));
/** Patches the text/style spec of a title overlay. */
export const updateOverlayTitle=(root:string,id:string,spec:Partial<import('./titles').TitleSpec>)=>editOverlays(root,clips=>clips.map(c=>c.id===id&&c.kind==='title'?{...c,title:sanitizeTitleSpec({...c.title,...spec})}:c));
/** Duplicates an audio clip (optionally at a position) and selects the copy. Returns the copy's id. */
export function duplicateAudioTrackClip(root:string,id:string,at?:number):string|null{
 const s=sessions.get(root);if(!s)return null;
 const src=s.audioClips.find(c=>c.id===id);if(!src)return null;
 let copyId:string|null=null;
 editAudioTrack(root,clips=>{
  const before=clips.length;
  const next=duplicateAudioClip(clips,id,at);
  if(next.length===before)return null;
  copyId=next[next.length-1].id;
  return next;
 });
 if(copyId)patch(root,{selectedAudioClipId:copyId,selectedClipId:null});
 return copyId;
}
export const setAudioTrackClipDuck=(root:string,id:string,duck:number)=>editAudioTrack(root,clips=>setAudioClipDuck(clips,id,duck));
export const toggleAudioTrackClipMute=(root:string,id:string)=>editAudioTrack(root,clips=>{const c=clips.find(x=>x.id===id);return c?setAudioClipMuted(clips,id,!c.muted):null;});
/** Inserts a still image as a clip (default 5 s) after the clip at `at` (or at the end) and selects it. No probing needed. */
export function addImageClip(root:string,item:{name:string},seconds?:number,at?:number):string|null{
 const s=sessions.get(root);if(!s)return null;
 const clip:TimelineClip={id:newClipId(),kind:'image',source:item.name,in_s:0,out_s:clampTitleSeconds(seconds??IMAGE_DEFAULT_SECONDS),gain:1,muted:false};
 editTimeline(root,clips=>insertClip(clips,clip,at===undefined?clips.length:insertIndexAfter(clips,at)));
 patch(root,{selectedClipId:clip.id,selectedAudioClipId:null});
 return clip.id;
}
/** Swaps a clip's source for another open media item, keeping trim, speed, gain, fades and flip. Media clips are re-probed and clamped into the new source's bounds; image clips swap the file name directly. Titles refuse. */
export async function replaceClipSource(root:string,id:string,item:{name:string;url:string;kind?:string}):Promise<boolean>{
 const s=sessions.get(root);if(!s)return false;
 const clip=s.clips.find(c=>c.id===id);
 if(!clip||isTitleClip(clip)||clip.source===item.name)return false;
 if(clip.kind==='image'){
  editTimeline(root,clips=>clips.map(c=>c.id===id?{...c,source:item.name}:c));
  return true;
 }
 await openVideo(item as {name:string;url:string});
 const probe=sessions.get(item.name)?.probe;if(!probe)return false;
 const dur=probe.duration;
 editTimeline(root,clips=>clips.map(c=>{
  if(c.id!==id)return c;
  const len=c.out_s-c.in_s,in_s=Math.min(c.in_s,Math.max(0,dur-MIN_EXPORT_RANGE));
  return{...c,source:item.name,in_s:Number(in_s.toFixed(3)),out_s:Number(Math.min(dur,in_s+len).toFixed(3))};
 }));
 return true;
}
/** Sets a clip's mirror (media and image clips; 'none' clears). */
export function setTimelineClipFlip(root:string,id:string,flip:ClipFlip){
 const s=sessions.get(root);if(!s)return;
 const clip=s.clips.find(c=>c.id===id);
 if(!clip||isTitleClip(clip))return;
 editTimeline(root,clips=>clips.map(c=>c.id===id?{...c,flip:flip==='none'?undefined:flip}:c));
}
/** Sets a clip's quarter-turn rotation (media and image clips; 0 clears). */
export function setTimelineClipRotation(root:string,id:string,rotation:ClipRotation){
 const s=sessions.get(root);if(!s)return;
 const clip=s.clips.find(c=>c.id===id);
 if(!clip||isTitleClip(clip)||!CLIP_ROTATIONS.includes(rotation))return;
 editTimeline(root,clips=>clips.map(c=>c.id===id?{...c,rotation:rotation===0?undefined:rotation}:c));
}
/** Sets a clip's frame crop (media and image clips; null or all-zero clears). Values are normalized to [0,0.9] per edge, 0.9 per axis. */
export function setTimelineClipCrop(root:string,id:string,crop:ClipCrop|null){
 const s=sessions.get(root);if(!s)return;
 const clip=s.clips.find(c=>c.id===id);
 if(!clip||isTitleClip(clip))return;
 editTimeline(root,clips=>clips.map(c=>{
  if(c.id!==id)return c;
  const next=cropOf({...c,crop:crop??undefined});
  return next.left||next.top||next.right||next.bottom?{...c,crop:next}:(()=>{const o={...c};delete o.crop;return o;})();
 }));
}
/** Duplicates a timeline clip right after the original and selects the copy. Works for media, title and image clips. */
export function duplicateTimelineClip(root:string,id:string):string|null{
 const s=sessions.get(root);if(!s)return null;
 const src=s.clips.find(c=>c.id===id);if(!src)return null;
 const copy:TimelineClip={...src,id:newClipId()};
 editTimeline(root,clips=>{const i=clips.findIndex(c=>c.id===id);return i<0?clips:[...clips.slice(0,i+1),copy,...clips.slice(i+1)];});
 patch(root,{selectedClipId:copy.id,selectedAudioClipId:null});
 return copy.id;
}
/** Sets an image clip's on-screen duration. No-op for other clip kinds. */
export function setImageClipLength(root:string,id:string,seconds:number,historyKey?:string){
 const s=sessions.get(root);if(!s)return;
 const clip=s.clips.find(c=>c.id===id);
 if(!clip||clip.kind!=='image')return;
 editTimeline(root,clips=>clips.map(c=>c.id===id?{...c,out_s:clampTitleSeconds(seconds)}:c),historyKey?{historyKey}:undefined);
}
/** Appends a full-length clip of another video source (opened and probed on demand) and selects it. */
export async function addTimelineClip(root:string,item:{name:string;url:string},at?:number){
 await openVideo(item);
 const probe=sessions.get(item.name)?.probe;if(!probe)return;
 if(!sessions.get(root)?.probe)patch(root,{probe,capabilities:sessions.get(item.name)?.capabilities??null});
 const clip=fullClip(item.name,probe.duration);
 editTimeline(root,clips=>at===undefined?[...clips,clip]:insertClip(clips,clip,insertIndexAfter(clips,at)));
 patch(root,{selectedClipId:clip.id,selectedAudioClipId:null});
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
export const trimTimelineClip=(root:string,id:string,edge:'in'|'out',at:number,historyKey?:string)=>editTimeline(root,clips=>setClipEdge(clips,id,edge,at),historyKey?{historyKey}:undefined);
export const setTimelineClipCrossfade=(root:string,id:string,seconds:number,historyKey?:string)=>editTimeline(root,clips=>setCrossfade(clips,id,seconds),historyKey?{historyKey}:undefined);
export const setTimelineClipTransition=(root:string,id:string,tr:ClipTransition)=>editTimeline(root,clips=>setTransition(clips,id,tr));
export const setTimelineClipReversed=(root:string,id:string,on:boolean)=>editTimeline(root,clips=>setReversed(clips,id,on));
export const setTimelineClipCropKey=(root:string,id:string,t:number,crop:ClipCrop,historyKey?:string)=>editTimeline(root,clips=>setCropKey(clips,id,t,crop),historyKey?{historyKey}:undefined);
export const setTimelineClipCropKeys=(root:string,id:string,keys:Key<ClipCrop>[]|undefined)=>editTimeline(root,clips=>setCropKeys(clips,id,keys));
export const clearTimelineClipCropKeys=(root:string,id:string)=>editTimeline(root,clips=>clearCropKeys(clips,id));
export const setTimelineClipGainKey=(root:string,id:string,t:number,gain:number,historyKey?:string)=>editTimeline(root,clips=>setGainKey(clips,id,t,gain),historyKey?{historyKey}:undefined);
export const clearTimelineClipGainKeys=(root:string,id:string)=>editTimeline(root,clips=>clearGainKeys(clips,id));
export const setTimelineClipFades=(root:string,id:string,fadeIn:number,fadeOut:number,historyKey?:string)=>editTimeline(root,clips=>setClipFades(clips,id,fadeIn,fadeOut),historyKey?{historyKey}:undefined);
/** Freezes a media clip on one source frame (default: its first frame); null unfreezes back to normal playback over the same timeline length. */
export function setTimelineClipFreeze(root:string,id:string,frame:number|null){
 const s=sessions.get(root);if(!s)return;
 const clip=s.clips.find(c=>c.id===id);
 if(!clip||isTitleClip(clip)||clip.kind==='image')return;
 editTimeline(root,clips=>clips.map(c=>{
  if(c.id!==id)return c;
  if(frame===null){
   if(!isFreeze(c))return c;
   const start=c.freeze!,o:TimelineClip={...c,in_s:Number(start.toFixed(3)),out_s:Number((start+c.out_s).toFixed(3))};
   delete o.freeze;return o;
  }
  if(isFreeze(c))return{...c,freeze:Math.max(0,frame)};
  const dur=(c.out_s-c.in_s)/speedOf(c);
  return{...c,freeze:Math.max(0,Math.min(frame,c.out_s)),in_s:0,out_s:Number(dur.toFixed(3)),speed:undefined,fadeIn:undefined,fadeOut:undefined};
 }));
}
export function setTimelineClipGain(root:string,id:string,gain:number,historyKey?:string){
 editTimeline(root,clips=>clips.map(c=>c.id===id?{...c,gain}:c),historyKey?{historyKey}:undefined);
}
export function setTimelineClipSpeed(root:string,id:string,speed:number){
 editTimeline(root,clips=>setClipSpeed(clips,id,speed));
}
export function toggleTimelineClipMute(root:string,id:string){
 editTimeline(root,clips=>clips.map(c=>c.id===id?{...c,muted:!c.muted}:c));
}
export const selectTimelineClip=(root:string,id:string|null)=>patch(root,{selectedClipId:id,...(id?{selectedAudioClipId:null}:{})});
/** Selects an audio-track clip (or clears with null). Selecting a video clip clears this. */
export const selectAudioTrackClip=(root:string,id:string|null)=>patch(root,{selectedAudioClipId:id,...(id?{selectedClipId:null}:{})});
/** Back to the original: one full-length clip of the root source, output format kept. */
export function resetTimeline(root:string){
 const s=sessions.get(root);if(!s)return;
 const project=getMedia().items.find(i=>i.name===root)?.kind==='video-project';
 if(!project&&!s.probe)return;
 const next=project?[]:[fullClip(root,s.probe!.duration)];
 if(!s.clips.length&&!s.audioClips.length&&!project)return;
 revoke(s.result);
 const changed=s.clips.length>0||s.audioClips.length>0;
 put({...s,clips:next,audioClips:[],overlayClips:[],selectedOverlayClipId:null,selectedClipId:null,selectedAudioClipId:null,result:null,history:changed?pushHistory(s.history,{clips:s.clips,audioClips:s.audioClips,overlayClips:s.overlayClips},null,Date.now()):s.history});
}
export const setVideoFormat=(root:string,format:VideoFormat)=>patch(root,{format});
/** Limits the export to a timeline range (seconds, clamped to the timeline; null or an empty range exports everything). */
export const setVideoExportRange=(root:string,range:{start:number;end:number}|null)=>{
 const s=sessions.get(root);if(!s)return;
 if(!range){patch(root,{exportRange:null});return;}
 const total=timelineDuration(s.clips);
 const start=Math.min(Math.max(0,range.start),total),end=Math.min(Math.max(0,range.end),total);
 const next=end-start>=MIN_EXPORT_RANGE?{start:Number(start.toFixed(3)),end:Number(end.toFixed(3))}:null;
 patch(root,{exportRange:next&&next.start<=0&&next.end>=total?null:next});
};
/** Sets export resolution scale and encoder quality (clamped to the supported presets). */
export const setVideoExportOptions=(root:string,o:Partial<VideoExportOptions>)=>{const s=sessions.get(root);if(s)patch(root,{exportOptions:sanitizeExportOptions({...s.exportOptions,...o})});};
/** Runs the export in the worker and keeps the result on the session. Cancel rejects quietly. */
export async function runVideoExport(name:string):Promise<'exported'|'cancelled'|'unavailable'>{
 const s=sessions.get(name);
 if(!s||s.status!=='ready'||!s.clips.length)return'unavailable';
 const clipSources:Record<string,ArrayBuffer>={};
 for(const n of new Set([...s.clips.filter(needsSourceFile).map(c=>c.source),...s.audioClips.map(c=>c.source)])){
  const bytes=sources.get(n);
  if(!bytes){patch(name,{status:'error',error:`Clip source "${n}" is no longer open. Re-open the file to export this timeline.`});return'unavailable';}
  clipSources[n]=bytes.slice(0);
 }
 revoke(s.result);put({...s,status:'exporting',error:'',progress:null,result:null,exportOutcome:undefined});
 try{
  const{engine:e}=getEngine();
  const range=s.exportRange;
 const clips=range?sliceTimeline(s.clips,range.start,range.end):s.clips;
 const audioClips=range?sliceAudioClips(s.audioClips,range.start,range.end):s.audioClips;
 if(!clips.length){patch(name,{status:'error',error:'The export range is empty.'});return'unavailable';}
 const r=await e.export(clipSources,clips,s.format,p=>{if(sessions.get(name)?.status==='exporting')patch(name,{progress:p});},audioClips,s.exportOptions,s.overlayClips);
  const cur=sessions.get(name);if(!cur)return'unavailable';
  const blob=new Blob([r.bytes],{type:r.mime});
  put({...cur,status:'ready',progress:null,result:{blob,url:URL.createObjectURL(blob),report:r.report}});
  return'exported';
 }catch(e){
  if(e instanceof Error&&e.name==='ExportCancelled'){patch(name,{status:'ready',progress:null});return'cancelled';}
  resetEngine(e);if(sessions.has(name))patch(name,{status:'error',error:message(e),progress:null},e);
  return'unavailable';
 }
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
export function cancelVideoExport(name:string){if(sessions.get(name)?.status==='exporting')engine?.cancelExport();}
export function closeVideo(name:string){
 sources.delete(name);fingerprints.delete(name);
 getFilmstrip()?.unregister(name);
 const s=sessions.get(name);if(!s)return;revoke(s.result);sessions.delete(name);emit();
}
export const videoIsEdited=(s:VideoSession|null)=>!!s&&!isNeutralTimeline(s.clips,s.name,s.probe?.duration??0);
export const videoTimelineDuration=(s:VideoSession|null)=>s?timelineDuration(s.clips):0;
/** Unsaved edit-list changes: the current clips differ from the last saved/loaded state. Undoing back to that state clears the dirty flag. */
export const videoIsDirty=(s:VideoSession|null)=>!!s&&s.status!=='loading'&&clipsSignature(s.clips,s.audioClips,s.overlayClips)!==s.savedSig;
/** Names of all open video sessions with unsaved timeline changes (workDocs dirty list). */
export const dirtyVideoNames=()=>[...sessions.values()].filter(videoIsDirty).map(s=>s.name);
/** The serialized project for download or tests; null while the session is not ready. */
export function serializeVideoProjectCopy(root:string):{text:string;fileName:string}|null{
 const s=sessions.get(root);if(!s||s.status==='loading')return null;
 return{text:serializeVideoProject(s.clips,s.audioClips,s.format,s.exportOptions,s.overlayClips),fileName:projectFileName(root)};
}
/** Saves the edit list as a .video-project download and marks the session clean. Media bytes are NOT included - clips reference sources by name. */
export function saveVideoProject(root:string):boolean{
 const copy=serializeVideoProjectCopy(root);if(!copy)return false;
 const url=URL.createObjectURL(new Blob([copy.text],{type:'application/x-somnia-video-project'}));
 const a=document.createElement('a');a.href=url;a.download=copy.fileName;a.click();
 setTimeout(()=>URL.revokeObjectURL(url),30_000);
 patch(root,{savedSig:clipsSignature(sessions.get(root)!.clips,sessions.get(root)!.audioClips,sessions.get(root)!.overlayClips)});
 return true;
}

/** Media kinds the video studio answers for in the cross-studio work registry (workDocs). */
const WORK_MEDIA_KINDS:MediaKind[]=['docx','audio','video','video-project'];
/* Self-registers with workDocs: the studio layer registers upward, so root lib modules never import studio code
   (layer rule lib-core-not-up-to-studios; same pattern as the sound studio's arrangeStore). */
registerWorkProvider({studio:'media',dirty:dirtyVideoNames,openCount:()=>getMedia().items.filter(i=>WORK_MEDIA_KINDS.includes(i.kind)).length,
 async save(name){const s=getVideoSession(name);return s&&videoIsDirty(s)?saveVideoProject(name):true;},
 discard:()=>[],closeAll:()=>{for(const i of getMedia().items.filter(i=>WORK_MEDIA_KINDS.includes(i.kind)))closeMediaForced(i.name);}});

/** Playhead beacon: the workspace publishes its playhead so inspector sections can place keys at it without prop drilling through the shell. */
let playheadPos=0;
const playheadSubs=new Set<()=>void>();
export const setVideoPlayhead=(seconds:number)=>{if(seconds===playheadPos)return;playheadPos=seconds;playheadSubs.forEach(f=>f());};
export const getVideoPlayhead=()=>playheadPos;
export const useVideoPlayhead=()=>useSyncExternalStore(cb=>{playheadSubs.add(cb);return()=>{playheadSubs.delete(cb);};},getVideoPlayhead);

/* Lifecycle (docs/studio-lifecycle.md): recipe-only checkpoints. Source bytes, filmstrips and export results are never captured; the timeline recipe is re-applied when the same source re-opens. */
const fingerprints=new Map<string,string>();
const lifecycleStash=new RecipeStash<VideoRecipe>();
export interface VideoRecipe{clips:TimelineClip[];audioClips:AudioClip[];overlayClips:OverlayClip[];selectedClipId:string|null;selectedAudioClipId:string|null;selectedOverlayClipId:string|null;history:{past:VideoSnapshot[];future:VideoSnapshot[]};savedSig:string;format:VideoFormat;exportOptions:VideoExportOptions;exportRange:{start:number;end:number}|null}
const edited=(s:VideoSession)=>s.status!=='loading'&&(videoIsDirty(s)||s.history.past.length>0||s.history.future.length>0||s.exportRange!==null||s.format!==DEFAULT_FORMAT||JSON.stringify(s.exportOptions)!==JSON.stringify(DEFAULT_EXPORT_OPTIONS));
const recipeOf=(s:VideoSession):VideoRecipe=>structuredClone({clips:s.clips,audioClips:s.audioClips,overlayClips:s.overlayClips,selectedClipId:s.selectedClipId,selectedAudioClipId:s.selectedAudioClipId,selectedOverlayClipId:s.selectedOverlayClipId,history:{past:s.history.past,future:s.history.future},savedSig:s.savedSig,format:s.format,exportOptions:s.exportOptions,exportRange:s.exportRange});
const recipePatch=(r:VideoRecipe):Partial<VideoSession>=>{
 const clips=sanitizeClips(r.clips,sourceDurations(r.clips));
 const audioClips=sanitizeAudioClips(r.audioClips,audioDurationsOf(r.audioClips));
 const overlayClips=sanitizeOverlayClips(r.overlayClips);
 return{clips,audioClips,overlayClips,
  selectedClipId:clips.some(c=>c.id===r.selectedClipId)?r.selectedClipId:null,
  selectedAudioClipId:audioClips.some(c=>c.id===r.selectedAudioClipId)?r.selectedAudioClipId:null,
  selectedOverlayClipId:overlayClips.some(c=>c.id===r.selectedOverlayClipId)?r.selectedOverlayClipId:null,
  history:{past:r.history.past,future:r.history.future,gestureKey:null,gestureAt:0},
  savedSig:r.savedSig,format:r.format,exportOptions:r.exportOptions,exportRange:r.exportRange};
};
export function sanitizeVideoRecipe(v:unknown):VideoRecipe|null{
 const r=v as Partial<VideoRecipe>|null;
 if(!r||typeof r!=='object'||!Array.isArray(r.clips)||!Array.isArray(r.audioClips)||!Array.isArray(r.overlayClips)||typeof r.savedSig!=='string'||typeof r.format!=='string')return null;
 const h=r.history;if(!h||!Array.isArray(h.past)||!Array.isArray(h.future))return null;
 const range=r.exportRange&&Number.isFinite(r.exportRange.start)&&Number.isFinite(r.exportRange.end)?{start:r.exportRange.start,end:r.exportRange.end}:null;
 return{clips:r.clips,audioClips:r.audioClips,overlayClips:r.overlayClips,selectedClipId:r.selectedClipId??null,selectedAudioClipId:r.selectedAudioClipId??null,selectedOverlayClipId:r.selectedOverlayClipId??null,history:{past:h.past.slice(-VIDEO_HISTORY_LIMIT),future:h.future.slice(0,VIDEO_HISTORY_LIMIT)},savedSig:r.savedSig,format:r.format as VideoFormat,exportOptions:sanitizeExportOptions(r.exportOptions),exportRange:range};
}
export function createVideoLifecycleAdapter(){
 return createRecipeAdapter<VideoRecipe>({
  studioId:'video',schemaVersion:1,stash:lifecycleStash,
  capture:()=>[...sessions.values()].filter(s=>edited(s)&&fingerprints.has(s.name)).map(s=>({name:s.name,fingerprint:fingerprints.get(s.name)!,recipe:recipeOf(s)})),
  release:()=>{for(const n of [...sessions.keys()])closeVideo(n);engine?.dispose();engine=undefined;capsPromise=undefined;filmstrip?.dispose();filmstrip=undefined;},
  sanitize:sanitizeVideoRecipe,
  pinReasons:()=>{const r=new Set<string>();for(const s of sessions.values()){if(s.status==='exporting')r.add('video-export');if(s.status==='loading')r.add('video-probing');}if(opening.size)r.add('video-probing');return[...r];},
  resourceIds:()=>['studio:video','video.engine','video.export',...[...sessions.keys()].map(n=>`video:session:${n}`)],
  estimateBytes:()=>{let n=0;for(const b of sources.values())n+=b.byteLength;return n;},
  revision:()=>editRevision,
 });
}
/** Test seam: pending recipes of suspended documents. */
export const pendingVideoRecipes=()=>lifecycleStash.size;
registerLifecycleAdapter('video',createVideoLifecycleAdapter);
