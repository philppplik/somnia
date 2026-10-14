import {TICKS_PER_SECOND} from './time';
/**
 * Audio basics for the Animation studio (P5b). Pure, dependency-free parsing and validation.
 * WAV is parsed here; MP3 is only sniffed here (header, rate, size sanity) and decoded by the browser at import.
 * Nothing in this module claims mux, export or codec support: audio is a local preview and snapshot asset.
 */
export const MAX_AUDIO_BYTES=2_000_000;
export const MAX_AUDIO_TOTAL_BYTES=4_000_000;
export const MAX_AUDIO_ASSETS=8;
export const MAX_AUDIO_SECONDS=600;
export const PEAK_BINS=1024;
export const MAX_AUDIO_VOLUME=200;
export type AudioSourceType='wav'|'mp3';
export interface AudioAsset{id:string;hash:string;mime:'audio/wav'|'audio/mpeg';/** `data:<mime>;base64,...` of the original file bytes. */data:string;sourceName:string;sourceType:AudioSourceType;durationTicks:number;sampleRate:number;channels:1|2;/** Peak magnitude per bin, integers 0..255, at most PEAK_BINS entries. */peaks:readonly number[];license:'user-provided-unverified'}
export interface AudioInfo{type:AudioSourceType;sampleRate:number;channels:1|2;durationTicks:number}
export interface WavInfo extends AudioInfo{type:'wav';bits:8|16|24|32;float:boolean;dataOffset:number;frames:number;blockAlign:number}
const ascii=(b:Uint8Array,o:number,n:number)=>String.fromCharCode(...b.subarray(o,o+n));
/** Strict RIFF/WAVE reader: PCM 8/16/24/32 bit or 32-bit float, mono or stereo, 8 to 192 kHz, bounded length, no truncated data. */
export function parseWav(bytes:Uint8Array):WavInfo{
 if(bytes.length>MAX_AUDIO_BYTES)throw Error('Audio must be under 2 MB.');
 if(bytes.length<44||ascii(bytes,0,4)!=='RIFF'||ascii(bytes,8,4)!=='WAVE')throw Error('Not a WAV file.');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 let o=12,fmt:{tag:number;channels:number;rate:number;align:number;bits:number}|null=null,data:{offset:number;size:number}|null=null;
 while(o+8<=bytes.length){
  const id=ascii(bytes,o,4),size=v.getUint32(o+4,true),body=o+8;
  if(id==='fmt '){
   if(size<16||body+size>bytes.length)throw Error('Malformed WAV format chunk.');
   let tag=v.getUint16(body,true);
   if(tag===0xfffe){if(size<40)throw Error('Malformed WAV extensible chunk.');tag=v.getUint16(body+24,true);}
   fmt={tag,channels:v.getUint16(body+2,true),rate:v.getUint32(body+4,true),align:v.getUint16(body+12,true),bits:v.getUint16(body+14,true)};
  }else if(id==='data'){
   if(body+size>bytes.length)throw Error('Truncated WAV data.');
   data={offset:body,size};break;
  }
  o=body+size+(size&1);
 }
 if(!fmt)throw Error('WAV has no format chunk.');if(!data)throw Error('WAV has no data chunk.');
 const float=fmt.tag===3;
 if(fmt.tag!==1&&!float)throw Error('Only PCM and float WAV are supported.');
 if(fmt.channels!==1&&fmt.channels!==2)throw Error('Only mono and stereo audio is supported.');
 if(![8,16,24,32].includes(fmt.bits)||(float&&fmt.bits!==32))throw Error('Unsupported WAV bit depth.');
 if(fmt.rate<8000||fmt.rate>192000)throw Error('Sample rate must be 8 to 192 kHz.');
 if(fmt.align!==fmt.channels*fmt.bits/8)throw Error('Inconsistent WAV block size.');
 const frames=Math.floor(data.size/fmt.align);if(frames<1)throw Error('WAV contains no samples.');
 const durationTicks=Math.round(frames*TICKS_PER_SECOND/fmt.rate);
 if(durationTicks>MAX_AUDIO_SECONDS*TICKS_PER_SECOND)throw Error('Audio must be 10 minutes or shorter.');
 return {type:'wav',sampleRate:fmt.rate,channels:fmt.channels as 1|2,durationTicks,bits:fmt.bits as 8|16|24|32,float,dataOffset:data.offset,frames,blockAlign:fmt.align};
}
const MP3_RATES:Record<number,readonly number[]>={3:[44100,48000,32000],2:[22050,24000,16000],0:[11025,12000,8000]};
const MP3_BR_V1=[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320,0];
const MP3_BR_V2=[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160,0];
interface Mp3Frame{sampleRate:number;channels:1|2;bitrate:number;length:number;samplesPerFrame:number}
function mp3Frame(b:Uint8Array,o:number):Mp3Frame|null{
 if(o+4>b.length||b[o]!==0xff||(b[o+1]&0xe0)!==0xe0)return null;
 const version=(b[o+1]>>3)&3,layer=(b[o+1]>>1)&3;if(version===1||layer!==1)return null;
 const br=(b[o+2]>>4)&15,sr=(b[o+2]>>2)&3,pad=(b[o+2]>>1)&1;if(sr===3||br===0||br===15)return null;
 const rate=MP3_RATES[version][sr],bitrate=(version===3?MP3_BR_V1[br]:MP3_BR_V2[br])*1000;
 const spf=version===3?1152:576,length=Math.floor((version===3?144:72)*bitrate/rate)+pad;
 return {sampleRate:rate,channels:((b[o+3]>>6)&3)===3?1:2,bitrate,length,samplesPerFrame:spf};
}
/** MP3 sniff: optional ID3v2 tag, then two consecutive Layer III frames. Duration is estimated from the first frame (CBR) and only used to refuse decoding absurd files. */
export function sniffMp3(bytes:Uint8Array):AudioInfo&{estimatedTicks:number}{
 if(bytes.length>MAX_AUDIO_BYTES)throw Error('Audio must be under 2 MB.');
 let o=0;if(bytes.length>10&&ascii(bytes,0,3)==='ID3'){o=10+(((bytes[6]&127)<<21)|((bytes[7]&127)<<14)|((bytes[8]&127)<<7)|(bytes[9]&127));}
 const limit=Math.min(bytes.length-4,o+65536);
 for(let i=o;i<limit;i++){
  const f=mp3Frame(bytes,i);if(!f)continue;
  const next=mp3Frame(bytes,i+f.length);if(i+f.length+4<=bytes.length&&!next)continue;
  const estimatedTicks=Math.round((bytes.length-i)*8/f.bitrate*TICKS_PER_SECOND);
  if(estimatedTicks>MAX_AUDIO_SECONDS*TICKS_PER_SECOND*1.05)throw Error('Audio must be 10 minutes or shorter.');
  return {type:'mp3',sampleRate:f.sampleRate,channels:f.channels,durationTicks:estimatedTicks,estimatedTicks};
 }
 throw Error('Not a supported MP3 file (MPEG Layer III).');
}
/** Reads sample `i` of channel `c` as -1..1. */
function sampleAt(v:DataView,w:WavInfo,frame:number,c:number):number{
 const o=w.dataOffset+frame*w.blockAlign+c*(w.bits/8);
 if(w.float)return v.getFloat32(o,true);
 if(w.bits===8)return (v.getUint8(o)-128)/128;
 if(w.bits===16)return v.getInt16(o,true)/32768;
 if(w.bits===24){let n=v.getUint8(o)|(v.getUint8(o+1)<<8)|(v.getUint8(o+2)<<16);if(n&0x800000)n|=~0xffffff;return n/8388608;}
 return v.getInt32(o,true)/2147483648;
}
export const peakBinCount=(frames:number)=>Math.max(1,Math.min(PEAK_BINS,frames));
/** Peak magnitude (0..255) of bins [from,to) of a WAV. Splitting the range lets the importer yield to the UI and honour cancellation. */
export function wavPeaks(bytes:Uint8Array,w:WavInfo,from=0,to=peakBinCount(w.frames)):number[]{
 const bins=peakBinCount(w.frames),v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),out:number[]=[];
 for(let b=from;b<Math.min(to,bins);b++){
  const a=Math.floor(b*w.frames/bins),z=Math.max(a+1,Math.floor((b+1)*w.frames/bins));let m=0;
  for(let f=a;f<z;f++)for(let c=0;c<w.channels;c++){const s=Math.abs(sampleAt(v,w,f,c));if(s>m)m=s;}
  out.push(Math.min(255,Math.round(Math.min(1,m)*255)));
 }
 return out;
}
/** Peaks from decoded float channel data (MP3 path). */
export function channelPeaks(channels:readonly Float32Array[],from=0,to?:number):number[]{
 const frames=channels[0]?.length??0,bins=peakBinCount(frames),out:number[]=[];
 for(let b=from;b<Math.min(to??bins,bins);b++){
  const a=Math.floor(b*frames/bins),z=Math.max(a+1,Math.floor((b+1)*frames/bins));let m=0;
  for(const ch of channels)for(let f=a;f<z&&f<frames;f++){const s=Math.abs(ch[f]);if(s>m)m=s;}
  out.push(Math.min(255,Math.round(Math.min(1,m)*255)));
 }
 return out;
}
const B64=/^[A-Za-z0-9+/]+={0,2}$/;
export function bytesToDataUrl(bytes:Uint8Array,mime:string):string{
 let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
 return `data:${mime};base64,${btoa(s)}`;
}
export function dataUrlBytes(data:string,mime:string):Uint8Array{
 const prefix=`data:${mime};base64,`;if(!data.startsWith(prefix))throw Error('Invalid embedded audio.');
 const b64=data.slice(prefix.length);if(!B64.test(b64)||b64.length%4!==0)throw Error('Invalid embedded audio.');
 const s=atob(b64),out=new Uint8Array(s.length);for(let i=0;i<s.length;i++)out[i]=s.charCodeAt(i);return out;
}
const validated=new WeakSet<object>();
/** Structural and byte-level validation of one embedded audio asset. Re-parses the embedded bytes, so metadata cannot lie about them. */
export function validateAudioAsset(a:AudioAsset):void{
 const bad=()=>{throw Error('Invalid embedded audio.');};
 if(!a||typeof a!=='object')bad();if(validated.has(a))return;
 if(typeof a.hash!=='string'||!/^[a-f0-9]{64}$/.test(a.hash)||a.id!==`audio-${a.hash}`||a.license!=='user-provided-unverified')bad();
 if(typeof a.sourceName!=='string'||!a.sourceName.length||a.sourceName.length>256)bad();
 if(!['wav','mp3'].includes(a.sourceType)||a.mime!==(a.sourceType==='wav'?'audio/wav':'audio/mpeg'))bad();
 if(typeof a.data!=='string'||a.data.length>Math.ceil(MAX_AUDIO_BYTES*4/3)+64)bad();
 if(!Number.isInteger(a.durationTicks)||a.durationTicks<1||a.durationTicks>MAX_AUDIO_SECONDS*TICKS_PER_SECOND*1.05)bad();
 if(!Number.isInteger(a.sampleRate)||a.sampleRate<8000||a.sampleRate>192000||(a.channels!==1&&a.channels!==2))bad();
 if(!Array.isArray(a.peaks)||a.peaks.length<1||a.peaks.length>PEAK_BINS||!a.peaks.every(p=>Number.isInteger(p)&&p>=0&&p<=255))bad();
 const bytes=dataUrlBytes(a.data,a.mime);
 if(a.sourceType==='wav'){const w=parseWav(bytes);if(w.sampleRate!==a.sampleRate||w.channels!==a.channels||w.durationTicks!==a.durationTicks||a.peaks.length!==peakBinCount(w.frames))bad();}
 else{const m=sniffMp3(bytes);if(m.sampleRate!==a.sampleRate)bad();}
 validated.add(a);
}
/** Count, aggregate-size and uniqueness limits plus per-asset validation. */
export function validateAudioAssets(assets:readonly AudioAsset[]|undefined):void{
 if(assets===undefined)return;
 if(!Array.isArray(assets)||assets.length>MAX_AUDIO_ASSETS)throw Error('Invalid audio assets.');
 const ids=new Set<string>();let total=0;
 for(const a of assets){validateAudioAsset(a);if(ids.has(a.id))throw Error('Duplicate audio asset.');ids.add(a.id);total+=Math.floor((a.data.length-a.data.indexOf(',')-1)*3/4);}
 if(total>MAX_AUDIO_TOTAL_BYTES)throw Error('Embedded audio exceeds 4 MB in total.');
}
