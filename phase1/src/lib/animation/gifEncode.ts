/** GIF89a encoder: median-cut global palette (256 colours) and LZW, no dithering, no dependencies. Frames are full-canvas RGBA composited by the caller. */
export const GIF_MAX_FRAMES=300;
export const GIF_MAX_BYTES=64*1024*1024;
export class GifError extends Error{constructor(message:string,readonly code:'too-large'|'too-many'|'empty'){super(message);this.name='GifError';}}
export interface GifFrame{pixels:Uint8Array|Uint8ClampedArray;/** RGBA, width*height*4. */delayCs:number}
/** Sampled median-cut palette over all frames (at most `samples` pixels per frame, deterministic stride). Returns 256 RGB triplets. */
export function buildPalette(frames:readonly GifFrame[],width:number,height:number):Uint8Array{
 const MAX_SAMPLES=32768;const buckets:{r:number;g:number;b:number;count:number}[]=[];const seen=new Map<number,number>();
 const quant=(v:number)=>v&0b11111000;
 for(const f of frames){
  const total=width*height,step=Math.max(1,Math.floor(total/MAX_SAMPLES));
  for(let i=0;i<total;i+=step){
   const o=i*4,r=quant(f.pixels[o]),g=quant(f.pixels[o+1]),b=quant(f.pixels[o+2]);const key=(r<<16)|(g<<8)|b;
   const at=seen.get(key);if(at!==undefined)buckets[at].count++;else{seen.set(key,buckets.length);buckets.push({r,g,b,count:1});}
  }
 }
 interface Box{lo:number;hi:number}
 let boxes:Box[]=[{lo:0,hi:buckets.length}];
 const channels=(box:Box)=>{
  let mn=[255,255,255],mx=[0,0,0];
  for(let i=box.lo;i<box.hi;i++){const b=buckets[i];if(b.r<mn[0])mn[0]=b.r;if(b.r>mx[0])mx[0]=b.r;if(b.g<mn[1])mn[1]=b.g;if(b.g>mx[1])mx[1]=b.g;if(b.b<mn[2])mn[2]=b.b;if(b.b>mx[2])mx[2]=b.b;}
  const spread=[mx[0]-mn[0],mx[1]-mn[1],mx[2]-mn[2]];return spread.indexOf(Math.max(...spread));
 };
 while(boxes.length<256){
  let pick=-1,pickSpread=-1;
  for(let i=0;i<boxes.length;i++){if(boxes[i].hi-boxes[i].lo<2)continue;const ch=channels(boxes[i]);const b=buckets[boxes[i].lo];void b;
   let mn=[255,255,255],mx=[0,0,0];for(let j=boxes[i].lo;j<boxes[i].hi;j++){const q=buckets[j];mn=[Math.min(mn[0],q.r),Math.min(mn[1],q.g),Math.min(mn[2],q.b)];mx=[Math.max(mx[0],q.r),Math.max(mx[1],q.g),Math.max(mx[2],q.b)];}
   const spread=Math.max(mx[0]-mn[0],mx[1]-mn[1],mx[2]-mn[2]);if(spread>pickSpread){pickSpread=spread;pick=i;}}
  if(pick<0)break;
  const box=boxes[pick];const ch=channels(box);
  const slice=buckets.slice(box.lo,box.hi).sort((a,b)=>(ch===0?a.r-b.r:ch===1?a.g-b.g:a.b-b.b)||a.count-b.count);
  buckets.splice(box.lo,box.hi-box.lo,...slice);
  let total=0;for(let j=box.lo;j<box.hi;j++)total+=buckets[j].count;
  let acc=0,mid=box.lo;for(let j=box.lo;j<box.hi;j++){acc+=buckets[j].count;if(acc>=total/2){mid=j+1;break;}}
  if(mid<=box.lo)mid=box.lo+1;if(mid>=box.hi)mid=box.hi-1;
  boxes.splice(pick,1,{lo:box.lo,hi:mid},{lo:mid,hi:box.hi});
 }
 const palette=new Uint8Array(256*3);
 boxes.slice(0,256).forEach((box,i)=>{
  let r=0,g=0,b=0,n=0;for(let j=box.lo;j<box.hi;j++){const q=buckets[j];r+=q.r*q.count;g+=q.g*q.count;b+=q.b*q.count;n+=q.count;}
  palette[i*3]=Math.round(r/Math.max(1,n));palette[i*3+1]=Math.round(g/Math.max(1,n));palette[i*3+2]=Math.round(b/Math.max(1,n));
 });
 if(!buckets.length)palette.fill(0);
 return palette;
}
/** Nearest palette index per pixel, cached by 15-bit colour key. */
export function mapIndices(pixels:Uint8Array|Uint8ClampedArray,palette:Uint8Array,count:number):{indices:Uint8Array;used:number}{
 const out=new Uint8Array(pixels.length/4);const cache=new Map<number,number>();const used=new Set<number>();
 for(let i=0;i<out.length;i++){
  const o=i*4,key=((pixels[o]>>3)<<10)|((pixels[o+1]>>3)<<5)|(pixels[o+2]>>3);
  let idx=cache.get(key);
  if(idx===undefined){
   let best=0,bestD=Infinity;const r=pixels[o],g=pixels[o+1],b=pixels[o+2];
   for(let p=0;p<count;p++){const dr=r-palette[p*3],dg=g-palette[p*3+1],db=b-palette[p*3+2];const d=dr*dr+dg*dg+db*db;if(d<bestD){bestD=d;best=p;}}
   idx=best;cache.set(key,best);
  }
  out[i]=idx;used.add(idx);
 }
 return {indices:out,used:used.size};
}
/** Floyd-Steinberg error diffusion onto the palette. Nearest colours are cached by the 15-bit key of the corrected colour, so the cost stays near the plain mapper. */
export function ditherIndices(pixels:Uint8Array|Uint8ClampedArray,palette:Uint8Array,count:number,width:number):{indices:Uint8Array;used:number}{
 const n=pixels.length/4,height=Math.floor(n/Math.max(1,width)),out=new Uint8Array(n),cache=new Map<number,number>(),used=new Set<number>();
 let cur=new Float32Array((width+2)*3),next=new Float32Array((width+2)*3);
 for(let y=0;y<height;y++){
  for(let x=0;x<width;x++){
   const o=(y*width+x)*4,e=(x+1)*3;
   const r=Math.min(255,Math.max(0,pixels[o]+cur[e])),g=Math.min(255,Math.max(0,pixels[o+1]+cur[e+1])),b=Math.min(255,Math.max(0,pixels[o+2]+cur[e+2]));
   const key=((r>>3)<<10)|((g>>3)<<5)|(b>>3);let idx=cache.get(key);
   if(idx===undefined){let best=0,bestD=Infinity;for(let q=0;q<count;q++){const dr=r-palette[q*3],dg=g-palette[q*3+1],db=b-palette[q*3+2];const d=dr*dr+dg*dg+db*db;if(d<bestD){bestD=d;best=q;}}idx=best;cache.set(key,best);}
   out[y*width+x]=idx;used.add(idx);
   const er=r-palette[idx*3],eg=g-palette[idx*3+1],eb=b-palette[idx*3+2];
   for(let c=0;c<3;c++){const err=c===0?er:c===1?eg:eb;cur[e+3+c]+=err*7/16;next[e-3+c]+=err*3/16;next[e+c]+=err*5/16;next[e+3+c]+=err/16;}
  }
  const t=cur;cur=next;next=t;next.fill(0);
 }
 return {indices:out,used:used.size};
}
/** GIF LZW with code-table reset at 4096 and 255-byte sub-blocks. */
export function lzwEncode(minCodeSize:number,indices:Uint8Array):Uint8Array{
 const CLEAR=1<<minCodeSize,EOI=CLEAR+1;const out:number[]=[];
 let codeSize=minCodeSize+1,dict=new Map<number,number>(),next=EOI+1,cur=0,curBits=0;
 const emit=(code:number)=>{cur|=code<<curBits;curBits+=codeSize;while(curBits>=8){out.push(cur&255);cur>>=8;curBits-=8;}};
 const reset=()=>{dict=new Map();next=EOI+1;codeSize=minCodeSize+1;};
 emit(CLEAR);reset();
 let prev=indices[0];
 for(let i=1;i<indices.length;i++){
  const k=indices[i],key=(prev<<8)|k;
  if(dict.has(key)){prev=dict.get(key)!;continue;}
  emit(prev);
  if(next<4096){dict.set(key,next++);if(next===(1<<codeSize)+1&&codeSize<12)codeSize++;}
  else{emit(CLEAR);reset();}
  prev=k;
 }
 emit(prev);emit(EOI);
 if(curBits>0)out.push(cur&255);
 const blocks:number[]=[];
 for(let i=0;i<out.length;i+=255){blocks.push(Math.min(255,out.length-i),...out.slice(i,i+255));}
 blocks.push(0);
 return new Uint8Array(blocks);
}
/** Assemble a GIF89a. Opaque: the caller composites onto the background first. Throws GifError on bound violations. */
export function encodeGif(width:number,height:number,frames:readonly GifFrame[],loop=true,dither=false):Uint8Array{
 if(!frames.length)throw new GifError('Nothing to export.','empty');
 if(frames.length>GIF_MAX_FRAMES)throw new GifError(`A GIF is limited to ${GIF_MAX_FRAMES} frames. Shorten the work area.`,'too-many');
 if(width<1||height<1||width>16384||height>16384)throw new GifError('Bad frame size.','too-large');
 const palette=buildPalette(frames,width,height);
 const parts:Uint8Array[]=[];let bytes=0;
 const push=(u:Uint8Array)=>{bytes+=u.length;if(bytes>GIF_MAX_BYTES)throw new GifError('The GIF is larger than 64 MB. Shorten the work area or reduce the size.','too-large');parts.push(u);};
 const u8=(...n:number[])=>new Uint8Array(n);
 push(u8(0x47,0x49,0x46,0x38,0x39,0x61));
 push(u8(width&255,width>>8,height&255,height>>8,0b11110111,0,0));
 push(palette);
 if(loop)push(u8(0x21,0xFF,11,0x4E,0x45,0x54,0x53,0x43,0x41,0x50,0x45,0x32,0x2E,0x30,3,1,0,0,0));
 for(const f of frames){
  const delay=Math.max(2,Math.min(65535,Math.round(f.delayCs)));
  push(u8(0x21,0xF9,4,0,delay&255,delay>>8,0,0));
  push(u8(0x2C,0,0,0,0,width&255,width>>8,height&255,height>>8,0));
  push(u8(8));
  push(lzwEncode(8,(dither?ditherIndices(f.pixels,palette,256,width):mapIndices(f.pixels,palette,256)).indices));
 }
 push(u8(0x3B));
 const total=new Uint8Array(bytes);let o=0;for(const p of parts){total.set(p,o);o+=p.length;}
 return total;
}
