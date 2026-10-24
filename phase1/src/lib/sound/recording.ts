/**
 * Take recording for the Sound Studio arrange view: the pure decisions behind the Record button.
 * The getUserMedia / MediaRecorder plumbing lives in the SoundArrange component; everything here is
 * unit-testable. The recorded container is decoded and resampled to the 48 kHz session format with
 * WebAudio, because the SoundCraft decoder (format.ts) does not accept webm/m4a recorder output.
 */
import {ARRANGE_LIMITS} from './arrangement';
import {encodeSessionWav} from './sessionWav';

/** Container/codec candidates in preference order: opus in WebM where available, MP4 audio for the macOS webview. */
export const TAKE_MIME_CANDIDATES=['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/aac'] as const;

/** First candidate the platform's MediaRecorder accepts, or '' to let the recorder pick its default. */
export const pickTakeMime=(isSupported:(mimeType:string)=>boolean):string=>TAKE_MIME_CANDIDATES.find(isSupported)??'';

/**
 * A take can never be longer than the session itself: the arrangement is capped at ARRANGE_LIMITS.seconds,
 * and 120 s of 48 kHz stereo still fits the sourceFrames memory budget. Recording auto-stops here.
 */
export const TAKE_MAX_SECONDS=ARRANGE_LIMITS.seconds;

/** Below this remaining session time the Record button refuses to start: not enough room for a usable take. */
export const TAKE_MIN_SECONDS=0.5;

/** Session frames left for a take starting at startFrame. The recording cap and the decode clamp both use it. */
export const remainingTakeFrames=(startFrame:number,sessionFrames=TAKE_MAX_SECONDS*48000):number=>
 Math.max(0,sessionFrames-Math.max(0,Math.round(startFrame)));

/** A free take file name: take.wav, take-2.wav, take-3.wav, ... The stored file is always a session WAV. */
export const takeFileName=(existing:readonly string[]):string=>{
 const taken=new Set(existing.map(n=>n.toLowerCase()));
 if(!taken.has('take.wav'))return 'take.wav';
 for(let i=2;;i++){
  const name=`take-${i}.wav`;
  if(!taken.has(name.toLowerCase()))return name;
 }
};

/**
 * Decodes a recorded take (webm/mp4/aac from MediaRecorder) and resamples it into the 48 kHz stereo
 * session WAV format. Browser-only: needs AudioContext/OfflineAudioContext, covered by e2e, not unit tests.
 */
export async function decodeTakeToSessionWav(blob:Blob,maxFrames=TAKE_MAX_SECONDS*48000):Promise<ArrayBuffer>{
 const bytes=await blob.arrayBuffer();
 const ctx=new AudioContext();
 try{
  const buf=await ctx.decodeAudioData(bytes);
  const frames=Math.max(1,Math.min(Math.ceil(buf.duration*48000),Math.max(1,Math.round(maxFrames))));
  const off=new OfflineAudioContext(2,frames,48000);
  const src=off.createBufferSource();src.buffer=buf;src.connect(off.destination);src.start(0);
  const rendered=await off.startRendering();
  return encodeSessionWav([rendered.getChannelData(0),rendered.getChannelData(1)],48000);
 }finally{void ctx.close();}
}
