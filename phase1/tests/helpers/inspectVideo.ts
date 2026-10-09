import {ALL_FORMATS,BufferSource,CanvasSink,Input} from 'mediabunny';
/** Test helper (runs in the page): duration, audio span and a pixel at a timestamp of an encoded video. */
export async function inspect(raw:number[],at:number[]){
 const bytes=new Uint8Array(raw).buffer as ArrayBuffer;
 const input=new Input({source:new BufferSource(bytes),formats:ALL_FORMATS});
 const v=(await input.getVideoTracks())[0],a=(await input.getAudioTracks())[0]??null;
 const out:{duration:number;audioStart:number|null;audioEnd:number|null;audioPeak:number[];pixels:number[][];size:[number,number]}={duration:await input.computeDuration(),audioStart:null,audioEnd:null,audioPeak:[],pixels:[],size:[v.displayWidth,v.displayHeight]};
 if(a){out.audioStart=await a.getFirstTimestamp();out.audioEnd=await a.computeDuration();}
 const sink=new CanvasSink(v,{width:v.displayWidth,height:v.displayHeight,fit:'fill'});
 for(const t of at){
  const f=await sink.getCanvas(t);if(!f){out.pixels.push([-1,-1,-1]);continue;}
  const c=f.canvas as HTMLCanvasElement|OffscreenCanvas,ctx=c.getContext('2d') as CanvasRenderingContext2D;
  const p=ctx.getImageData(Math.floor(c.width*0.02),Math.floor(c.height*0.02),1,1).data;out.pixels.push([p[0],p[1],p[2]]);
 }
 input.dispose();return out;
}
/** Renders the exported video frame at `t` to a PNG data URL (for screenshots of the real export). */
export async function frameDataUrl(raw:number[],t:number){
 const input=new Input({source:new BufferSource(new Uint8Array(raw).buffer as ArrayBuffer),formats:ALL_FORMATS});
 const v=(await input.getVideoTracks())[0];const sink=new CanvasSink(v,{width:v.displayWidth,height:v.displayHeight,fit:'fill'});
 const f=await sink.getCanvas(t);const c=document.createElement('canvas');c.width=v.displayWidth;c.height=v.displayHeight;
 c.getContext('2d')!.drawImage(f!.canvas as CanvasImageSource,0,0);input.dispose();return c.toDataURL('image/png');
}
