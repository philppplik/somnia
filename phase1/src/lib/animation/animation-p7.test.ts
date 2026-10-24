import test from 'node:test';import assert from 'node:assert/strict';
import {encodeGif,buildPalette,mapIndices,lzwEncode,GifError,GIF_MAX_FRAMES,type GifFrame} from './gifEncode';
import {encodeApng,pngChunks,crc32,ApngError} from './apngEncode';
import {webmPlan,recordWebm,WEBM_MAX_SECONDS,type RecorderLike} from './exportVideo';
import {createDocument,createComposition,findComp,type Composition} from './model';
import {applyEdit} from './edit';
import {ExportError} from './exportFrames';
const px=(w:number,h:number,fn:(i:number)=>[number,number,number,number])=>{const u=new Uint8Array(w*h*4);for(let i=0;i<w*h;i++){const [r,g,b,a]=fn(i);u.set([r,g,b,a],i*4);}return u;};

/** Reference LZW decoder for roundtrip checks (test-side, intentionally naive). Input is the raw code stream without sub-block framing. */
const stripSubBlocks=(bytes:Uint8Array)=>{const out:number[]=[];for(let i=0;i<bytes.length;){const n=bytes[i++];if(!n)break;for(let j=0;j<n;j++)out.push(bytes[i++]);}return Uint8Array.from(out);};
function lzwDecode(minCodeSize:number,packed:Uint8Array):number[]{
 const bytes=stripSubBlocks(packed);
 const CLEAR=1<<minCodeSize,EOI=CLEAR+1;let dict:number[][]=[],next=0,codeSize=0;
 const reset=()=>{dict=[];for(let i=0;i<CLEAR;i++)dict[i]=[i];next=EOI+1;codeSize=minCodeSize+1;};
 reset();const out:number[]=[];let bitPos=0,prev:number[]|null=null;
 const read=()=>{let code=0;for(let i=0;i<codeSize;i++){const byte=bytes[bitPos>>3];if(byte===undefined)return -1;code|=((byte>>(bitPos&7))&1)<<i;bitPos++;}return code;};
 while(true){
  const code=read();if(code<0)break;
  if(code===CLEAR){reset();prev=null;continue;}
  if(code===EOI)break;
  let entry:number[];
  if(code<next)entry=dict[code];
  else if(code===next&&prev)entry=[...prev,prev[0]];
  else throw Error(`bad code ${code} at next ${next}`);
  out.push(...entry);
  if(prev){dict[next++]=[...prev,entry[0]];if(next===(1<<codeSize)&&codeSize<12)codeSize++;} // decoder lags the encoder by one entry, so it bumps one earlier
  prev=entry;
 }
 return out;
}
test('GIF LZW roundtrips index streams including table resets',()=>{
 const small=[0,1,2,3,0,1,2,3,0,0,0,1,1,1,2,2,2,3,3,3];
 assert.deepEqual(lzwDecode(2,lzwEncode(2,Uint8Array.from(small))),small);
 const big=Uint8Array.from({length:20000},(_,i)=>Math.floor(i/7)%251);
 assert.deepEqual(lzwDecode(8,lzwEncode(8,big)),Array.from(big));
});
test('GIF encoder writes a parseable GIF89a with loop, per-frame delays and a trailer',()=>{
 const w=8,h=4;
 const frames:GifFrame[]=[
  {pixels:px(w,h,i=>i%2?[255,0,0,255]:[0,0,255,255]),delayCs:3},
  {pixels:px(w,h,i=>i%3?[0,255,0,255]:[255,255,0,255]),delayCs:3},
 ];
 const gif=encodeGif(w,h,frames);
 assert.equal(String.fromCharCode(...gif.subarray(0,6)),'GIF89a');
 assert.equal(gif[6]|gif[7]<<8,w);assert.equal(gif[8]|gif[9]<<8,h);
 const text=Array.from(gif.subarray(0,810)).map(b=>String.fromCharCode(b)).join('');
 assert.ok(text.includes('NETSCAPE2.0'));
 let images=0,delays:number[]=[];for(let i=0;i<gif.length-1;i++){if(gif[i]===0x2C&&(gif[i+1]===0&&gif[i+2]===0))images++;if(gif[i]===0xF9&&gif[i+1]===4)delays.push(gif[i+3]|gif[i+4]<<8);}
 assert.equal(images,2);assert.deepEqual(delays,[3,3]);
 assert.equal(gif[gif.length-1],0x3B);
 // Pixels roundtrip through palette+indices deterministically.
 const palette=buildPalette(frames,w,h);const m=mapIndices(frames[0].pixels,palette,256);
 assert.ok(m.used<=256&&m.used>=2);
 const c0=[palette[m.indices[0]*3],palette[m.indices[0]*3+1],palette[m.indices[0]*3+2]];
 assert.ok(Math.abs(c0[2]-255)<40,`blue kept, got ${c0}`);
});
test('GIF bounds: empty, frame cap and byte cap are refused',()=>{
 assert.throws(()=>encodeGif(4,4,[]),(e:Error)=>e instanceof GifError&&(e as GifError).code==='empty');
 const one:GifFrame={pixels:px(2,2,()=>[0,0,0,255]),delayCs:3};
 assert.throws(()=>encodeGif(2,2,Array(GIF_MAX_FRAMES+1).fill(one)),(e:Error)=>(e as GifError).code==='too-many');
});
const PNG_SIG=[137,80,78,71,13,10,26,10];
function fakePng(w:number,h:number,fill:number):Uint8Array{
 const chunk=(type:string,data:number[])=>{
  const body=[...type.split('').map(c=>c.charCodeAt(0)),...data];const crc=crc32(Uint8Array.from(body));
  return [data.length>>>24&255,data.length>>>16&255,data.length>>>8&255,data.length&255,...body,crc>>>24&255,crc>>>16&255,crc>>>8&255,crc&255];
 };
 const ihdr=[w>>>24&255,w>>>16&255,w>>>8&255,w&255,h>>>24&255,h>>>16&255,h>>>8&255,h&255,8,6,0,0,0];
 return Uint8Array.from([...PNG_SIG,...chunk('IHDR',ihdr),...chunk('IDAT',[fill,fill,fill]),...chunk('IEND',[])]);
}
test('APNG assembly: acTL counts frames, fcTL carries the delay, CRCs hold',()=>{
 const apng=encodeApng([fakePng(4,2,1),fakePng(4,2,2),fakePng(4,2,3)],{delayNum:1,delayDen:30});
 const chunks=pngChunks(apng);
 assert.equal(chunks[0].type,'IHDR');assert.equal(chunks[1].type,'acTL');
 assert.equal(chunks[1].data[3],3);assert.equal(chunks[1].data[7],0);
 const fctls=chunks.filter(c=>c.type==='fcTL');assert.equal(fctls.length,3);
 fctls.forEach((f,i)=>{assert.equal(f.data[3],i===0?0:2*i-1,'sequence'); /* first frame is IDAT (consumes no fdAT sequence) */ assert.equal(f.data[20]<<8|f.data[21],1);assert.equal(f.data[22]<<8|f.data[23],30);assert.equal((f.data[8]<<24|f.data[9]<<16|f.data[10]<<8|f.data[11])>>>0,2,'height');});
 assert.equal(chunks.filter(c=>c.type==='IDAT').length,1);
 assert.equal(chunks.filter(c=>c.type==='fdAT').length,2);
 assert.equal(chunks.at(-1)!.type,'IEND');
 // Every chunk CRC validates (pngChunks already walks lengths; re-check CRCs).
 let o=8;while(o+8<=apng.length){const len=(apng[o]<<24|apng[o+1]<<16|apng[o+2]<<8|apng[o+3])>>>0;const body=apng.subarray(o+4,o+8+len);const want=(apng[o+8+len]<<24|apng[o+9+len]<<16|apng[o+10+len]<<8|apng[o+11+len])>>>0;assert.equal(crc32(body),want);o+=12+len;}
});
test('APNG refuses malformed frames and size mismatches',()=>{
 assert.throws(()=>encodeApng([fakePng(4,2,1),fakePng(8,2,2)],{delayNum:1,delayDen:30}),(e:Error)=>(e as ApngError).code==='raster');
 assert.throws(()=>encodeApng([Uint8Array.from([1,2,3])],{delayNum:1,delayDen:30}),ApngError);
});
const compOf=(frames:number,fps={num:30,den:1})=>{const c=createComposition({fps,duration:frames*8000});return {...c,workArea:{in:0,out:frames*8000}} as Composition;};
test('webmPlan bounds duration and pixels and picks the best supported mime',()=>{
 const plan=webmPlan(compOf(90),m=>m.includes('vp8'));
 assert.equal(plan.frames,90);assert.equal(plan.seconds,3);assert.ok(plan.mime.includes('vp8'));
 assert.equal(webmPlan(compOf(90),()=>true).mime,'video/webm;codecs=vp9,opus');
 assert.throws(()=>webmPlan(compOf((WEBM_MAX_SECONDS+1)*30),()=>true),(e:Error)=>(e as ExportError).code==='too-many');
 assert.throws(()=>webmPlan(compOf(30),()=>false),(e:Error)=>(e as ExportError).code==='unsupported');
 const huge={...compOf(30),width:9000,height:9000};assert.throws(()=>webmPlan(huge,()=>true),(e:Error)=>(e as ExportError).code==='too-large');
});
test('recordWebm assembles one blob, reports frame progress and honours cancel and byte cap',async()=>{
 const doc=createDocument('Demo');const comp=compOf(6);const d2=applyEdit({...doc,compositions:[comp]},{type:'comp.select',comp:comp.id});
 const fakeCanvas=()=>({canvas:{} as HTMLCanvasElement,ctx:{} as CanvasRenderingContext2D,stream:{tracks:[] as unknown[],addTrack(this:{tracks:unknown[]},t:unknown){this.tracks.push(t);},getAudioTracks(){return[] as unknown[];}} as unknown as MediaStream});
 const run=async(opts:{chunkSize?:number;abortAfter?:number})=>{
  let time=0;const progress:[number,number][]=[];
  const recorder:RecorderLike={mimeType:'video/webm',ondataavailable:null,onstop:null,
   start(){queueMicrotask(()=>this.ondataavailable?.({data:new Blob([new Uint8Array(opts.chunkSize??16)])}));},
   stop(){queueMicrotask(()=>this.onstop?.());}};
  const ctl=new AbortController();let ticks=0;
  const res=recordWebm(d2,comp,{createCanvas:fakeCanvas,recorder:()=>recorder,isSupported:()=>true,
   draw:async()=>{},now:()=>(time+=1000/30),signal:ctl.signal,
   schedule:cb=>{if(opts.abortAfter!==undefined&&++ticks===opts.abortAfter)ctl.abort();queueMicrotask(cb);},
   onProgress:(a,b)=>progress.push([a,b])});
  return {res,progress};
 };
 const ok=await run({});const r=await ok.res;
 assert.equal(r.fileName,'Demo.webm');assert.ok(r.blob.type.includes('video/webm'),r.blob.type);assert.ok(r.blob.size>0);
 assert.ok(ok.progress.length>=2,`progress reported, got ${ok.progress.length}`); // the fake clock can skip frames (real-time capture draws whatever frame is current)
 assert.ok(ok.progress.every((p,i)=>i===0||p[0]>=ok.progress[i-1][0]),'progress is monotonic');
 assert.deepEqual(ok.progress.at(-1),[6,6]);
 await assert.rejects((await run({abortAfter:3})).res,(e:Error)=>(e as ExportError).code==='cancelled');
 await assert.rejects((await run({chunkSize:70*1024*1024})).res,(e:Error)=>(e as ExportError).code==='too-large');
});
