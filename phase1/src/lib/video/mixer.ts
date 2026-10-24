/**
 * Windowed 48 kHz stereo mix buffer for the export: video-zone audio and audio-track clips are summed by timeline time,
 * and finished windows flush strictly left to right, so the encoder always sees monotonic timestamps.
 * Memory stays O(window) no matter how long the timeline is. Pure - no mediabunny, no DOM.
 */
export class WindowMixer{
 private windows=new Map<number,Float32Array>();
 constructor(readonly windowSeconds=10,readonly rate=48_000){}
 private buf(w:number){let b=this.windows.get(w);if(!b){b=new Float32Array(Math.ceil(this.windowSeconds*this.rate)*2);this.windows.set(w,b);}return b;}
 /** Sums one frame at a timeline time. */
 add(time:number,l:number,r:number){
  if(!(time>=0))return;
  const w=Math.floor(time/this.windowSeconds),buf=this.buf(w);
  const i=Math.min(buf.length-2,Math.max(0,Math.round((time-w*this.windowSeconds)*this.rate)*2));
  buf[i]+=l;buf[i+1]+=r;
 }
 /** Sums an interleaved stereo chunk starting at timeline time `at`. */
 addChunk(at:number,data:Float32Array){
  const frames=data.length>>1;
  for(let f=0;f<frames;f++){
   const time=at+f/this.rate;
   if(!(time>=0))continue;
   const w=Math.floor(time/this.windowSeconds),buf=this.buf(w);
   const i=Math.min(buf.length-2,Math.round((time-w*this.windowSeconds)*this.rate)*2);
   buf[i]+=data[f*2];buf[i+1]+=data[f*2+1];
  }
 }
 /** Marks the windows covering [time, time+duration) as existing (silent but real), so gaps inside a span stay explicit. */
 addSilence(time:number,duration:number){
  if(!(duration>0))return;
  const w0=Math.floor(time/this.windowSeconds),w1=Math.floor((time+duration-1e-9)/this.windowSeconds);
  for(let w=w0;w<=w1;w++)this.buf(w);
 }
 /** Returns and drops every window that ends at or before `through`, in time order. */
 flushThrough(through:number):{start:number;data:Float32Array}[]{
  const out:{start:number;data:Float32Array}[]=[];
  for(const[w,buf]of[...this.windows.entries()].sort((a,b)=>a[0]-b[0])){
   if((w+1)*this.windowSeconds>through+1e-9)break;
   out.push({start:w*this.windowSeconds,data:buf});this.windows.delete(w);
  }
  return out;
 }
 /** Everything that is left, in time order. */
 flushAll():{start:number;data:Float32Array}[]{return this.flushThrough(Number.MAX_SAFE_INTEGER);}
}
