/** Thumbnail decoding on mediabunny: CanvasSink.getCanvas per bucket time, the same decode path the export worker uses. No UI imports. */
import {ALL_FORMATS,AudioSampleSink,BufferSource,CanvasSink,Input} from 'mediabunny';
import type {SourceInfo} from './filmstrip-controller';
export interface OpenSource{input:Input;sinks:Map<string,CanvasSink>;track:Awaited<ReturnType<Input['getPrimaryVideoTrack']>>;info:SourceInfo}
export async function openSource(bytes:ArrayBuffer):Promise<OpenSource>{
 const input=new Input({source:new BufferSource(bytes),formats:ALL_FORMATS});
 const track=await input.getPrimaryVideoTrack();
 if(!track)throw new Error('No video track');
 if(!(await track.canDecode()))throw new Error('This video codec cannot be decoded here');
 const duration=await input.computeDuration();
 return{input,sinks:new Map(),track,info:{duration,width:track.displayWidth,height:track.displayHeight}};
}
/**
 * Min/max amplitude buckets over the whole source, one decode pass of the audio track.
 * Interleaved [min,max] per bucket, ~50 ms each (see waveform.ts). Null when the source has no audio track.
 */
export async function decodePeaks(src:OpenSource,buckets:number):Promise<Float32Array|null>{
 const track=(await src.input.getAudioTracks())[0];
 if(!track||!(buckets>0)||!(src.info.duration>0))return null;
 const peaks=new Float32Array(buckets*2);
 const step=src.info.duration/buckets;
 const sink=new AudioSampleSink(track);
 for await(const sample of sink.samples(0,src.info.duration)){
  const rate=sample.sampleRate,ch=sample.numberOfChannels;
  const data=new Float32Array(sample.allocationSize({planeIndex:0,format:'f32'})/4);
  sample.copyTo(data,{planeIndex:0,format:'f32'});
  const frames=data.length/ch;
  for(let f=0;f<frames;f++){
   let v=0;
   for(let c=0;c<ch;c++){const a=Math.abs(data[f*ch+c]);if(a>v)v=a;}
   const b=Math.min(buckets-1,Math.max(0,Math.floor((sample.timestamp+f/rate)/step)));
   // Symmetric rails: the waveform draws around the centre line, so the min rail mirrors the loudest frame.
   if(v>peaks[b*2+1]){peaks[b*2+1]=v;peaks[b*2]=-v;}
  }
  sample.close();
 }
 return peaks;
}
/** Decodes one frame per time into an ImageBitmap of exactly `width`x`height`. Failed or empty frames are null. */
export async function decodeThumbs(src:OpenSource,times:number[],width:number,height:number):Promise<(ImageBitmap|null)[]>{
 const k=`${width}x${height}`;
 let sink=src.sinks.get(k);
 if(!sink){sink=new CanvasSink(src.track!,{width,height,fit:'fill'});src.sinks.set(k,sink);}
 const out:(ImageBitmap|null)[]=[];
 for(const t of times){
  try{const w=await sink.getCanvas(t);out.push(w?await createImageBitmap(w.canvas as OffscreenCanvas):null);}
  catch{out.push(null);}
 }
 return out;
}
