import type {MasterReport,MasterTarget} from './mastering';
import type {SoundAnalysis} from './analysis';
import {useSyncExternalStore} from 'react';
import {ArrangementHistory,arrangementEnd,emptyArrangement,findArrangeClip,newClip,newTrack,parseArrangement,serializeArrangement,validateArrangement,ARRANGE_LIMITS,type Arrangement,type AudioSourceRef} from './arrangement';
import {getSoundSession,openSound} from './session';
import {decodeSessionWav,encodeSessionWav,reverseSource} from './sessionWav';
import {trackAnalysisSession} from './analysisSource';
import {registerWorkProvider} from '../workDocs';
import {addMediaFile,getMedia,uniqueMediaName} from '../media';
import {buildZip} from './stemZip';
import {t} from '../i18n';
import {registerCloseGuard} from '../closeGuards';
let history=new ArrangementHistory(emptyArrangement());
let serial=0;const uid=()=>`sound-${Date.now().toString(36)}-${++serial}`;
let worker:Worker|undefined,nextRequest=0,generation=0;
const pending=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
const listeners=new Set<()=>void>();
export interface ArrangeState{trackAnalysis:{trackId:string;analysis:SoundAnalysis;revision:number}|null;trackAnalysisBusy:boolean;rangeSelection:{start:number;end:number}|null;renderedRange:{start:number;end:number}|null;masterPreview:{url:string;report:MasterReport;revision:number}|null;analysis:SoundAnalysis|null;document:Arrangement;revision:number;canUndo:boolean;canRedo:boolean;busy:boolean;error:string;url:string|null;peaks:Float32Array|null;peak:number;clippedSamples:number;renderRevision:number;missing:string[];savedText:string;sourcePeaks:Record<string,Float32Array>}
let state:ArrangeState={trackAnalysis:null,trackAnalysisBusy:false,rangeSelection:null,renderedRange:null,document:history.snapshot,revision:0,canUndo:false,canRedo:false,busy:false,error:'',url:null,peaks:null,analysis:null,masterPreview:null,peak:0,clippedSamples:0,renderRevision:-1,missing:[],sourcePeaks:{},savedText:serializeArrangement(history.snapshot)};
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
function invalidate(){generation++;discardMasterPreview();if(state.url)URL.revokeObjectURL(state.url);blob=null;emit({url:null,peaks:null,analysis:null,masterPreview:null,renderRevision:-1,error:'',busy:false,trackAnalysis:null,trackAnalysisBusy:false,missing:history.snapshot.sources.filter(s=>!available.has(s.id)).map(s=>s.id)});}
/** Output range for render/export: a view choice, not session data. It is not undoable, does not dirty the session, and export requires the rendered range to match it. */
export function setRangeSelection(range:{start:number;end:number}|null){
 if(range){const end=arrangementEnd(history.snapshot);if(!Number.isSafeInteger(range.start)||!Number.isSafeInteger(range.end)||range.start<0||range.end<=range.start||range.end>end)throw Error('Invalid output range');}
 emit({rangeSelection:range?{start:range.start,end:range.end}:null});
}
export function editArrangement(edit:(s:Arrangement)=>void){history.change(edit);invalidate();}
export function undoArrangement(){history.undo();invalidate();}
export function redoArrangement(){history.redo();invalidate();}
export function resetArrangement(){emit({rangeSelection:null,renderedRange:null,trackAnalysis:null,trackAnalysisBusy:false});generation++;discardMasterPreview();disposeWorker(Error('Session replaced'));history=new ArrangementHistory(emptyArrangement());if(state.url)URL.revokeObjectURL(state.url);blob=null;emit({url:null,peaks:null,analysis:null,masterPreview:null,busy:false,error:'',renderRevision:-1,missing:[],sourcePeaks:{},savedText:serializeArrangement(history.snapshot)});}
export function loadArrangement(text:string){const next=parseArrangement(text);emit({rangeSelection:null,renderedRange:null,trackAnalysis:null,trackAnalysisBusy:false});generation++;discardMasterPreview();disposeWorker(Error('Session replaced'));history.replace(next);if(state.url)URL.revokeObjectURL(state.url);blob=null;emit({url:null,peaks:null,analysis:null,masterPreview:null,busy:false,error:'',renderRevision:-1,missing:next.sources.map(s=>s.id),sourcePeaks:{},savedText:serializeArrangement(next)});}
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
/** Reverses a clip's source audio into a new media item ("<name>-reverse.wav", numbered on collision) and repoints the clip. One undoable arrangement edit; the media item stays in the library like any import. */
export async function reverseClipToMedia(clipId:string){
 const token=generation;const doc=history.snapshot;const {clip}=findArrangeClip(doc,clipId);const source=doc.sources.find(src=>src.id===clip.sourceId)!;
 const session=getSoundSession(source.name);if(!session?.original)throw Error('Source audio is not ready');
 const decoded=decodeSessionWav(source.id,await session.original.blob.arrayBuffer());
 const reversed=reverseSource(decoded,source.id);
 const name=uniqueMediaName(getMedia().items.map(m=>m.name),`${source.name.replace(/\.[^.]+$/,'')}-reverse.wav`);
 const added=await addMediaFile(new Blob([encodeSessionWav(reversed.channels,reversed.sampleRate)],{type:'audio/wav'}),name,undefined,{activate:false});if('error' in added)throw Error(added.error);
 const item=getMedia().items.find(m=>m.name===added.name&&m.kind==='audio');if(!item)throw Error('Reversed audio was not registered');
 await openSound(item);const next=getSoundSession(added.name);if(!next?.original)throw Error('Reversed audio is not ready');
 if(token!==generation)throw Error('Session changed while reversing');
 const report=next.original.report.output,id=uid();
 const ref:AudioSourceRef={id,name:added.name,frames:report.frames,sampleRate:report.sample_rate,channels:report.channels as 1|2};
 const wav=await next.original.blob.arrayBuffer();if(token!==generation)throw Error('Session changed while reversing');await request({kind:'source',sourceId:id,wav},[wav]);if(token!==generation)throw Error('Session changed while reversing');available.add(id);emit({sourcePeaks:{...state.sourcePeaks,[id]:next.original.peaks}});
 history.change(s=>{s.sources.push(ref);findArrangeClip(s,clipId).clip.sourceId=id;});invalidate();
}
/** Bounces the current rendered mix into the media library and appends it as a new track, placed at the bounced range's start. What you heard is what you get: the rendered buffer becomes the media item unchanged. One undoable arrangement edit; the media item stays in the library like any import. */
export async function bounceRenderToTrack(){
 if(!blob||state.renderRevision!==history.revision||state.busy)throw Error('Render the current session before bouncing');
 const token=generation,wav=await blob.arrayBuffer();
 const name=uniqueMediaName(getMedia().items.map(m=>m.name),`${history.snapshot.name.replace(/[^a-z0-9 _-]/gi,'_')}-bounce.wav`);
 const added=await addMediaFile(new Blob([wav],{type:'audio/wav'}),name,undefined,{activate:false});if('error' in added)throw Error(added.error);
 const item=getMedia().items.find(m=>m.name===added.name&&m.kind==='audio');if(!item)throw Error('Bounced audio was not registered');
 await openSound(item);const session=getSoundSession(added.name);if(!session?.original)throw Error('Bounced audio is not ready');
 if(token!==generation)throw Error('Session changed while bouncing');
 const report=session.original.report.output,id=uid();
 const ref:AudioSourceRef={id,name:added.name,frames:report.frames,sampleRate:report.sample_rate,channels:report.channels as 1|2};
 const upload=await session.original.blob.arrayBuffer();if(token!==generation)throw Error('Session changed while bouncing');await request({kind:'source',sourceId:id,wav:upload},[upload]);if(token!==generation)throw Error('Session changed while bouncing');available.add(id);emit({sourcePeaks:{...state.sourcePeaks,[id]:session.original.peaks}});
 history.change(s=>{if(s.tracks.length>=ARRANGE_LIMITS.tracks)throw Error('Track limit');s.sources.push(ref);const track=newTrack(uid(),added.name);track.clips.push(newClip(uid(),ref,state.rangeSelection?.start??0));s.tracks.push(track);});invalidate();
}
/** Freezes a track: renders its clips through its own rack (level and pan stay live, so the frozen track sounds identical) into "<track>-freeze.wav" in the media library, replaces the clips with the frozen audio placed at session frame 0 and bypasses the rack. One undoable arrangement edit - undo is the unfreeze. The media item stays in the library like any import. */
export async function freezeTrackToMedia(trackId:string){
 if(state.busy)throw Error('Sound is busy');const token=generation;const doc=history.snapshot;const track=doc.tracks.find(t=>t.id===trackId);if(!track)throw Error('Track no longer exists');if(!track.clips.length)throw Error('Track has no clips to freeze');
 emit({busy:true,error:''});
 try{
  const result=await request({kind:'freeze',session:doc,trackId});if(token!==generation)throw Error('Session changed while freezing');
  const name=uniqueMediaName(getMedia().items.map(m=>m.name),`${track.name.replace(/[^a-z0-9 _-]/gi,'_')}-freeze.wav`);
  const added=await addMediaFile(new Blob([result.wav],{type:'audio/wav'}),name,undefined,{activate:false});if('error' in added)throw Error(added.error);
  const item=getMedia().items.find(m=>m.name===added.name&&m.kind==='audio');if(!item)throw Error('Frozen audio was not registered');
  await openSound(item);const session=getSoundSession(added.name);if(!session?.original)throw Error('Frozen audio is not ready');
  if(token!==generation)throw Error('Session changed while freezing');
  const report=session.original.report.output,id=uid();
  const ref:AudioSourceRef={id,name:added.name,frames:report.frames,sampleRate:report.sample_rate,channels:report.channels as 1|2};
  const upload=await session.original.blob.arrayBuffer();if(token!==generation)throw Error('Session changed while freezing');await request({kind:'source',sourceId:id,wav:upload},[upload]);if(token!==generation)throw Error('Session changed while freezing');available.add(id);emit({sourcePeaks:{...state.sourcePeaks,[id]:session.original.peaks}});
  history.change(s=>{const target=s.tracks.find(t=>t.id===trackId);if(!target)throw Error('Track no longer exists');s.sources.push(ref);target.clips=[newClip(uid(),ref)];target.rack={...target.rack,bypass:true};});invalidate();
 }finally{emit({busy:false});}
}
/** Exports every track as its own WAV (own inserts/level/pan, no master chain - the stems sum back to the mix) in one stored ZIP, honouring the current output range. Browser: one download; desktop: one save dialog. */
export async function exportStems():Promise<'saved'|'cancelled'|'downloaded'>{
 if(state.busy)throw Error('Sound is busy');const doc=history.snapshot;if(!doc.tracks.some(t=>t.clips.length))throw Error('Nothing to export');
 const token=generation,range=state.rangeSelection;emit({busy:true,error:''});
 try{
  const result=await request({kind:'stems',session:doc,...(range?{range}:{})});if(token!==generation)throw Error('Session changed while exporting stems');
  const used=new Set<string>();const entries=(result.stems as {name:string;wav:ArrayBuffer}[]).map(stem=>{const name=uniqueMediaName([...used],`${stem.name.replace(/[^a-z0-9 _-]/gi,'_')||'track'}.wav`);used.add(name);return{name,bytes:new Uint8Array(stem.wav)};});
  const zip=buildZip(entries),fileName=`${doc.name.replace(/[^a-z0-9 _-]/gi,'_')}-stems.zip`;
  const {isTauri,invoke}=await import('@tauri-apps/api/core');
  if(!isTauri()){download(new Blob([zip.buffer as ArrayBuffer],{type:'application/zip'}),fileName);return'downloaded';}
  const grant=await invoke<{token:string}|null>('audio_save_pick',{suggestedName:fileName});if(!grant)return'cancelled';
  if(token!==generation)throw Error('Session changed during stem export review');
  await invoke('audio_save_write',zip,{headers:{'x-somnia-token':grant.token}});return'saved';
 }finally{emit({busy:false});}
}
/** Re-opens a clipboard source from the media library and uploads it under its original id so a cross-session paste renders; verifies the audio still matches the copied reference. */
export async function ensureClipboardSource(ref:AudioSourceRef):Promise<void>{
 if(available.has(ref.id))return;
 const item=getMedia().items.find(m=>m.name===ref.name&&m.kind==='audio');if(!item)throw Error('The copied source is no longer in the media library');
 await openSound(item);const session=getSoundSession(ref.name);if(!session?.original)throw Error('Source audio is not ready');
 const report=session.original.report.output;
 if(report.frames!==ref.frames||report.sample_rate!==ref.sampleRate||report.channels!==ref.channels)throw Error('The copied source changed since the copy');
 const token=generation;const wav=await session.original.blob.arrayBuffer();if(token!==generation)throw Error('Session changed while pasting');
 await request({kind:'source',sourceId:ref.id,wav},[wav]);if(token!==generation)throw Error('Session changed while pasting');
 available.add(ref.id);emit({sourcePeaks:{...state.sourcePeaks,[ref.id]:session.original.peaks}});
}
/** Glues selected clips on one track: renders them with their clip-level settings (gain, fades, curves; no rack - that stays live) into "<track>-glue.wav" in the media library and replaces the selection with one clip at the earliest start. One undoable arrangement edit; the media item stays in the library like any import. */
export async function glueClipsToMedia(trackId:string,ids:string[]){
 if(state.busy)throw Error('Sound is busy');const token=generation;const doc=history.snapshot;
 const track=doc.tracks.find(t=>t.id===trackId);if(!track)throw Error('Track no longer exists');
 const clips=track.clips.filter(c=>ids.includes(c.id));if(clips.length<2||clips.length!==ids.length)throw Error('Select at least two clips on one track');
 const sorted=[...clips].sort((a,b)=>a.start-b.start),start=sorted[0].start;
 emit({busy:true,error:''});
 try{
  const result=await request({kind:'glue',session:doc,trackId,ids});if(token!==generation)throw Error('Session changed while gluing');
  const name=uniqueMediaName(getMedia().items.map(m=>m.name),`${track.name.replace(/[^a-z0-9 _-]/gi,'_')}-glue.wav`);
  const added=await addMediaFile(new Blob([result.wav],{type:'audio/wav'}),name,undefined,{activate:false});if('error' in added)throw Error(added.error);
  const item=getMedia().items.find(m=>m.name===added.name&&m.kind==='audio');if(!item)throw Error('Glued audio was not registered');
  await openSound(item);const session=getSoundSession(added.name);if(!session?.original)throw Error('Glued audio is not ready');
  if(token!==generation)throw Error('Session changed while gluing');
  const report=session.original.report.output,id=uid();
  const ref:AudioSourceRef={id,name:added.name,frames:report.frames,sampleRate:report.sample_rate,channels:report.channels as 1|2};
  const upload=await session.original.blob.arrayBuffer();if(token!==generation)throw Error('Session changed while gluing');await request({kind:'source',sourceId:id,wav:upload},[upload]);if(token!==generation)throw Error('Session changed while gluing');available.add(id);emit({sourcePeaks:{...state.sourcePeaks,[id]:session.original.peaks}});
  history.change(s=>{const target=s.tracks.find(t=>t.id===trackId);if(!target)throw Error('Track no longer exists');s.sources.push(ref);target.clips=target.clips.filter(c=>!ids.includes(c.id));target.clips.push({...newClip(uid(),ref,start),name:sorted[0].name});});invalidate();
 }finally{emit({busy:false});}
}
/** Analyses one rendered track (own inserts/level/pan, no master chain) in the mix worker. Bound to the session revision and the current output range, invalidated by edits like the full-mix report. */
export async function analyzeTrack(trackId:string){const snapshot=history.snapshot;trackAnalysisSession(snapshot,trackId);const rev=history.revision,token=generation;emit({trackAnalysisBusy:true});try{const result=await request({kind:'analyze',session:snapshot,trackId,...(state.rangeSelection?{range:state.rangeSelection}:{})});if(token!==generation||rev!==history.revision)return;emit({trackAnalysis:{trackId,analysis:result.analysis,revision:rev}});}catch(e){if(token===generation)emit({error:e instanceof Error?e.message:String(e)});}finally{if(token===generation)emit({trackAnalysisBusy:false});}}
export async function renderSession(){const rev=history.revision,token=generation,range=state.rangeSelection;discardMasterPreview();emit({busy:true,error:'',masterPreview:null});try{const result=await request({kind:'render',session:history.snapshot,...(range?{range}:{})});if(token!==generation||rev!==history.revision)return;if(state.url)URL.revokeObjectURL(state.url);blob=new Blob([result.wav],{type:'audio/wav'});emit({url:URL.createObjectURL(blob),peaks:new Float32Array(result.peaks),peak:result.peak,clippedSamples:result.clippedSamples,analysis:result.analysis,renderRevision:rev,renderedRange:range});}catch(e){if(token===generation)emit({error:e instanceof Error?e.message:String(e)});}finally{if(token===generation)emit({busy:false});}}
function download(file:Blob,name:string){const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
export function downloadArrangement(){const text=serializeArrangement(history.snapshot);download(new Blob([text],{type:'application/json'}),`${history.snapshot.name.replace(/[^a-z0-9 _-]/gi,'_')}.somnia-sound.json`);emit({savedText:text});}
export async function exportArrangement():Promise<'saved'|'cancelled'|'downloaded'>{if(!blob||state.renderRevision!==history.revision||state.busy)throw Error('Render the current session before export');if(JSON.stringify(state.renderedRange)!==JSON.stringify(state.rangeSelection))throw Error('Render the selected output range before export');const current=blob;const name=`${history.snapshot.name.replace(/[^a-z0-9 _-]/gi,'_')}-mix.wav`;const {isTauri,invoke}=await import('@tauri-apps/api/core');if(!isTauri()){download(current,name);return'downloaded';}const grant=await invoke<{token:string}|null>('audio_save_pick',{suggestedName:name});if(!grant)return'cancelled';if(current!==blob||state.renderRevision!==history.revision)throw Error('Session changed during export review');await invoke('audio_save_write',new Uint8Array(await current.arrayBuffer()),{headers:{'x-somnia-token':grant.token}});return'saved';}

/** Keep the dirty-session browser guard alive when switching back to Clip editor. */
export const arrangementIsDirty=()=>serializeArrangement(history.snapshot)!==state.savedText;
registerCloseGuard(()=>arrangementIsDirty()&&!window.confirm(t('sound.arrange.closeConfirm')));
if(typeof window!=='undefined')window.addEventListener('beforeunload',event=>{if(arrangementIsDirty()){event.preventDefault();event.returnValue='';}});

export async function saveArrangementNative():Promise<boolean>{
 const {isTauri,invoke}=await import('@tauri-apps/api/core');if(!isTauri())throw Error('Native session save requires the desktop app; download JSON in the browser');
 const text=serializeArrangement(history.snapshot),fileName=`${history.snapshot.name.replace(/[^a-z0-9 _-]/gi,'_')}.somnia-sound.json`;
 const {saveSessionToFolder}=await import('./sessionSave');const outcome=await saveSessionToFolder({invoke},text,fileName);if(outcome==='saved')emit({savedText:text});return outcome==='saved'&&!arrangementIsDirty();
}
registerWorkProvider({studio:'sound-session',dirty:()=>arrangementIsDirty()?[history.snapshot.name]:[],save:()=>saveArrangementNative(),discard:()=>{resetArrangement();return[];},closeAll:resetArrangement,openCount:()=>history.snapshot.tracks.length||history.snapshot.sources.length?1:0});

export async function previewMaster(target:MasterTarget){if(state.rangeSelection)throw Error('Mastering renders the full session; clear the output range first');if(state.renderRevision!==history.revision||!blob)throw Error('Render the current mix first');const token=generation,revision=history.revision;discardMasterPreview();emit({busy:true,error:'',masterPreview:null});try{const result=await request({kind:'master',session:history.snapshot,target});if(token!==generation||revision!==history.revision)return;masterBlob=new Blob([result.wav],{type:'audio/wav'});emit({masterPreview:{url:URL.createObjectURL(masterBlob),report:result.masterReport,revision}});}catch(e){if(token===generation)emit({error:e instanceof Error?e.message:String(e)});}finally{if(token===generation)emit({busy:false});}}
export function acceptMasterPreview(){const preview=state.masterPreview;if(!preview||!masterBlob||preview.revision!==history.revision||!preview.report.meetsTarget||state.busy)throw Error('No current mastered output meets the reviewed target');if(state.url)URL.revokeObjectURL(state.url);blob=masterBlob;masterBlob=null;emit({url:preview.url,analysis:preview.report.after,peak:preview.report.after.samplePeakDb===null?0:10**(preview.report.after.samplePeakDb/20),clippedSamples:0,masterPreview:null,renderRevision:history.revision});}
export function cancelMasterPreview(){discardMasterPreview();emit({masterPreview:null});}
