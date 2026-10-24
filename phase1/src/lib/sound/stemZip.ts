/** Minimal stored (uncompressed) ZIP writer so stem export ships as one file. No dependencies: local headers, central directory, EOCD, CRC-32. Fixed DOS date (1980-01-01) keeps output deterministic. */
const table=new Uint32Array(256);
for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;table[n]=c;}
export function crc32(bytes:Uint8Array):number{let c=0xFFFFFFFF;for(let i=0;i<bytes.length;i++)c=table[(c^bytes[i])&0xFF]^(c>>>8);return(c^0xFFFFFFFF)>>>0;}
export interface ZipEntry{name:string;bytes:Uint8Array}
export function buildZip(entries:ZipEntry[]):Uint8Array{
 if(!entries.length)throw Error('Nothing to zip');
 const enc=new TextEncoder(),parts:Uint8Array[]=[],central:Uint8Array[]=[];let offset=0;
 for(const e of entries){
  const name=enc.encode(e.name);if(!name.length||name.length>65535)throw Error('Invalid zip entry');
  const crc=crc32(e.bytes),size=e.bytes.length;
  const local=new Uint8Array(30+name.length),lv=new DataView(local.buffer);
  lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x0800,true);lv.setUint16(8,0,true);lv.setUint16(10,0,true);lv.setUint16(12,0x21,true);
  lv.setUint32(14,crc,true);lv.setUint32(18,size,true);lv.setUint32(22,size,true);lv.setUint16(26,name.length,true);lv.setUint16(28,0,true);local.set(name,30);
  const cent=new Uint8Array(46+name.length),cv=new DataView(cent.buffer);
  cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x0800,true);cv.setUint16(10,0,true);cv.setUint16(12,0,true);cv.setUint16(14,0x21,true);
  cv.setUint32(16,crc,true);cv.setUint32(20,size,true);cv.setUint32(24,size,true);cv.setUint16(28,name.length,true);cv.setUint32(42,offset,true);cent.set(name,46);
  parts.push(local,e.bytes);central.push(cent);offset+=local.length+size;
 }
 const cdSize=central.reduce((n,p)=>n+p.length,0);
 const eocd=new Uint8Array(22),ev=new DataView(eocd.buffer);
 ev.setUint32(0,0x06054b50,true);ev.setUint16(8,entries.length,true);ev.setUint16(10,entries.length,true);ev.setUint32(12,cdSize,true);ev.setUint32(16,offset,true);
 const out=new Uint8Array(offset+cdSize+22);let at=0;for(const p of [...parts,...central,eocd]){out.set(p,at);at+=p.length;}
 return out;
}
