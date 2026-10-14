/** Dependency-free export metadata injection: PNG tEXt chunks and JPEG COM segments, with round-trip readers. */
export interface ExportMetadata{title:string;author:string;copyright:string;description:string}
export const EMPTY_EXPORT_METADATA:ExportMetadata={title:'',author:'',copyright:'',description:''};
const MAX_FIELD=512,MAX_TOTAL=8192;
const FIELDS=[['title','Title'],['author','Author'],['copyright','Copyright'],['description','Description']] as const;
function clean(meta:ExportMetadata):[string,string][]{
 const out:[string,string][]=[];
 let total=0;
 for(const [key,keyword] of FIELDS){
  const value=(meta[key]??'').replace(/[\r\n]+/g,' ').trim().slice(0,MAX_FIELD);
  if(!value)continue;
  total+=value.length+keyword.length;
  if(total>MAX_TOTAL)break;
  out.push([keyword,value]);
 }
 return out;
}
export function hasExportMetadata(meta:ExportMetadata):boolean{return clean(meta).length>0;}
const CRC_TABLE=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(bytes:Uint8Array):number{let c=0xffffffff;for(const b of bytes)c=CRC_TABLE[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
/** Inserts tEXt chunks (Latin-1 per spec, others transliterated to '?') before IEND. Non-PNG input is rejected. */
export function injectPngMetadata(bytes:Uint8Array,meta:ExportMetadata):Uint8Array{
 const pairs=clean(meta);if(!pairs.length)return bytes;
 if(bytes.length<8||bytes[0]!==0x89||bytes[1]!==0x50||bytes[2]!==0x4e||bytes[3]!==0x47)throw Error('Not a PNG file.');
 let iend=-1;
 for(let i=8;i+8<=bytes.length;){const len=(bytes[i]<<24|bytes[i+1]<<16|bytes[i+2]<<8|bytes[i+3])>>>0;if(bytes[i+4]===0x49&&bytes[i+5]===0x45&&bytes[i+6]===0x4e&&bytes[i+7]===0x44){iend=i;break;}i+=12+len;}
 if(iend<0)throw Error('PNG has no IEND chunk.');
 const chunks:Uint8Array[]=[];
 for(const [keyword,value] of pairs){
  const body=new Uint8Array(keyword.length+1+value.length);
  for(let i=0;i<keyword.length;i++)body[i]=keyword.charCodeAt(i)&0x7f;
  body[keyword.length]=0;
  for(let i=0;i<value.length;i++){const code=value.charCodeAt(i);body[keyword.length+1+i]=code<256?code:0x3f;}
  const chunk=new Uint8Array(12+body.length);const view=new DataView(chunk.buffer);
  view.setUint32(0,body.length);chunk.set([0x74,0x45,0x58,0x74],4);chunk.set(body,8);view.setUint32(8+body.length,crc32(chunk.subarray(4,8+body.length)));
  chunks.push(chunk);
 }
 const total=bytes.length+chunks.reduce((n,c)=>n+c.length,0);
 const out=new Uint8Array(total);out.set(bytes.subarray(0,iend),0);
 let at=iend;for(const chunk of chunks){out.set(chunk,at);at+=chunk.length;}
 out.set(bytes.subarray(iend),at);
 return out;
}
/** Reads back the tEXt chunks written by injectPngMetadata. */
export function readPngMetadata(bytes:Uint8Array):Partial<ExportMetadata>{
 const out:Partial<ExportMetadata>={};
 if(bytes.length<8||bytes[0]!==0x89)return out;
 for(let i=8;i+8<=bytes.length;){
  const len=(bytes[i]<<24|bytes[i+1]<<16|bytes[i+2]<<8|bytes[i+3])>>>0;
  if(len>bytes.length)break;
  if(bytes[i+4]===0x74&&bytes[i+5]===0x45&&bytes[i+6]===0x58&&bytes[i+7]===0x74){
   const body=bytes.subarray(i+8,i+8+len);const nul=body.indexOf(0);
   if(nul>0){const keyword=String.fromCharCode(...body.subarray(0,nul));const value=String.fromCharCode(...body.subarray(nul+1));
    const field=FIELDS.find(([,k])=>k===keyword);if(field)out[field[0]]=value;}
  }
  i+=12+len;
 }
 return out;
}
/** Inserts one COM segment per field after the SOI/APPn run. Non-JPEG input is rejected; values are flattened to Latin-1. */
export function injectJpegMetadata(bytes:Uint8Array,meta:ExportMetadata):Uint8Array{
 const pairs=clean(meta);if(!pairs.length)return bytes;
 if(bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8)throw Error('Not a JPEG file.');
 let at=2;
 while(at+4<=bytes.length&&bytes[at]===0xff&&bytes[at+1]!==0xda&&bytes[at+1]!==0xd8&&bytes[at+1]!==0x01&&!(bytes[at+1]>=0xd0&&bytes[at+1]<=0xd7)){
  const len=(bytes[at+2]<<8|bytes[at+3]);if(len<2||at+2+len>bytes.length)break;at+=2+len;
 }
 const segments:Uint8Array[]=[];
 for(const [keyword,value] of pairs){
  const text=`${keyword}: ${value}`;if(text.length>65000)continue;
  const body=new Uint8Array(text.length);
  for(let i=0;i<text.length;i++){const code=text.charCodeAt(i);body[i]=code<256?code:0x3f;}
  const seg=new Uint8Array(4+body.length);seg[0]=0xff;seg[1]=0xfe;seg[2]=(body.length+2)>>8;seg[3]=(body.length+2)&255;seg.set(body,4);
  segments.push(seg);
 }
 const out=new Uint8Array(bytes.length+segments.reduce((n,s)=>n+s.length,0));
 out.set(bytes.subarray(0,at),0);let p=at;for(const seg of segments){out.set(seg,p);p+=seg.length;}
 out.set(bytes.subarray(at),p);
 return out;
}
/** Reads back the COM segments written by injectJpegMetadata. */
export function readJpegMetadata(bytes:Uint8Array):Partial<ExportMetadata>{
 const out:Partial<ExportMetadata>={};
 if(bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8)return out;
 let at=2;
 while(at+4<=bytes.length&&bytes[at]===0xff){
  const marker=bytes[at+1];if(marker===0xda)break;
  const len=(bytes[at+2]<<8|bytes[at+3]);if(len<2||at+2+len>bytes.length)break;
  if(marker===0xfe){const text=String.fromCharCode(...bytes.subarray(at+4,at+2+len));const colon=text.indexOf(': ');
   if(colon>0){const field=FIELDS.find(([,k])=>k===text.slice(0,colon));if(field)out[field[0]]=text.slice(colon+2);}}
  at+=2+len;
 }
 return out;
}
