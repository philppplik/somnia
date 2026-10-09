/** Thumbnail decoding on mediabunny: CanvasSink.getCanvas per bucket time, the same decode path the export worker uses. No UI imports. */
import {ALL_FORMATS,BufferSource,CanvasSink,Input} from 'mediabunny';
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
