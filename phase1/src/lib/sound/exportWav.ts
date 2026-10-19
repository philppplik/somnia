import {decodeSessionWav} from './sessionWav';
import type {ExportSchema,ExportValues} from '../export/schema';
/** Sound options for the shared Advanced Export dialog (AE2): bit depth, channels, peak normalisation and WAV INFO tags. */
export type SoundBitDepth='source'|'16'|'24'|'32f';
export interface SoundAdvancedOptions{
 name:string;bitDepth:SoundBitDepth;channels:'keep'|'mono';normalize:boolean;normalizeDb:number;
 metaTitle:string;metaAuthor:string;metaCopyright:string;metaDescription:string;
}
export const SOUND_EXPORT_DEFAULTS:SoundAdvancedOptions={name:'',bitDepth:'source',channels:'keep',normalize:false,normalizeDb:-1,metaTitle:'',metaAuthor:'',metaCopyright:'',metaDescription:''};
export const SOUND_NORMALIZE_RANGE={min:-24,max:0};
export function valuesToSoundOptions(values:ExportValues):SoundAdvancedOptions{
 const d=SOUND_EXPORT_DEFAULTS;const str=(k:string,f:string)=>typeof values[k]==='string'?values[k] as string:f;
 const bd=str('bitDepth',d.bitDepth);const db=typeof values.normalizeDb==='number'&&Number.isFinite(values.normalizeDb)?values.normalizeDb:d.normalizeDb;
 return {name:str('name','').trim(),bitDepth:(['source','16','24','32f'].includes(bd)?bd:d.bitDepth) as SoundBitDepth,channels:str('channels','keep')==='mono'?'mono':'keep',
  normalize:values.normalize===true,normalizeDb:Math.min(SOUND_NORMALIZE_RANGE.max,Math.max(SOUND_NORMALIZE_RANGE.min,db)),
  metaTitle:str('metaTitle',''),metaAuthor:str('metaAuthor',''),metaCopyright:str('metaCopyright',''),metaDescription:str('metaDescription','')};
}
export const soundOptionsToValues=(o:SoundAdvancedOptions):ExportValues=>({...o});
export function soundExportSchema():ExportSchema{
 return {studio:'sound',defaults:soundOptionsToValues(SOUND_EXPORT_DEFAULTS),validate:v=>valuesToSoundOptions(v).name?null:'export.error.name',fields:[
  {id:'name',type:'text',labelKey:'export.name',maxLength:120},
  {id:'bitDepth',type:'select',labelKey:'export.bitDepth',group:'export.group.audio',options:[{value:'source',labelKey:'export.bitDepth.source'},{value:'16',labelKey:'export.bitDepth.16'},{value:'24',labelKey:'export.bitDepth.24'},{value:'32f',labelKey:'export.bitDepth.32f'}]},
  {id:'channels',type:'select',labelKey:'export.channels',group:'export.group.audio',options:[{value:'keep',labelKey:'export.channels.keep'},{value:'mono',labelKey:'export.channels.mono'}]},
  {id:'normalize',type:'checkbox',labelKey:'export.normalize',group:'export.group.audio'},
  {id:'normalizeDb',type:'number',labelKey:'export.normalizeTo',group:'export.group.audio',min:SOUND_NORMALIZE_RANGE.min,max:SOUND_NORMALIZE_RANGE.max,step:0.1,unit:'dB',visibleWhen:v=>v.normalize===true},
  {id:'metaTitle',type:'text',labelKey:'export.meta.title',group:'export.group.metadata',maxLength:512},
  {id:'metaAuthor',type:'text',labelKey:'export.meta.author',group:'export.group.metadata',maxLength:512},
  {id:'metaCopyright',type:'text',labelKey:'export.meta.copyright',group:'export.group.metadata',maxLength:512},
  {id:'metaDescription',type:'text',labelKey:'export.meta.description',group:'export.group.metadata',maxLength:512},
 ]};
}
const INFO=[['metaTitle','INAM'],['metaAuthor','IART'],['metaCopyright','ICOP'],['metaDescription','ICMT']] as const;
/** RIFF LIST/INFO chunk (ASCII-safe: other characters become '?'), or an empty array when no tag is set. */
export function infoChunk(o:Pick<SoundAdvancedOptions,'metaTitle'|'metaAuthor'|'metaCopyright'|'metaDescription'>):Uint8Array{
 const parts:Uint8Array[]=[];
 for(const [key,id] of INFO){
  const text=o[key].replace(/[\r\n]+/g,' ').trim().slice(0,512);if(!text)continue;
  const body=new Uint8Array(text.length+1);for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);body[i]=c>=32&&c<127?c:63;}
  const padded=new Uint8Array(8+body.length+(body.length%2));
  for(let i=0;i<4;i++)padded[i]=id.charCodeAt(i);new DataView(padded.buffer).setUint32(4,body.length,true);padded.set(body,8);parts.push(padded);
 }
 if(!parts.length)return new Uint8Array(0);
 const total=4+parts.reduce((n,p)=>n+p.length,0),out=new Uint8Array(8+total),v=new DataView(out.buffer);
 'LIST'.split('').forEach((c,i)=>{out[i]=c.charCodeAt(0);});v.setUint32(4,total,true);'INFO'.split('').forEach((c,i)=>{out[8+i]=c.charCodeAt(0);});
 let at=12;for(const p of parts){out.set(p,at);at+=p.length;}return out;
}
export interface RenderedSoundExport{wav:ArrayBuffer;peakDb:number|null;frames:number;channels:number;sampleRate:number}
/** Applies the dialog options to the engine's rendered WAV and writes the final file. Pure and deterministic. */
/** Sample format of a PCM WAV: bits per sample and whether it is float. */
export function wavSampleFormat(wav:ArrayBuffer):{bits:number;float:boolean}{
 const v=new DataView(wav);
 for(let at=12;at+8<=wav.byteLength;){const len=v.getUint32(at+4,true);if(String.fromCharCode(...new Uint8Array(wav,at,4))==='fmt '&&len>=16)return {bits:v.getUint16(at+22,true),float:v.getUint16(at+8,true)===3};at+=8+len+(len%2);}
 throw Error('WAV has no format chunk.');
}
/** True when the options would write the engine's WAV unchanged, so the original bytes are saved untouched. */
export const isNeutralSoundExport=(o:SoundAdvancedOptions)=>o.bitDepth==='source'&&o.channels==='keep'&&!o.normalize&&!infoChunk(o).length;
export function renderSoundExport(source:ArrayBuffer,o:SoundAdvancedOptions):RenderedSoundExport{
 const dec=decodeSessionWav('export',source);const src=wavSampleFormat(source);let ch=dec.channels.map(c=>Float32Array.from(c));
 if(o.channels==='mono'&&ch.length===2){const m=new Float32Array(ch[0].length);for(let i=0;i<m.length;i++)m[i]=(ch[0][i]+ch[1][i])/2;ch=[m];}
 let peak=0;for(const c of ch)for(let i=0;i<c.length;i++){const a=Math.abs(c[i]);if(a>peak)peak=a;}
 if(o.normalize&&peak>0){const g=Math.pow(10,o.normalizeDb/20)/peak;for(const c of ch)for(let i=0;i<c.length;i++)c[i]*=g;peak*=g;}
 const frames=ch[0].length,n=ch.length,float=o.bitDepth==='source'?src.float:o.bitDepth==='32f';
 const bytes=o.bitDepth==='source'?src.bits/8:o.bitDepth==='16'?2:o.bitDepth==='24'?3:4;
 const info=infoChunk(o),dataLen=frames*n*bytes,dataPad=dataLen%2;
 const out=new ArrayBuffer(12+24+8+dataLen+dataPad+info.length),v=new DataView(out);
 const text=(at:number,s:string)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};
 text(0,'RIFF');v.setUint32(4,out.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,float?3:1,true);v.setUint16(22,n,true);
 v.setUint32(24,dec.sampleRate,true);v.setUint32(28,dec.sampleRate*n*bytes,true);v.setUint16(32,n*bytes,true);v.setUint16(34,bytes*8,true);text(36,'data');v.setUint32(40,dataLen,true);
 let at=44;
 for(let i=0;i<frames;i++)for(let c=0;c<n;c++){
  const x=Math.max(-1,Math.min(1,ch[c][i]));
  if(float)v.setFloat32(at,ch[c][i],true);
  else if(bytes===2)v.setInt16(at,Math.round(x<0?x*32768:x*32767),true);
  else{const s=Math.round(x<0?x*8388608:x*8388607);v.setUint8(at,s&255);v.setUint8(at+1,(s>>8)&255);v.setUint8(at+2,(s>>16)&255);}
  at+=bytes;
 }
 at+=dataPad;new Uint8Array(out).set(info,at);
 return {wav:out,peakDb:peak>0?20*Math.log10(peak):null,frames,channels:n,sampleRate:dec.sampleRate};
}
export const soundExportFileName=(name:string)=>(name.replace(/\.wav$/i,'').replace(/[\\/:*?"<>|]/g,'_').trim()||'audio')+'.wav';
/** Reads LIST/INFO tags back out of a WAV (test and verification helper). */
export function readWavInfo(wav:ArrayBuffer):Record<string,string>{
 const v=new DataView(wav),out:Record<string,string>={};const tag=(a:number)=>String.fromCharCode(...new Uint8Array(wav,a,4));
 for(let at=12;at+8<=wav.byteLength;){const len=v.getUint32(at+4,true);
  if(tag(at)==='LIST'&&tag(at+8)==='INFO'){for(let p=at+12;p+8<=at+8+len;){const l=v.getUint32(p+4,true);out[tag(p)]=String.fromCharCode(...new Uint8Array(wav,p+8,l)).replace(/\0+$/,'');p+=8+l+(l%2);}}
  at+=8+len+(len%2);}
 return out;
}
