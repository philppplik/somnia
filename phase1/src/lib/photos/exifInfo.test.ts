import test from 'node:test';
import assert from 'node:assert/strict';
import {readPhotoInfo,photoInfoLines,formatBytes} from './exifInfo.ts';
// Builds a minimal little-endian EXIF TIFF block: entries = [tag, type, value] with type 2=ASCII,3=SHORT,4=LONG,5=RATIONAL.
function tiff(entries:[number,number,(string|number|[number,number])][],exifEntries?:[number,number,(string|number|[number,number])][]):number[]{
 const out:number[]=[0x49,0x49,42,0,8,0,0,0]; // II, magic, IFD0 at 8
 const exifOff=8+2+entries.length*12+4;
 const dataBase=exifOff+(exifEntries?2+exifEntries.length*12+4:0);
 const data:number[]=[];
 const writeIfd=(at:number,list:[number,number,(string|number|[number,number])][])=>{
  out[at]=list.length&255;out[at+1]=(list.length>>8)&255;
  list.forEach(([tag,type,val],i)=>{
   const e=at+2+i*12;
   out[e]=tag&255;out[e+1]=(tag>>8)&255;out[e+2]=type&255;out[e+3]=(type>>8)&255;
   if(typeof val==='string'){
    const bytes=[...val].map(c=>c.charCodeAt(0)).concat(0);
    out[e+4]=bytes.length&255;out[e+5]=(bytes.length>>8)&255;
    if(bytes.length<=4){for(let k=0;k<4;k++)out[e+8+k]=bytes[k]??0;}
    else{const o=dataBase+data.length;out[e+8]=o&255;out[e+9]=(o>>8)&255;out[e+10]=(o>>16)&255;out[e+11]=(o>>24)&255;data.push(...bytes);}
   }else if(type===3){
    out[e+4]=1;out[e+5]=0;out[e+8]=(val as number)&255;out[e+9]=((val as number)>>8)&255;out[e+10]=0;out[e+11]=0;
   }else if(type===4){
    out[e+4]=1;out[e+5]=0;const v=val as number;out[e+8]=v&255;out[e+9]=(v>>8)&255;out[e+10]=(v>>16)&255;out[e+11]=(v>>24)&255;
   }else{ // RATIONAL
    out[e+4]=1;out[e+5]=0;const o=dataBase+data.length;out[e+8]=o&255;out[e+9]=(o>>8)&255;out[e+10]=(o>>16)&255;out[e+11]=(o>>24)&255;
    const[num,den]=val as [number,number];data.push(num&255,(num>>8)&255,(num>>16)&255,(num>>24)&255,den&255,(den>>8)&255,(den>>16)&255,(den>>24)&255);
   }
  });
  const end=at+2+list.length*12;for(let k=0;k<4;k++)out[end+k]=0; // next-IFD pointer
 };
 const total=dataBase;while(out.length<total)out.push(0);
 writeIfd(8,entries);
 if(exifEntries)writeIfd(exifOff,exifEntries);
 return out.concat(data);
}
function jpegWithExif():ArrayBuffer{
 const ifd0:[number,number,(string|number|[number,number])][]=[[0x010f,2,'Canon'],[0x0110,2,'Canon EOS R5'],[0x8769,4,0]];
 const exif:[number,number,(string|number|[number,number])][]=[[0x829a,5,[1,125]],[0x829d,5,[28,10]],[0x8827,3,200],[0x920a,5,[35,1]],[0x9003,2,'2026:10:14 09:30:00'],[0xa405,2,'RF 35mm F1.8']];
 // ExifIFD pointer is known only after layout: IFD0 has 3 entries -> exifOff = 8+2+36+4 = 50
 ifd0[2]=[0x8769,4,50];
 const t=tiff(ifd0,exif);
 const head=[0xff,0xd8,0xff,0xe1];const appLen=t.length+8; // 'Exif\0\0' + tiff, len includes itself
 const app=[(appLen>>8)&255,appLen&255,0x45,0x78,0x69,0x66,0,0];
 const sof=[0xff,0xc0,0,17,8,0,50,0,100,3,1,0x22,0,2,0x11,1,3,0x11,1,0xff,0xda];
 return new Uint8Array([...head,...app,...t,...sof]).buffer;
}
test('exifInfo: reads the daily EXIF set from a JPEG',()=>{
 const info=readPhotoInfo('image/jpeg',jpegWithExif());
 assert.equal(info.width,100);
 assert.equal(info.height,50);
 assert.equal(info.camera,'Canon EOS R5'); // duplicated make prefix collapsed
 assert.equal(info.lens,'RF 35mm F1.8');
 assert.equal(info.exposure,'1/125 s');
 assert.equal(info.aperture,'f/2.8');
 assert.equal(info.iso,200);
 assert.equal(info.focalLength,'35 mm');
 assert.equal(info.dateTime,'2026:10:14 09:30:00');
 const lines=photoInfoLines(info);
 assert.equal(lines[0].value,'100 × 50 px');
 assert.ok(lines.some(l=>l.value.includes('1/125 s · f/2.8 · ISO 200 · 35 mm')));
});
test('exifInfo: PNG falls back to IHDR dimensions, junk stays empty',()=>{
 const png=new Uint8Array(64);
 png.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,13,0x49,0x48,0x44,0x52],0);
 new DataView(png.buffer).setUint32(16,240);new DataView(png.buffer).setUint32(20,150);
 const info=readPhotoInfo('image/png',png.buffer);
 assert.deepEqual(photoInfoLines(info),[{key:'dimensions',value:'240 × 150 px'}]);
 assert.deepEqual(readPhotoInfo('image/jpeg',new Uint8Array([1,2,3]).buffer),{});
 assert.equal(formatBytes(500),'500 B');
 assert.equal(formatBytes(2048),'2 KB');
 assert.equal(formatBytes(3*1024*1024),'3 MB');
});
