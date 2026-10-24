import {invoke} from '@tauri-apps/api/core';
import {awaitVoiceJob,toMono16kBounded,type VoiceInvoke} from '../agent/nativeVoice';
import {voiceLanguage,type VoiceLanguage} from '../agent/voicePreview';
export const MAX_FILE_BYTES=20_000_000;
export const MAX_FILE_SECONDS=600;
export type FilePhase='decoding'|'transcribing';
export function validateTranscript(text:unknown):string{
 if(typeof text!=='string'||!text.trim()||Array.from(text).length>120000||text.includes('\0'))throw Error('Invalid file transcript');
 return text.trim();
}
export async function filePCM(file:File,signal:AbortSignal):Promise<Int16Array>{
 signal.throwIfAborted();
 if(!file.size||file.size>MAX_FILE_BYTES)throw Error('Audio file outside size limits');
 const context=new AudioContext();
 try{
  const bytes=await file.arrayBuffer();signal.throwIfAborted();
  const audio=await context.decodeAudioData(bytes);signal.throwIfAborted();
  if(!Number.isFinite(audio.duration)||audio.duration<=0||audio.duration>MAX_FILE_SECONDS||audio.length*audio.numberOfChannels*4>128_000_000)throw Error('Decoded audio outside limits');
  return toMono16kBounded(Array.from({length:audio.numberOfChannels},(_,i)=>audio.getChannelData(i)),audio.sampleRate,600);
 }finally{await context.close();}
}
/** No cloud fallback, prompt insertion or durable transcript storage. Always release the native result. */
export async function transcribeAudioFile(file:File,language:VoiceLanguage,signal:AbortSignal,onPhase:(phase:FilePhase)=>void=()=>{},call:VoiceInvoke=invoke,decode=filePCM):Promise<string>{
 signal.throwIfAborted();const selectedLanguage=voiceLanguage(language);onPhase('decoding');
 const pcm=await decode(file,signal);signal.throwIfAborted();
 if(!pcm.length||pcm.length>16000*MAX_FILE_SECONDS)throw Error('PCM outside limits');
 onPhase('transcribing');
 const id=await call<string>('local_voice_transcribe_file',{pcm:Array.from(pcm),language:selectedLanguage});
 try{const result=await awaitVoiceJob(id,signal,call,undefined,3700);signal.throwIfAborted();return validateTranscript(result.transcript);}
 finally{await call('local_voice_cancel',{id}).catch(()=>{});}
}
export function downloadTranscript(text:string,name:string){
 const url=URL.createObjectURL(new Blob([validateTranscript(text)],{type:'text/plain;charset=utf-8'}));
 const anchor=document.createElement('a');anchor.href=url;anchor.download=(name.replace(/\.[^.]*$/,'').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').slice(0,100)||'transcript')+'.txt';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
