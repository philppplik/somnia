import {test} from 'node:test';import assert from 'node:assert/strict';
import {buildZip,crc32} from './stemZip';

const enc=new TextEncoder(),dec=new TextDecoder();
function readZip(zip:Uint8Array){const v=new DataView(zip.buffer,zip.byteOffset,zip.length);
 assert.equal(v.getUint32(zip.length-22,true),0x06054b50,'EOCD signature at the tail');
 const count=v.getUint16(zip.length-12,true),cdSize=v.getUint32(zip.length-10,true),cdOffset=v.getUint32(zip.length-6,true);
 assert.equal(cdOffset+cdSize,zip.length-22,'central directory sits right before the EOCD');
 const out:{name:string;bytes:Uint8Array;crc:number}[]=[];let at=0;
 for(let i=0;i<count;i++){assert.equal(v.getUint32(at,true),0x04034b50,`local header ${i}`);
  const crc=v.getUint32(at+14,true),size=v.getUint32(at+18,true),nl=v.getUint16(at+26,true),el=v.getUint16(at+28,true);
  const name=dec.decode(zip.subarray(at+30,at+30+nl));const bytes=zip.subarray(at+30+nl+el,at+30+nl+el+size);
  out.push({name,bytes,crc});at+=30+nl+el+size;}
 assert.equal(at,cdOffset,'local records end where the central directory starts');
 return out;}

test('crc32 matches the known check values',()=>{
 assert.equal(crc32(enc.encode('123456789')),0xCBF43926);
 assert.equal(crc32(new Uint8Array(0)),0);
});

test('buildZip round-trips names, bytes and CRCs through a strict reader',()=>{
 const a=enc.encode('wav-one'),b=enc.encode('wav-two-larger');
 const entries=readZip(buildZip([{name:'Voice.wav',bytes:a},{name:'Pads-2.wav',bytes:b}]));
 assert.deepEqual(entries.map(e=>e.name),['Voice.wav','Pads-2.wav']);
 assert.deepEqual([...entries[0].bytes],[...a]);
 assert.deepEqual([...entries[1].bytes],[...b]);
 assert.equal(entries[0].crc,crc32(a));
 assert.equal(entries[1].crc,crc32(b));
});

test('buildZip rejects empty input and empty names',()=>{
 assert.throws(()=>buildZip([]),/Nothing to zip/);
 assert.throws(()=>buildZip([{name:'',bytes:new Uint8Array(1)}]),/Invalid zip entry/);
});
