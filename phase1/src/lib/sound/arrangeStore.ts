import type {MasterReport,MasterTarget} from './mastering';
import type {SoundAnalysis} from './analysis';
import {useSyncExternalStore} from 'react';
import {ArrangementHistory,emptyArrangement,newClip,newTrack,parseArrangement,serializeArrangement,validateArrangement,ARRANGE_LIMITS,type Arrangement,type AudioSourceRef} from './arrangement';
import {getSoundSession,openSound} from './session';
import {registerWorkProvider} from '../workDocs';
import {getMedia} from '../media';
let history=new ArrangementHistory(emptyArrangement());
let serial=0;const uid=()=>`sound-${Date.now().toString(36)}-${++serial}`;
let worker:Worker|undefined,nextRequest=0,generation=0;
const pending=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
const listeners=new Set<()=>void>();
export interface ArrangeState{masterPreview:{url:string;report:MasterReport;revision:number}|null;analysis:SoundAnalysis|null;document:Arrangement;revision:number;canUndo:boolean;canRedo:boolean;busy:boolean;error:string;url:string|null;peaks:Float32Array|null;peak:number;clippedSamples:number;renderRevision:number;missing:string[];savedText:string;sourcePeaks:Record<string,Float32Array>}
let state:ArrangeState={document:history.snapshot,revision:0,canUndo:false,canRedo:false,busy:false,error:'',url:null,peaks:null,analysis:null,masterPreview:null,peak:0,clippedSamples:0,renderRevision:-1,missing:[],sourcePeaks:{},savedText:serializeArrangement(history.snapshot)};
let masterBlob:Blob|null=null;let blob:Blob|null=null;const available=new Set<string>();
const emit=(patch:Partial<ArrangeState>={})=>{state={...state,...patch,document:history.snapshot,revision:history.revision,canUndo:history.canUndo,canRedo:history.canRedo};listeners.forEach(fn=>fn());};
export const getArrangementState=()=>state;
export const useArrangement=()=>useSyncExternalStore(fn=>{listeners.add(fn);return()=>listeners.delete(fn);},getArrangementState,getArrangementState);
function disposeWorker(error:Error){worker?.terminate();worker=undefined;for(const p of pending.values()){clearTimeout(p.timer);p.reject(error);}pending.clear();available.clear();}
function request(data:Record<string,unknown>,transfer:Transferable[]=[]):Promise<any>{
 worker??=new Worker(new URL('./mixWorker.ts',import.meta.url),{type:'module'});
 worker.onmessage=({data})=>{const p=pending.get(data.id);if(!p)return;clearTimeout(p.timer);pending.delete(data.id);if(data.ok)p.resolve(data);else p.reject(Error(data.error));};
 worker.onerror=()=>{disposeWorker(Error('Sound mix worker failed'));emit({busy:false,error:'Sound mix worker failed',missing:history.snapshot.sources.map(s=>s.id)});};
 const id=++nextRequest;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{disposeWorker(Error('Sound mix timed out'));emit({busy:false,error:'Sound mix timed out',missing:history.snapshot.sources.map(s=>s.id)});},60000);pending.set(id,{resolve,reject,timer});worker!.postMessage({...data,id},transfer);});
}
function discardMasterPreview(){if(state.masterPreview)URL.revokeObjectURL(state.masterPreview.url);masterBlob=null;}
function invalidate(){generation++;discardMasterPreview();if(state.url)URL.revokeObjectURL(state.url);blob=null;emit({url:null,peaks:null,analysis:null,masterPreview:null,renderRevision:-1,error:'',busy:false,missing:history.snapshot.sources.filter(s=>!available.has(s.id)).map(s=>s.id)});}
export function editArrangement(edit:(s:Arrangement)=>void){history.change(edit);invalidate();}
export function undoArrangement(){history.undo();invalidate();}
export function redoArrangement(){history.redo();invalidate();}
export function resetArrangement(){generation++;discardMasterPreview();disposeWorker(Error('Session replaced'));history=new ArrangementHistory(emptyArrangement());if(state.url)URL.revokeObjectURL(state.url);blob=null;emit({url:null,peaks:null,analysis:null,masterPreview:null,busy:false,error:'',renderRevision:-1,missing:[],sourcePeaks:{},savedText:serializeArrangement(history.snapshot)});}
export function loadArrangement(text:string){const next=parseArrangement(text);generation++;discardMasterPreview();disposeWorker(Error('Session replaced'));history.replace(next);if(state.url)URL.revokeObjectURL(state.url);blob=null;emit({url:null,peaks:null,analysis:null,masterPreview:null,busy:false,error:'',renderRevision:-1,missing:next.sources.map(s=>s.id),sourcePeaks:{},savedText:serializeArrangement(next)});}
/** Existing clip engine decodes the original to WAV in its worker; mix worker owns decoded PCM. */
export async function addArrangementMedia(name:string,relinkId?:string){
 const token=generation;const item=getMedia().items.find(m=>m.name===name&&m.kind==='audio');if(!item)throw Error('Open an audio source first');await openSound(item);const session=getSoundSession(name);if(!session?.original)throw Error('Source audio is not ready');const report=session.original.report.output;
 const doc=history.snapshot;const expected=relinkId?doc.sources.find(s=>s.id===relinkId):null;
 if(relinkId&&!expected)throw Error('Source reference no longer exists');
 const id=relinkId??uid();const source:AudioSourceRef={id,name:item.name,frames:report.frames,sampleRate:report.sample_rate,channels:report.channels as 1|2};
 if(expected&&(expected.frames!==source.frames||expected.sampleRate!==source.sampleRate||expected.channels!==source.channels))throw Error('Replacement audio duration, rate or channels do not match');
 if(!expected){doc.sources.push(source);let track=doc.tracks[0];if(doc.tracks.length<ARRANGE_LIMITS.tracks){track=newTrack(uid(),item.name);doc.tracks.push(track);}if(!track)throw Error('Track limit');track.clips.push(newClip(uid(),source));validateArrangement(doc);}
 const wav=await session.original.blob.arrayBuffer();if(token!==generation)throw Error('Session changed while importing');await request({kind:'source',sourceId:id,wav},[wav]);if(token!==generation)throw Error('Session changed while importing');available.add(id);emit({sourcePeaks:{...state.sourcePeaks,[id]:session.original.peaks}});
 if(!expected)history.change(s=>{s.sources=doc.sources;s.tracks=doc.tracks;});invalidate();
}
export async function renderSession(){const rev=history.revision,token=generation;discardMasterPreview();emit({busy:true,error:'',masterPreview:null});try{const result=await request({kind:'render',session:history.snapshot});if(token!==generation||rev!==history.revision)return;if(state.url)URL.revokeObjectURL(state.url);blob=new Blob([result.wav],{type:'audio/wav'});emit({url:URL.createObjectURL(blob),peaks:new Float32Array(result.peaks),peak:result.peak,clippedSamples:result.clippedSamples,analysis:result.analysis,renderRevision:rev});}catch(e){if(token===generation)emit({error:e instanceof Error?e.message:String(e)});}finally{if(token===generation)emit({busy:false});}}
function download(file:Blob,name:string){const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
export function downloadArrangement(){const text=serializeArrangement(history.snapshot);download(new Blob([text],{type:'application/json'}),`${history.snapshot.name.replace(/[^a-z0-9 _-]/gi,'_')}.somnia-sound.json`);emit({savedText:text});}
export async function exportArrangement():Promise<'saved'|'cancelled'|'downloaded'>{if(!blob||state.renderRevision!==history.revision||state.busy)throw Error('Render the current session before export');const current=blob;const name=`${history.snapshot.name.replace(/[^a-z0-9 _-]/gi,'_')}-mix.wav`;const {isTauri,invoke}=await import('@tauri-apps/api/core');if(!isTauri()){download(current,name);return'downloaded';}const grant=await invoke<{token:string}|null>('audio_save_pick',{suggestedName:name});if(!grant)return'cancelled';if(current!==blob||state.renderRevision!==history.revision)throw Error('Session changed during export review');await invoke('audio_save_write',new Uint8Array(await current.arrayBuffer()),{headers:{'x-somnia-token':grant.token}});return'saved';}

/** Keep the dirty-session browser guard alive when switching back to Clip editor. */
export const arrangementIsDirty=()=>serializeArrangement(history.snapshot)!==state.savedText;
if(typeof window!=='undefined')window.addEventListener('beforeunload',event=>{if(arrangementIsDirty()){event.preventDefault();event.returnValue='';}});

export async function saveArrangementNative():Promise<boolean>{
 const {isTauri,invoke}=await import('@tauri-apps/api/core');if(!isTauri())throw Error('Native session save requires the desktop app; download JSON in the browser');
 const text=serializeArrangement(history.snapshot),fileName=`${history.snapshot.name.replace(/[^a-z0-9 _-]/gi,'_')}.somnia-sound.json`;
 const {saveSessionToFolder}=await import('./sessionSave');const outcome=await saveSessionToFolder({invoke},text,fileName);if(outcome==='saved')emit({savedText:text});return outcome==='saved'&&!arrangementIsDirty();
}
registerWorkProvider({studio:'sound-session',dirty:()=>arrangementIsDirty()?[history.snapshot.name]:[],save:()=>saveArrangementNative(),discard:()=>{resetArrangement();return[];},closeAll:resetArrangement,openCount:()=>history.snapshot.tracks.length||history.snapshot.sources.length?1:0});

export async function previewMaster(target:MasterTarget){if(state.renderRevision!==history.revision||!blob)throw Error('Render the current mix first');const token=generation,revision=history.revision;discardMasterPreview();emit({busy:true,error:'',masterPreview:null});try{const result=await request({kind:'master',session:history.snapshot,target});if(token!==generation||revision!==history.revision)return;masterBlob=new Blob([result.wav],{type:'audio/wav'});emit({masterPreview:{url:URL.createObjectURL(masterBlob),report:result.masterReport,revision}});}catch(e){if(token===generation)emit({error:e instanceof Error?e.message:String(e)});}finally{if(token===generation)emit({busy:false});}}
export function acceptMasterPreview(){const preview=state.masterPreview;if(!preview||!masterBlob||preview.revision!==history.revision||!preview.report.meetsTarget||state.busy)throw Error('No current mastered output meets the reviewed target');if(state.url)URL.revokeObjectURL(state.url);blob=masterBlob;masterBlob=null;emit({url:preview.url,analysis:preview.report.after,peak:preview.report.after.samplePeakDb===null?0:10**(preview.report.after.samplePeakDb/20),clippedSamples:0,masterPreview:null,renderRevision:history.revision});}
export function cancelMasterPreview(){discardMasterPreview();emit({masterPreview:null});}
