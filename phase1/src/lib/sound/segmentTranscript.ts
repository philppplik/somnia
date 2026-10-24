/** Sound Studio C3: transcript-guided segment review. Segments come from the pinned local whisper
 * helper via -oj (segment-level offsets in ms, the proven time marks). Word-level timing is out of
 * scope (needs an extra DTW model download). Filler detection is text-based and only ever a REVIEW
 * SUGGESTION: cutting happens exclusively on emitted segment boundaries after the user confirms.
 * Pure decisions live here; Tauri plumbing is injectable for headless tests (engine factory precedent). */

import {invoke,isTauri} from '@tauri-apps/api/core';
import {awaitVoiceJob,toMono16kBounded,voiceStatus,type VoiceInvoke} from '../agent/nativeVoice';
import {voicePreviewEnabled} from '../agent/voicePreview';
import {voiceLanguage,type VoiceLanguage} from '../agent/voicePreview';
import {cutSessionRange,type Arrangement} from './arrangement';

export interface TranscriptSegment{
 /** Proven time marks from the pinned helper, milliseconds and derived 48 kHz frames. */
 fromMs:number;toMs:number;fromFrame:number;toFrame:number;
 text:string;
 /** Text-based review suggestion only - never an automatic cut. */
 fillerOnly:boolean;
}

const MAX_SEGMENTS=1000,MAX_CHARS=12000,MAX_TEXT_CHARS=500,MAX_MS=120_000;

/** Conservative filler sets: a segment counts as filler-only when EVERY word in it is a filler. */
const FILLERS:Record<VoiceLanguage,readonly string[]>={
 de:['ähm','äh','hm','uhm','uh'],
 en:['um','uh','er','erm','hm'],
};

export function isFillerOnly(text:string,language:VoiceLanguage):boolean{
 const norm=text.toLowerCase().replace(/[^\p{L}\p{N} ]/gu,' ').trim().replace(/\s+/g,' ');
 if(!norm)return false;
 const set=FILLERS[language]??FILLERS.en;
 return norm.split(' ').every(word=>set.includes(word));
}

/** Validate the normalized segment JSON produced by the native side (validated there too - belt and braces). */
export function parseSegments(json:unknown,language:VoiceLanguage='de'):TranscriptSegment[]{
 if(!Array.isArray(json)||!json.length||json.length>MAX_SEGMENTS)throw Error('Invalid segment transcript');
 let total=0;
 return json.map(entry=>{
  if(!entry||typeof entry!=='object')throw Error('Invalid segment transcript');
  const {from_ms:fromMs,to_ms:toMs,text}=entry as Record<string,unknown>;
  if(!Number.isSafeInteger(fromMs)||!Number.isSafeInteger(toMs)||(fromMs as number)<0||(toMs as number)<(fromMs as number)||(toMs as number)>MAX_MS)throw Error('Invalid segment timing');
  if(typeof text!=='string'||!text.trim()||Array.from(text).length>MAX_TEXT_CHARS||text.includes('\0'))throw Error('Invalid segment text');
  total+=Array.from(text).length;if(total>MAX_CHARS)throw Error('Invalid segment transcript');
  const trimmed=text.trim();
  return {fromMs:fromMs as number,toMs:toMs as number,fromFrame:Math.round((fromMs as number)*48),toFrame:Math.round((toMs as number)*48),text:trimmed,fillerOnly:isFillerOnly(trimmed,language)};
 });
}

/** Map picked segments to sorted, merged, clamped cut ranges in 48 kHz frames. Segment boundaries are used exactly as emitted. */
export function segmentsToCutRanges(segments:readonly TranscriptSegment[],picked:readonly number[],endFrames:number):{start:number;end:number}[]{
 const ranges=picked.map(i=>{
  const s=segments[i];if(!s)throw Error('Segment selection is outdated');
  return {start:Math.max(0,Math.min(s.fromFrame,endFrames)),end:Math.max(0,Math.min(s.toFrame,endFrames))};
 }).filter(r=>r.end>r.start).sort((a,b)=>a.start-b.start);
 const merged:{start:number;end:number}[]=[];
 for(const r of ranges){const last=merged[merged.length-1];if(last&&r.start<=last.end)last.end=Math.max(last.end,r.end);else merged.push({...r});}
 return merged;
}

