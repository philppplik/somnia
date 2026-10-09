import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sniffVideo,VIDEO_FILE} from './format';
import {DEFAULT_RECIPE,exportName,isNeutral,sanitizeRecipe} from './recipe';
import {probeVideo} from './pipeline';
import {closeVideo,exportVideo,getVideoSession,openVideo,resetVideoRecipe,runVideoExport,setVideoEngineFactory,setVideoTrim,updateVideoRecipe} from './session';
import type {VideoEngineLike,VideoResult} from './engine';
import type {VideoProbe,VideoReport} from './protocol';
import {MEDIA_FILE,sniffMedia} from '../media';
const MP4=new URL('../../../tests/assets/clip.mp4',import.meta.url);
const WEBM=new URL('../../../tests/assets/clip.webm',import.meta.url);
const bytes=(u:URL)=>new Uint8Array(readFileSync(u));
const ab=(u:URL)=>{const b=readFileSync(u);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength) as ArrayBuffer;};
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));

test('format sniffing recognises ISO-BMFF and EBML containers and rejects junk',()=>{
 assert.equal(sniffVideo(bytes(MP4))?.ext,'mp4');assert.equal(sniffVideo(bytes(WEBM))?.mime,'video/webm');
 const mk=(brand:string)=>{const b=new Uint8Array(16);b.set([0,0,0,32]);[...'ftyp'+brand].forEach((c,i)=>b[4+i]=c.charCodeAt(0));return b;};
 assert.equal(sniffVideo(mk('qt  '))?.mime,'video/quicktime');assert.equal(sniffVideo(mk('M4V '))?.ext,'m4v');
 const ebml=(doc:string)=>{const b=new Uint8Array(64);b.set([0x1a,0x45,0xdf,0xa3]);[...doc].forEach((c,i)=>b[20+i]=c.charCodeAt(0));return b;};
 assert.equal(sniffVideo(ebml('matroska'))?.ext,'mkv');assert.equal(sniffVideo(new Uint8Array(8)),null);
 assert.equal(sniffVideo(new TextEncoder().encode('hello, not video at all')),null);
 assert.ok(VIDEO_FILE.test('Clip.MP4')&&VIDEO_FILE.test('a.mkv')&&!VIDEO_FILE.test('a.mp3'));
 assert.ok(MEDIA_FILE.test('x.webm')&&MEDIA_FILE.test('x.png'));
 assert.equal(sniffMedia(bytes(MP4))?.kind,'video');assert.equal(sniffMedia(bytes(WEBM))?.kind,'video');
});

test('recipe: trim clamps into the clip, junk becomes webm/auto, names follow the edit',()=>{
 assert.ok(isNeutral(DEFAULT_RECIPE));
 const r=sanitizeRecipe({trim:{start_s:-5,end_s:99},format:'bogus' as never,audio:'x' as never},2);
 assert.deepEqual(r,{trim:{start_s:0,end_s:2},format:'webm',audio:'auto'});
 assert.deepEqual(sanitizeRecipe({trim:{start_s:1,end_s:1.001},format:'mp4',audio:'auto'},2).trim,{start_s:1,end_s:1.05},'shorter than the encodable minimum widens to it');
 assert.ok(!isNeutral({trim:{start_s:0.5,end_s:1.5},format:'webm',audio:'auto'}));
 assert.ok(!isNeutral({trim:null,format:'webm',audio:'mute'}));
 assert.equal(exportName('dir/My Clip.mp4',DEFAULT_RECIPE),'My Clip-copy.webm');
 assert.equal(exportName('a.mov',{trim:{start_s:0.5,end_s:1},format:'mp4',audio:'auto'}),'a-trimmed.mp4');
 assert.equal(exportName('a.mov',{trim:null,format:'webm',audio:'mute'}),'a-edited.webm');
});

test('probe: mediabunny reads container facts without decoding',async()=>{
 const w=await probeVideo(ab(WEBM));
 assert.ok(Math.abs(w.duration-2)<0.2);assert.equal(w.video?.codec,'vp9');
 assert.equal(w.video?.width,320);assert.equal(w.video?.height,180);assert.ok((w.video?.fps??0)>20);
 assert.equal(w.audio?.codec,'opus');assert.ok(w.audio&&w.audio.channels>=1);
 const m=await probeVideo(ab(MP4));
 assert.equal(m.video?.codec,'avc');assert.equal(m.audio?.codec,'aac');
 await assert.rejects(probeVideo(new TextEncoder().encode('not a video').buffer as ArrayBuffer));
});

