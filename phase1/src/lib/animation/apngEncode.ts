/** APNG assembly from finished PNG frames: one acTL, one fcTL per frame, IDAT of the first frame kept, later frames as fdAT. No dependencies. */
export const APNG_MAX_BYTES=64*1024*1024;
export class ApngError extends Error{constructor(message:string,readonly code:'too-large'|'raster'){super(message);this.name='ApngError';}}
const CRC_TABLE=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
export function crc32(bytes:Uint8Array):number{
 let c=0xFFFFFFFF;for(let i=0;i<bytes.length;i++)c=CRC_TABLE[(c^bytes[i])&255]^(c>>>8);
 return (c^0xFFFFFFFF)>>>0;
}
interface Chunk{type:string;data:Uint8Array}
/** Walk PNG chunks. Throws on a bad signature or truncated file. */
export function pngChunks(png:Uint8Array):Chunk[]{
 const sig=[137,80,78,71,13,10,26,10];
 if(png.length<8||sig.some((b,i)=>png[i]!==b))throw new ApngError('Not a PNG frame.','raster');
 const out:Chunk[]=[];let o=8;
 while(o+8<=png.length){
  const len=(png[o]<<24|png[o+1]<<16|png[o+2]<<8|png[o+3])>>>0;
  if(o+12+len>png.length)throw new ApngError('Truncated PNG frame.','raster');
  out.push({type:String.fromCharCode(png[o+4],png[o+5],png[o+6],png[o+7]),data:png.subarray(o+8,o+8+len)});
  o+=12+len;
 }
 return out;
}
const u32=(n:number)=>new Uint8Array([n>>>24&255,n>>>16&255,n>>>8&255,n&255]);
const u16=(n:number)=>new Uint8Array([n>>8&255,n&255]);
function chunk(type:string,data:Uint8Array):Uint8Array{
 const body=new Uint8Array(4+data.length);body.set(new TextEncoder().encode(type));body.set(data,4);
 const crc=crc32(body);
 const out=new Uint8Array(4+body.length+4);out.set(u32(data.length));out.set(body,4);out.set(u32(crc),4+body.length);
 return out;
}
export interface ApngOptions{/** Frame delay as a fraction of a second. */delayNum:number;delayDen:number;loop?:boolean}
/** Build an APNG from identical-size PNG frames. Throws ApngError on malformed frames or when the result exceeds the byte cap. */
export function encodeApng(frames:readonly Uint8Array[],o:ApngOptions):Uint8Array{
 if(!frames.length)throw new ApngError('Nothing to export.','raster');
 const first=pngChunks(frames[0]);const ihdr=first.find(c=>c.type==='IHDR');
 if(!ihdr||ihdr.data.length!==13)throw new ApngError('PNG frame has no image header.','raster');
 const width=(ihdr.data[0]<<24|ihdr.data[1]<<16|ihdr.data[2]<<8|ihdr.data[3])>>>0,height=(ihdr.data[4]<<24|ihdr.data[5]<<16|ihdr.data[6]<<8|ihdr.data[7])>>>0;
 const parts:Uint8Array[]=[new Uint8Array([137,80,78,71,13,10,26,10])];let bytes=8;
 const push=(u:Uint8Array)=>{bytes+=u.length;if(bytes>APNG_MAX_BYTES)throw new ApngError('The APNG is larger than 64 MB. Shorten the work area or reduce the size.','too-large');parts.push(u);};
 push(chunk('IHDR',ihdr.data));
 const actl=new Uint8Array(8);actl.set(u32(frames.length));actl.set(u32(o.loop===false?1:0),4);push(chunk('acTL',actl));
 let seq=0;
 const fctl=()=>{const d=new Uint8Array(26);d.set(u32(seq++),0);d.set(u32(width),4);d.set(u32(height),8);d.set(u32(0),12);d.set(u32(0),16);d.set(u16(o.delayNum),20);d.set(u16(o.delayDen),22);d[24]=0;d[25]=0;return chunk('fcTL',d);};
 frames.forEach((png,i)=>{
  const chunks=pngChunks(png);const idats=chunks.filter(c=>c.type==='IDAT');
  const head=i===0?chunks.find(c=>c.type==='IHDR'):undefined;
  if(i>0){const h=chunks.find(c=>c.type==='IHDR');if(!h||h.data.some((b,j)=>b!==ihdr.data[j]))throw new ApngError('All frames must share size and colour type.','raster');}
  void head;
  if(!idats.length)throw new ApngError('PNG frame has no image data.','raster');
  push(fctl());
  for(const idat of idats){
   if(i===0)push(chunk('IDAT',idat.data));
   else{const d=new Uint8Array(4+idat.data.length);d.set(u32(seq++));d.set(idat.data,4);push(chunk('fdAT',d));}
  }
 });
 push(chunk('IEND',new Uint8Array(0)));
 const total=new Uint8Array(bytes);let off=0;for(const p of parts){total.set(p,off);off+=p.length;}
 return total;
}