/** Apply validated ranges as one undoable edit (cut back to front so earlier ranges stay valid). */
export function applySegmentRanges(s:Arrangement,ranges:readonly{start:number;end:number}[],nextId:()=>string):number{
 for(let i=0;i<ranges.length;i++){
  const r=ranges[i];
  if(!Number.isSafeInteger(r.start)||!Number.isSafeInteger(r.end)||r.start<0||r.end<=r.start)throw Error('Invalid segment cut');
  if(i>0&&r.start<ranges[i-1].end)throw Error('Overlapping segment cuts');
 }
 let removed=0;
 for(let i=ranges.length-1;i>=0;i--){cutSessionRange(s,ranges[i].start,ranges[i].end,nextId);removed+=ranges[i].end-ranges[i].start;}
 return removed;
}

/** Rendered stereo PCM -> bounded 16 kHz mono for the voice helper. Sessions are capped at 120 s. */
export function sessionPcmToMono16k(channels:readonly Float32Array[]):Int16Array{
 return toMono16kBounded(channels,48000,120);
}

type Transcriber=(pcm:Int16Array,language:VoiceLanguage,signal:AbortSignal)=>Promise<TranscriptSegment[]>;

async function transcribeSegmentsNative(pcm:Int16Array,language:VoiceLanguage,signal:AbortSignal,call:VoiceInvoke=invoke):Promise<TranscriptSegment[]>{
 signal.throwIfAborted();
 if(!pcm.length||pcm.length>16000*120)throw Error('PCM outside limits');
 const id=await call<string>('local_voice_transcribe_segments',{pcm:Array.from(pcm),language:voiceLanguage(language)});
 try{
  const result=await awaitVoiceJob(id,signal,call,undefined,3700);signal.throwIfAborted();
  if(!result.transcript)throw Error('Invalid segment transcript');
  return parseSegments(JSON.parse(result.transcript),language);
 }finally{await call('local_voice_cancel',{id}).catch(()=>{});}
}

export type SegmentUnavailable='not-tauri'|'preview-disabled'|'helper-missing'|'model-missing';
export interface SegmentCapability{ready:boolean;reason:'ready'|SegmentUnavailable}

async function defaultCapability():Promise<SegmentCapability>{
 if(!isTauri())return {ready:false,reason:'not-tauri'};
 if(!voicePreviewEnabled())return {ready:false,reason:'preview-disabled'};
 const status=await voiceStatus();
 if(!status?.helperReady)return {ready:false,reason:'helper-missing'};
 if(!status?.modelReady)return {ready:false,reason:'model-missing'};
 return {ready:true,reason:'ready'};
}
let capabilityImpl:()=>Promise<SegmentCapability>=defaultCapability;
/** Test hook: swap the capability probe (the panel stays hidden unless ready). Production never calls this. */
export function setSegmentCapability(impl?:()=>Promise<SegmentCapability>){capabilityImpl=impl??defaultCapability;}
export function segmentCapability():Promise<SegmentCapability>{return capabilityImpl();}

let transcribeImpl:Transcriber=transcribeSegmentsNative;
/** Test hook (setSoundEngineFactory precedent): swap the native transcription step. Production never calls this. */
export function setSegmentTranscriber(impl?:Transcriber){transcribeImpl=impl??transcribeSegmentsNative;}
export function transcribeSegments(pcm:Int16Array,language:VoiceLanguage,signal:AbortSignal):Promise<TranscriptSegment[]>{return transcribeImpl(pcm,language,signal);}
