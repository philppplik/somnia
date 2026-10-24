/**
 * Histogram of a rendered preview frame (RGBA bytes, as the engine returns them).
 * Pure: no DOM, no engine. The Photos histogram panel feeds it `PhotoSession.frame.bytes`,
 * so the numbers describe what is on screen, not the original file.
 */
export interface Histogram {
 r:Uint32Array;g:Uint32Array;b:Uint32Array;luma:Uint32Array;
 /** Pixels counted (fully transparent pixels are skipped). */
 count:number;
 /** Share of pixels, 0..1, where the luma bin is 0..CLIP_LOW or 251..255. */
 clipShadows:number;clipHighlights:number;
 /** Mean luma 0..255 and the luma bin at the 50th percentile. */
 meanLuma:number;medianLuma:number;
 /** Per channel: share of pixels with any channel at 0 or 255 exactly. */
 clipChannels:{r:number;g:number;b:number};
}
export const CLIP_LOW=4,CLIP_HIGH=251;
const bins=()=>new Uint32Array(256);
/** Rec. 709 luma from 8-bit sRGB values, rounded to a bin. */
export const lumaOf=(r:number,g:number,b:number)=>Math.min(255,Math.round(0.2126*r+0.7152*g+0.0722*b));
export function emptyHistogram():Histogram{
 return {r:bins(),g:bins(),b:bins(),luma:bins(),count:0,clipShadows:0,clipHighlights:0,meanLuma:0,medianLuma:0,clipChannels:{r:0,g:0,b:0}};
}
/** `maxSamples` bounds the work: larger frames are read with a pixel stride (every n-th pixel). */
export function computeHistogram(rgba:ArrayBuffer|Uint8Array|Uint8ClampedArray,maxSamples=1_100_000):Histogram{
 const data=rgba instanceof ArrayBuffer?new Uint8Array(rgba):new Uint8Array(rgba.buffer,rgba.byteOffset,rgba.byteLength);
 const h=emptyHistogram();const pixels=Math.floor(data.length/4);
 if(pixels===0)return h;
 const stride=Math.max(1,Math.ceil(pixels/maxSamples));
 let sum=0,low=0,high=0,cr=0,cg=0,cb=0;
 for(let p=0;p<pixels;p+=stride){
  const o=p*4;if(data[o+3]===0)continue;
  const r=data[o],g=data[o+1],b=data[o+2],y=lumaOf(r,g,b);
  h.r[r]++;h.g[g]++;h.b[b]++;h.luma[y]++;h.count++;sum+=y;
  if(y<=CLIP_LOW)low++;if(y>=CLIP_HIGH)high++;
  if(r===0||r===255)cr++;if(g===0||g===255)cg++;if(b===0||b===255)cb++;
 }
 if(h.count===0)return h;
 h.clipShadows=low/h.count;h.clipHighlights=high/h.count;h.meanLuma=sum/h.count;
 h.clipChannels={r:cr/h.count,g:cg/h.count,b:cb/h.count};
 let acc=0;const half=h.count/2;for(let i=0;i<256;i++){acc+=h.luma[i];if(acc>=half){h.medianLuma=i;break;}}
 return h;
}
export type HistogramChannel='luma'|'rgb'|'r'|'g'|'b';
/**
 * Heights 0..1 for `columns` columns. The scale cap is the 95th percentile column height, so one spike
 * (a pure black or white edge) does not flatten the rest of the curve; spikes are clamped to 1.
 */
export function histogramColumns(bins256:Uint32Array,columns=64):number[]{
 const merged=new Array<number>(columns).fill(0);
 for(let i=0;i<256;i++)merged[Math.min(columns-1,Math.floor(i*columns/256))]+=bins256[i];
 const sorted=[...merged].sort((a,b)=>a-b);
 const cap=Math.max(1,sorted[Math.min(columns-1,Math.floor(columns*0.95))]);
 return merged.map(v=>Math.min(1,v/cap));
}
/** SVG path (closed area) for one channel in a `width` x `height` box. */
export function histogramPath(bins256:Uint32Array,width=256,height=64,columns=64):string{
 const cols=histogramColumns(bins256,columns);const step=width/columns;
 let d=`M0 ${height}`;
 cols.forEach((v,i)=>{d+=` L${round(i*step)} ${round(height-v*height)} L${round((i+1)*step)} ${round(height-v*height)}`;});
 return `${d} L${width} ${height} Z`;
}
const round=(n:number)=>Math.round(n*100)/100;
/** Zone shares (blacks, shadows, mids, highlights, whites), each 0..1, from the luma histogram. Sum is 1 when count>0. */
export function toneZones(h:Histogram):{blacks:number;shadows:number;mids:number;highlights:number;whites:number}{
 const z={blacks:0,shadows:0,mids:0,highlights:0,whites:0};if(!h.count)return z;
 for(let i=0;i<256;i++){const k=i<51?'blacks':i<102?'shadows':i<154?'mids':i<205?'highlights':'whites';z[k]+=h.luma[i];}
 (Object.keys(z) as (keyof typeof z)[]).forEach(k=>{z[k]/=h.count;});return z;
}
