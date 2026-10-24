import {bytesToDataUrl,channelPeaks,MAX_AUDIO_BYTES,MAX_AUDIO_SECONDS,parseWav,peakBinCount,sniffMp3,validateAudioAsset,wavPeaks,type AudioAsset} from './audioCore';
import {TICKS_PER_SECOND} from './time';
export interface ImportProgress{done:number;total:number}
export class AudioImportCancelled extends Error{constructor(){super('Audio import cancelled.');this.name='AudioImportCancelled';}}
const nextTask=()=>new Promise<void>(r=>setTimeout(r,0));
async function sha256(bytes:Uint8Array):Promise<string>{
 const d=await crypto.subtle.digest('SHA-256',bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer);
 return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
const BATCH=32;
/**
 * Validates a WAV or MP3 file and builds the embedded asset. Size and length are bounded before any decode (2 MB, 10 minutes).
 * Peaks are computed in small batches that yield to the UI and check `signal`, so StudioProgress can show real progress and offer a real cancel.
 * MP3 is decoded by the browser's own decoder (no codec dependency); a browser that cannot decode it refuses the file.
 */
export async function prepareAudioAsset(file:File,onProgress:(p:ImportProgress)=>void=()=>{},signal?:AbortSignal):Promise<AudioAsset>{
 const check=()=>{if(signal?.aborted)throw new AudioImportCancelled();};
 if(file.size>MAX_AUDIO_BYTES)throw Error('Audio must be under 2 MB.');
 const bytes=new Uint8Array(await file.arrayBuffer());check();
 const name=file.name.toLowerCase();const isWav=name.endsWith('.wav')||(bytes[0]===0x52&&bytes[1]===0x49);
 if(!isWav&&!name.endsWith('.mp3')&&!(bytes[0]===0x49||bytes[0]===0xff))throw Error('Only WAV and MP3 audio is supported.');
 let sampleRate:number,channels:1|2,durationTicks:number,peaks:number[]=[];
 if(isWav){
  const w=parseWav(bytes);sampleRate=w.sampleRate;channels=w.channels;durationTicks=w.durationTicks;const bins=peakBinCount(w.frames);
  for(let b=0;b<bins;b+=BATCH){peaks.push(...wavPeaks(bytes,w,b,Math.min(bins,b+BATCH)));onProgress({done:Math.min(bins,b+BATCH),total:bins});await nextTask();check();}
 }else{
  const m=sniffMp3(bytes);sampleRate=m.sampleRate;channels=m.channels;
  const Offline=(globalThis as unknown as {OfflineAudioContext?:new(c:number,l:number,r:number)=>{decodeAudioData(b:ArrayBuffer):Promise<{duration:number;numberOfChannels:number;getChannelData(i:number):Float32Array}>}}).OfflineAudioContext;
  if(!Offline)throw Error('This browser cannot decode MP3.');
  onProgress({done:0,total:1});
  let buf;try{buf=await new Offline(1,1,44100).decodeAudioData(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer);}catch{throw Error('This MP3 could not be decoded.');}
  check();
  if(!(buf.duration>0)||buf.duration>MAX_AUDIO_SECONDS)throw Error('Audio must be 10 minutes or shorter.');
  durationTicks=Math.max(1,Math.round(buf.duration*TICKS_PER_SECOND));
  const chans=Array.from({length:Math.min(2,buf.numberOfChannels)},(_,i)=>buf.getChannelData(i)),bins=peakBinCount(chans[0].length);
  for(let b=0;b<bins;b+=BATCH){peaks.push(...channelPeaks(chans,b,Math.min(bins,b+BATCH)));onProgress({done:Math.min(bins,b+BATCH),total:bins});await nextTask();check();}
 }
 const hash=await sha256(bytes);check();
 const asset:AudioAsset={id:`audio-${hash}`,hash,mime:isWav?'audio/wav':'audio/mpeg',data:bytesToDataUrl(bytes,isWav?'audio/wav':'audio/mpeg'),sourceName:file.name.slice(0,256)||'audio',sourceType:isWav?'wav':'mp3',durationTicks,sampleRate,channels,peaks,license:'user-provided-unverified'};
 validateAudioAsset(asset);return asset;
}
