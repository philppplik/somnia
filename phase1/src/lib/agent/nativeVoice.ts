import {invoke,isTauri} from '@tauri-apps/api/core';
import type {STTAdapter,VoiceClip} from './voiceInput';
export interface VoiceStatus{helperReady:boolean;modelReady:boolean;modelBytes:number;modelSha256:string;modelRevision:string;modelUrl:string;engineRevision:string;storageChecked:boolean}
export interface VoiceJob{id:string;phase:string;bytes:number;total:number;transcript?:string|null;error?:string|null}
export type VoiceInvoke=<T>(command:string,args?:Record<string,unknown>)=>Promise<T>;
export async function voiceStatus():Promise<VoiceStatus|null>{return isTauri()?invoke('local_voice_status'):null;}
/** Explicit equal-channel mix and linear resampling. Not original PCM retention or a timing guarantee. */
export function toMono16k(channels:readonly Float32Array[],sampleRate:number):Int16Array{
 if(!Number.isFinite(sampleRate)||sampleRate<8000||sampleRate>192000||channels.length<1||channels.length>8||!channels[0].length||channels.some(c=>c.length!==channels[0].length)||channels[0].length/sampleRate>120)throw Error('Audio format outside limits');
 const count=Math.floor(channels[0].length*16000/sampleRate);if(count<1||count>1920000)throw Error('Audio duration outside limits');const output=new Int16Array(count);
 for(let i=0;i<count;i++){const position=i*sampleRate/16000,from=Math.floor(position),to=Math.min(from+1,channels[0].length-1),fraction=position-from;let value=0;for(const c of channels){if(!Number.isFinite(c[from])||!Number.isFinite(c[to]))throw Error('Invalid audio sample');value+=(c[from]*(1-fraction)+c[to]*fraction)/channels.length;}output[i]=Math.round(Math.max(-1,Math.min(1,value))*32767);}return output;
}
export async function clipPCM(clip:VoiceClip):Promise<Int16Array>{
 if(clip.audio.size>20_000_000)throw Error('Audio exceeds limit');const context=new AudioContext();try{const buffer=await context.decodeAudioData(await clip.audio.arrayBuffer());return toMono16k(Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i)),buffer.sampleRate);}finally{await context.close();}
}
export async function awaitVoiceJob(id:string,signal:AbortSignal,call:VoiceInvoke=invoke,onProgress?:(job:VoiceJob)=>void):Promise<VoiceJob>{
 let completed=false;const cancel=()=>{void call('local_voice_cancel',{id}).catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
 try{signal.throwIfAborted();for(let i=0;i<2000;i++){signal.throwIfAborted();const job=await call<VoiceJob>('local_voice_poll',{id});signal.throwIfAborted();if(job.id!==id)throw Error('Voice job identity mismatch');onProgress?.(job);if(job.phase==='complete'){completed=true;return job;}if(['failed','cancelled'].includes(job.phase))throw Error('Voice job failed or cancelled');await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(Error('Voice job cancelled'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},500);signal.addEventListener('abort',abort,{once:true});});}throw Error('Voice job timed out');}
 finally{signal.removeEventListener('abort',cancel);if(!completed)cancel();}
}
export function whisperSTT(call:VoiceInvoke=invoke,decode=clipPCM):STTAdapter{return {id:'whisper.cpp-base',local:true,async transcribe(clip,signal){signal.throwIfAborted();const pcm=await decode(clip);signal.throwIfAborted();const id=await call<string>('local_voice_transcribe',{pcm:Array.from(pcm)});try{const result=await awaitVoiceJob(id,signal,call);signal.throwIfAborted();if(!result.transcript||result.transcript.length>48000||result.transcript.includes('\0'))throw Error('Invalid final transcript');return {text:result.transcript,final:true};}finally{await call('local_voice_cancel',{id}).catch(()=>{});}}};}
