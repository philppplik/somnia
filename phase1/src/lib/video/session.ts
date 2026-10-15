import {reportError} from '../log';
import {useSyncExternalStore} from 'react';
import {VideoEngine,type VideoEngineLike} from './engine';
import {DEFAULT_EXPORT_OPTIONS,DEFAULT_FORMAT,exportName,sanitizeExportOptions,type VideoExportOptions,type VideoFormat} from './recipe';
import {fullClip,IMAGE_DEFAULT_SECONDS,newClipId,MIN_CLIP_SECONDS as MIN_EXPORT_RANGE,sliceTimeline,isNeutralTimeline,moveClip,rippleDelete,sanitizeClips,setClipEdge,setClipSpeed,setCrossfade,splitAt,timelineDuration,type TimelineClip} from './timeline';
import {emptyVideoHistory,pushHistory,redoHistory,undoHistory,type VideoHistory,type VideoSnapshot} from './history';
import {audioTrackEnd,duplicateAudioClip,fullAudioClip,moveAudioClip,removeAudioClip,resizeAudioClip,sanitizeAudioClips,setAudioClipDuck,setAudioClipEdge,setAudioClipFades,setAudioClipGain,setAudioClipMuted,type AudioClip,sliceAudioClips} from './audioTrack';
import {clipsSignature,parseVideoProject,projectFileName,serializeVideoProject} from './projectFile';
import {clampTitleSeconds,insertClip,insertIndexAfter,needsSourceFile} from './titles';
import {FilmstripController} from './filmstrip-controller';
import {FilmstripEngine} from './filmstrip-engine';
import {fileExtension,sniffVideo} from './format';
import {openVideoDialog} from './open';
import {getMedia,setActiveMedia,subscribeMedia} from '../media';
import type {VideoCapabilities,VideoProbe,VideoProgress,VideoReport} from './protocol';
export type VideoStatus='loading'|'ready'|'error'|'exporting';
export interface VideoResult{blob:Blob;url:string;report:VideoReport}
export type VideoExportOutcome='downloaded'|'cancelled'|'unavailable';
export interface VideoSession{exportOutcome?:VideoExportOutcome;name:string;status:VideoStatus;error:string;probe:VideoProbe|null;capabilities:VideoCapabilities|null;clips:TimelineClip[];/** The free-placed audio track (music/voiceover), mixed over the edit list. */
audioClips:AudioClip[];selectedClipId:string|null;/** Selection on the audio track; selecting one track clears the other. */
selectedAudioClipId:string|null;history:VideoHistory;/** Signature of the clip list at the last save/load; the session is dirty when the current list differs. */
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
const put=(s:VideoSession)=>{sessions.set(s.name,s);emit();};
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
 put({name:item.name,status:'loading',error:'',probe:null,capabilities:null,clips:[],audioClips:[],selectedClipId:null,selectedAudioClipId:null,history:emptyVideoHistory(),savedSig:clipsSignature([],[]),format:DEFAULT_FORMAT,exportOptions:DEFAULT_EXPORT_OPTIONS,exportRange:null,progress:null,result:null,ext:fileExtension(item.name)});
 if(getMedia().items.find(i=>i.name===item.name)?.kind==='video-project'){
  try{
   const text=await fetch(item.url).then(r=>r.text());
   if(!text.trim()){patch(item.name,{status:'ready',ext:''});return;}
   const parsed=parseVideoProject(text);
   const clips=sanitizeClips(parsed.clips,sourceDurations(parsed.clips));
   const audioClips=sanitizeAudioClips(parsed.audioClips,{});
   patch(item.name,{status:'ready',ext:'',clips,audioClips,format:parsed.format,exportOptions:parsed.exportOptions,savedSig:clipsSignature(clips,audioClips)});
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
 }catch(e){resetEngine(e);if(sessions.has(item.name))patch(item.name,{status:'error',error:message(e)},e);}
}
/** Field-level clip equality: a clamped no-op edit must not flood the undo stack. */
const sameClips=(a:TimelineClip[],b:TimelineClip[])=>a.length===b.length&&a.every((c,i)=>{
 const d=b[i];return c.id===d.id&&c.source===d.source&&c.in_s===d.in_s&&c.out_s===d.out_s&&c.gain===d.gain&&c.muted===d.muted&&c.kind===d.kind&&c.crossfade_s===d.crossfade_s&&c.title===d.title;
});
/** Applies a timeline edit, keeps every clip inside its source bounds and records the previous state as one undo step. `historyKey` coalesces a continuous gesture (trim drag, gain slider, title typing) into a single step. */
export function editTimeline(root:string,edit:(clips:TimelineClip[])=>TimelineClip[]|null,opts?:{historyKey?:string}){
 const s=sessions.get(root);if(!s)return;
 const next=edit(s.clips);
 if(!next)return;
 const clean=sanitizeClips(next,sourceDurations(next));
 if(sameClips(clean,s.clips))return;
 put({...s,clips:clean,selectedClipId:clean.some(c=>c.id===s.selectedClipId)?s.selectedClipId:null,history:pushHistory(s.history,{clips:s.clips,audioClips:s.audioClips},opts?.historyKey??null,Date.now())});
}
/** Restores a snapshot: clamps both tracks against the sources that are still open and keeps the selection only when it survives. */
const restoreTimeline=(root:string,step:{history:VideoHistory;snapshot:VideoSnapshot}|null)=>{
 const s=sessions.get(root);if(!s||!step)return;
 const clean=sanitizeClips(step.snapshot.clips,sourceDurations(step.snapshot.clips));
 const cleanAudio=sanitizeAudioClips(step.snapshot.audioClips,audioDurationsOf(step.snapshot.audioClips));
 put({...s,clips:clean,audioClips:cleanAudio,selectedClipId:clean.some(c=>c.id===s.selectedClipId)?s.selectedClipId:null,selectedAudioClipId:cleanAudio.some(c=>c.id===s.selectedAudioClipId)?s.selectedAudioClipId:null,history:step.history});
};
const snapshotOf=(s:VideoSession):VideoSnapshot=>({clips:s.clips,audioClips:s.audioClips});
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
 put({...s,audioClips:clean,selectedAudioClipId:clean.some(c=>c.id===s.selectedAudioClipId)?s.selectedAudioClipId:null,history:pushHistory(s.history,{clips:s.clips,audioClips:s.audioClips},opts?.historyKey??null,Date.now())});
}
/** Adds an audio file's full range to the track at `at` (default: end of the current content). Probes the source on demand. */
export async function addAudioTrackClip(root:string,item:{name:string;url:string},at?:number):Promise<string|null>{
 const s=sessions.get(root);if(!s)return null;
 let duration=audioDurations.get(item.name);
 if(duration===undefined){
  let bytes=sources.get(item.name);
  if(!bytes){bytes=await fetch(item.url).then(r=>r.arrayBuffer());sources.set(item.name,bytes);}
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
 put({...s,clips:next,audioClips:[],selectedClipId:null,selectedAudioClipId:null,result:null,history:changed?pushHistory(s.history,{clips:s.clips,audioClips:s.audioClips},null,Date.now()):s.history});
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
 const r=await e.export(clipSources,clips,s.format,p=>{if(sessions.get(name)?.status==='exporting')patch(name,{progress:p});},audioClips,s.exportOptions);
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
 sources.delete(name);
 getFilmstrip()?.unregister(name);
 const s=sessions.get(name);if(!s)return;revoke(s.result);sessions.delete(name);emit();
}
export const videoIsEdited=(s:VideoSession|null)=>!!s&&!isNeutralTimeline(s.clips,s.name,s.probe?.duration??0);
export const videoTimelineDuration=(s:VideoSession|null)=>s?timelineDuration(s.clips):0;
/** Unsaved edit-list changes: the current clips differ from the last saved/loaded state. Undoing back to that state clears the dirty flag. */
export const videoIsDirty=(s:VideoSession|null)=>!!s&&s.status!=='loading'&&clipsSignature(s.clips,s.audioClips)!==s.savedSig;
/** Names of all open video sessions with unsaved timeline changes (workDocs dirty list). */
export const dirtyVideoNames=()=>[...sessions.values()].filter(videoIsDirty).map(s=>s.name);
/** The serialized project for download or tests; null while the session is not ready. */
export function serializeVideoProjectCopy(root:string):{text:string;fileName:string}|null{
 const s=sessions.get(root);if(!s||s.status==='loading')return null;
 return{text:serializeVideoProject(s.clips,s.audioClips,s.format,s.exportOptions),fileName:projectFileName(root)};
}
/** Saves the edit list as a .video-project download and marks the session clean. Media bytes are NOT included - clips reference sources by name. */
export function saveVideoProject(root:string):boolean{
 const copy=serializeVideoProjectCopy(root);if(!copy)return false;
 const url=URL.createObjectURL(new Blob([copy.text],{type:'application/x-somnia-video-project'}));
 const a=document.createElement('a');a.href=url;a.download=copy.fileName;a.click();
 setTimeout(()=>URL.revokeObjectURL(url),30_000);
 patch(root,{savedSig:clipsSignature(sessions.get(root)!.clips,sessions.get(root)!.audioClips)});
 return true;
}
