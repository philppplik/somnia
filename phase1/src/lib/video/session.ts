import {useSyncExternalStore} from 'react';
import {VideoEngine,type VideoEngineLike} from './engine';
import {DEFAULT_RECIPE,exportName,isNeutral,sanitizeRecipe,type VideoRecipe} from './recipe';
import {fileExtension,sniffVideo} from './format';
import {getMedia,subscribeMedia} from '../media';
import type {VideoCapabilities,VideoProbe,VideoProgress,VideoReport} from './protocol';
export type VideoStatus='loading'|'ready'|'error'|'exporting';
export interface VideoResult{blob:Blob;url:string;report:VideoReport}
export interface VideoSession{name:string;status:VideoStatus;error:string;probe:VideoProbe|null;capabilities:VideoCapabilities|null;recipe:VideoRecipe;progress:VideoProgress|null;result:VideoResult|null;ext:string}
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
/** Probes a media item (idempotent). The original bytes stay untouched; export renders a copy. */
export async function openVideo(item:{name:string;url:string}):Promise<void>{
 if(sessions.has(item.name))return;
 stopMediaSync??=subscribeMedia(()=>{const live=new Set(getMedia().items.map(i=>i.name));for(const n of [...sessions.keys()])if(!live.has(n))closeVideo(n);});
 put({name:item.name,status:'loading',error:'',probe:null,capabilities:null,recipe:DEFAULT_RECIPE,progress:null,result:null,ext:fileExtension(item.name)});
 try{
  const bytes=await fetch(item.url).then(r=>r.arrayBuffer());
  const sniffed=sniffVideo(new Uint8Array(bytes,0,Math.min(bytes.byteLength,512)));
  if(!sniffed)throw new Error('not a supported video file');
  sources.set(item.name,bytes);
  const {engine:e,caps}=getEngine();
  const probe=await e.probe(bytes.slice(0));
  if(!sessions.has(item.name))return;
  if(!probe.video)throw new Error('no video track');
  patch(item.name,{status:'ready',error:'',probe,ext:sniffed.ext,capabilities:await caps.catch(()=>null)});
 }catch(e){resetEngine(e);if(sessions.has(item.name))patch(item.name,{status:'error',error:message(e)});}
}
export function updateVideoRecipe(name:string,change:(r:VideoRecipe)=>VideoRecipe){
 const s=sessions.get(name);if(!s)return;
 const duration=s.probe?.duration??0;
 put({...s,recipe:sanitizeRecipe(change(s.recipe),duration)});
}
export const resetVideoRecipe=(name:string)=>updateVideoRecipe(name,()=>({...DEFAULT_RECIPE}));
/** Sets or moves the trim so it contains `at` as start or end. */
export function setVideoTrim(name:string,edge:'start'|'end',at:number){
 updateVideoRecipe(name,r=>{
  const d=sessions.get(name)?.probe?.duration??0;
  const trim=r.trim??{start_s:0,end_s:d};
  return{...r,trim:edge==='start'?{start_s:at,end_s:Math.max(trim.end_s,at)}:{start_s:Math.min(trim.start_s,at),end_s:at}};
 });
}
export const clearVideoTrim=(name:string)=>updateVideoRecipe(name,r=>({...r,trim:null}));
/** Runs the export in the worker and keeps the result on the session. Cancel rejects quietly. */
export async function runVideoExport(name:string):Promise<'exported'|'cancelled'|'unavailable'>{
 const s=sessions.get(name),bytes=sources.get(name);
 if(!s||!bytes||!s.probe)return'unavailable';
 revoke(s.result);put({...s,status:'exporting',error:'',progress:null,result:null});
 try{
  const{engine:e}=getEngine();
  const r=await e.export(bytes.slice(0),s.recipe,p=>{if(sessions.get(name)?.status==='exporting')patch(name,{progress:p});});
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
 return{blob:s.result.blob,fileName:exportName(name,s.recipe)};
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
export const videoIsEdited=(s:VideoSession|null)=>!!s&&!isNeutral(s.recipe);