const PROBE:VideoProbe={duration:2,video:{codec:'vp9',width:320,height:180,fps:25},audio:{codec:'opus',channels:2,rate:48000}};
const REPORT:VideoReport={format:'webm',duration_s:1,bytes:12345,videoCodec:'vp9',audioCodec:'opus',steps:['Trimmed to 0.50-1.50 s']};
function fakeEngine(fail?:string):VideoEngineLike&{exports:number}{
 const state={exports:0};
 return{...state,async probe(){return PROBE;},async capabilities(){return{webmVideo:'vp9',mp4Video:null,opus:true,aac:false};},
  async export(bytes,recipe,onProgress){void bytes;void recipe;state.exports++;this.exports=state.exports;onProgress?.({stage:'encode',ratio:1,processed_s:1});
   if(fail==='cancel'){const e=new Error('Export cancelled');e.name='ExportCancelled';throw e;}
   if(fail)throw new Error(fail);
   return{bytes:new Uint8Array([0x1a,0x45,0xdf,0xa3]).buffer as ArrayBuffer,mime:'video/webm',report:REPORT} satisfies VideoResult;},
  cancelExport(){},dispose(){}};
}
const mediaItem=(bytes:Uint8Array)=>{const url=URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer],{type:'video/webm'}));return{name:'clip.webm',url};};

test('session: opens, probes, edits the recipe, exports, cancels and closes',async()=>{
 const e=fakeEngine();setVideoEngineFactory(()=>e);
 const item=mediaItem(bytes(WEBM));
 await openVideo(item);const s0=getVideoSession('clip.webm')!;
 assert.equal(s0.status,'ready',s0.error);assert.equal(s0.probe?.video?.codec,'vp9');assert.equal(s0.recipe.format,'webm');
 setVideoTrim('clip.webm','start',0.5);setVideoTrim('clip.webm','end',1.5);
 assert.deepEqual(getVideoSession('clip.webm')!.recipe.trim,{start_s:0.5,end_s:1.5});
 updateVideoRecipe('clip.webm',r=>({...r,format:'mp4'}));assert.equal(getVideoSession('clip.webm')!.recipe.format,'mp4');
 assert.equal(await runVideoExport('clip.webm'),'exported');
 const s1=getVideoSession('clip.webm')!;assert.equal(s1.status,'ready',s1.error);assert.ok(s1.result);
 assert.equal(exportVideo('clip.webm')?.fileName,'clip-trimmed.mp4');assert.equal(e.exports,1);
 resetVideoRecipe('clip.webm');assert.ok(isNeutral(getVideoSession('clip.webm')!.recipe));
 closeVideo('clip.webm');assert.equal(getVideoSession('clip.webm'),null);URL.revokeObjectURL(item.url);
});

test('session: cancel returns to ready, engine errors are reported not swallowed',async()=>{
 setVideoEngineFactory(()=>fakeEngine('cancel'));
 const item=mediaItem(bytes(WEBM));await openVideo(item);
 assert.equal(await runVideoExport('clip.webm'),'cancelled');
 assert.equal(getVideoSession('clip.webm')!.status,'ready');assert.equal(getVideoSession('clip.webm')!.result,null);
 closeVideo('clip.webm');URL.revokeObjectURL(item.url);
 setVideoEngineFactory(()=>fakeEngine('demux: unsupported format'));
 const bad=mediaItem(bytes(WEBM));await openVideo(bad);
 assert.equal(await runVideoExport('clip.webm'),'unavailable');
 const s=getVideoSession('clip.webm')!;assert.equal(s.status,'error');assert.match(s.error,/demux/);
 closeVideo('clip.webm');URL.revokeObjectURL(bad.url);
});

test('session: a file that is not video fails with a message instead of hanging',async()=>{
 setVideoEngineFactory(()=>fakeEngine());
 const url=URL.createObjectURL(new Blob([new Uint8Array(64)]));
 await openVideo({name:'broken.webm',url});const s=getVideoSession('broken.webm')!;
 assert.equal(s.status,'error');assert.match(s.error,/not a supported video/);
 closeVideo('broken.webm');URL.revokeObjectURL(url);
 await wait(10);
});
