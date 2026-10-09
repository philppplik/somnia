import {useSyncExternalStore} from 'react';
import {VideoEngine,type VideoEngineLike} from './engine';
import {DEFAULT_FORMAT,exportName,type VideoFormat} from './recipe';
import {fullClip,isNeutralTimeline,moveClip,rippleDelete,sanitizeClips,setClipEdge,setCrossfade,splitAt,timelineDuration,type TimelineClip} from './timeline';
import {fileExtension,sniffVideo} from './format';
import {openVideoDialog} from './open';
import {getMedia,setActiveMedia,subscribeMedia} from '../media';
import type {VideoCapabilities,VideoProbe,VideoProgress,VideoReport} from './protocol';
export type VideoStatus='loading'|'ready'|'error'|'exporting';
export interface VideoResult{blob:Blob;url:string;report:VideoReport}
export interface VideoSession{name:string;status:VideoStatus;error:string;probe:VideoProbe|null;capabilities:VideoCapabilities|null;clips:TimelineClip[];selectedClipId:string|null;format:VideoFormat;progress:VideoProgress|null;result:VideoResult|null;ext:string}
const sessions=new Map<string,VideoSession>();
const sources=new Map<string,ArrayBuffer>();
const listeners=new Set<()=>void>();
let stopMediaSync:(()=>void)|undefined;
let factory:()=>VideoEngineLike=()=>new VideoEngine();
let engine:VideoEngineLike|undefined,capsPromise:Promise<VideoCapabilities>|undefined;
const emit=()=>listeners.forEach(l=>l());
const put=(s:VideoSession)=>{sessions.set(s.name,s);emit();};
const patch=(name:string,p:Partial<VideoSession>)=>{const s=sessions.get(name);if(s)put({...s,...p});};
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
 put({name:item.name,status:'loading',error:'',probe:null,capabilities:null,clips:[],selectedClipId:null,format:DEFAULT_FORMAT,progress:null,result:null,ext:fileExtension(item.name)});
 if(getMedia().items.find(i=>i.name===item.name)?.kind==='video-project'){patch(item.name,{status:'ready',ext:''});return;}
 try{
  const bytes=await fetch(item.url).then(r=>r.arrayBuffer());
  const sniffed=sniffVideo(new Uint8Array(bytes,0,Math.min(bytes.byteLength,512)));
  if(!sniffed)throw new Error('not a supported video file');
  sources.set(item.name,bytes);
  const {engine:e,caps}=getEngine();
  const probe=await e.probe(bytes.slice(0));
  if(!sessions.has(item.name))return;
  if(!probe.video)throw new Error('no video track');
  patch(item.name,{status:'ready',error:'',probe,ext:sniffed.ext,capabilities:await caps.catch(()=>null),clips:[fullClip(item.name,probe.duration)]});
 }catch(e){resetEngine(e);if(sessions.has(item.name))patch(item.name,{status:'error',error:message(e)});}
}
/** Applies a timeline edit and keeps every clip inside its source bounds. */
function editTimeline(root:string,edit:(clips:TimelineClip[])=>TimelineClip[]|null){
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
 if(!s||!s.clips.length)return'unavailable';
 const clipSources:Record<string,ArrayBuffer>={};
 for(const n of new Set(s.clips.map(c=>c.source))){
  const bytes=sources.get(n);
  if(!bytes){patch(name,{status:'error',error:`Clip source "${n}" is no longer open. Re-open the file to export this timeline.`});return'unavailable';}
  clipSources[n]=bytes.slice(0);
 }
 revoke(s.result);put({...s,status:'exporting',error:'',progress:null,result:null});
 try{
  const{engine:e}=getEngine();
  const r=await e.export(clipSources,s.clips,s.format,p=>{if(sessions.get(name)?.status==='exporting')patch(name,{progress:p});});
  const cur=sessions.get(name);if(!cur)return'unavailable';
  const blob=new Blob([r.bytes],{type:r.mime});
  put({...cur,status:'ready',progress:null,result:{blob,url:URL.createObjectURL(blob),report:r.report}});
  return'exported';
 }catch(e){
  if(e instanceof Error&&e.name==='ExportCancelled'){patch(name,{status:'ready',progress:null});return'cancelled';}
  resetEngine(e);if(sessions.has(name))patch(name,{status:'error',error:message(e),progress:null});
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
 const r=await runVideoExport(name);
 if(r!=='exported')return r;
 return downloadVideo(name)?'downloaded':'unavailable';
}
export function cancelVideoExport(name:string){if(sessions.get(name)?.status==='exporting')engine?.cancelExport();}
export function closeVideo(name:string){
 sources.delete(name);
 const s=sessions.get(name);if(!s)return;revoke(s.result);sessions.delete(name);emit();
}
export const videoIsEdited=(s:VideoSession|null)=>!!s&&!isNeutralTimeline(s.clips,s.name,s.probe?.duration??0);
export const videoTimelineDuration=(s:VideoSession|null)=>s?timelineDuration(s.clips):0;
