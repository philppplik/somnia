import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sniffVideo,VIDEO_FILE} from './format';
import {exportName} from './recipe';
import {clipRanges,fullClip,isNeutralTimeline,locate,moveClip,rippleDelete,sanitizeClips,setClipEdge,splitAt,timelineDuration,type TimelineClip} from './timeline';
import {probeVideo} from './pipeline';
import {addTimelineClip,closeVideo,deleteTimelineClip,exportVideo,getVideoSession,moveTimelineClip,openVideo,resetTimeline,runVideoExport,setTimelineClipGain,setVideoEngineFactory,setVideoFormat,splitTimelineAt,toggleTimelineClipMute,trimTimelineClip} from './session';
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

test('timeline: ranges, locate and split math stay gap-free',()=>{
 const clips:TimelineClip[]=[{id:'a',source:'a.webm',in_s:0.5,out_s:2,gain:1,muted:false},{id:'b',source:'b.mp4',in_s:1,out_s:2.5,gain:0.8,muted:true}];
 assert.equal(timelineDuration(clips),3);
 assert.deepEqual(clipRanges(clips).map(r=>[r.start,r.end]),[[0,1.5],[1.5,3]]);
 assert.deepEqual(locate(clips,0.75),{range:clipRanges(clips)[0],sourceTime:1.25});
 assert.equal(locate(clips,2)?.range.clip.id,'b');assert.equal(locate(clips,2)?.sourceTime,1.5);
 assert.equal(locate(clips,99)?.sourceTime,2.5,'past the end lands on the last out point');
 const split=splitAt(clips,1)!;
 assert.equal(split.length,3);assert.deepEqual(split.map(c=>[c.in_s,c.out_s]),[[0.5,1.5],[1.5,2],[1,2.5]]);
 assert.ok(split[0].muted===false&&split[1].muted===false&&split[0].gain===1,'parts inherit gain and mute');
 assert.equal(splitAt(clips,0.01),null,'too close to the edge refuses');
 assert.equal(splitAt(clips,99),null);
});

test('timeline: ripple delete, reorder, edge trim and sanitize',()=>{
 const clips:TimelineClip[]=[{id:'a',source:'a',in_s:0,out_s:1,gain:1,muted:false},{id:'b',source:'b',in_s:0,out_s:1,gain:1,muted:false},{id:'c',source:'c',in_s:0,out_s:1,gain:1,muted:false}];
 assert.deepEqual(rippleDelete(clips,'b').map(c=>c.id),['a','c']);
 assert.deepEqual(moveClip(clips,'c',0).map(c=>c.id),['c','a','b']);
 assert.deepEqual(moveClip(clips,'a',99).map(c=>c.id),['b','c','a']);
 const trimmed=setClipEdge(clips,'b','in',0.75);
 assert.deepEqual([trimmed[1].in_s,trimmed[1].out_s],[0.75,1]);
 assert.deepEqual(setClipEdge(clips,'b','in',0.999)[1].in_s,0.95,'in never crosses out minus the minimum');
 assert.deepEqual(setClipEdge(clips,'b','out',0.01)[1].out_s,0.05,'out clamps to in plus the minimum');
 const dirty:TimelineClip[]=[{id:'x',source:'s',in_s:-2,out_s:99,gain:9,muted:false},{id:'y',source:'s',in_s:1,out_s:1.001,gain:1,muted:false},{id:'z',source:'gone',in_s:0,out_s:1,gain:1,muted:false}];
 const clean=sanitizeClips(dirty,{s:2});
 assert.equal(clean.length,2,'degenerate clip drops, missing source keeps its clip');
 assert.deepEqual([clean[0].in_s,clean[0].out_s,clean[0].gain],[0,2,2]);
 assert.equal(clean[1].source,'gone');
 assert.ok(isNeutralTimeline([fullClip('a.webm',2)],'a.webm',2));
 assert.ok(!isNeutralTimeline([{...fullClip('a.webm',2),muted:true}],'a.webm',2));
});

test('recipe: download names follow the edit',()=>{
 assert.equal(exportName('dir/My Clip.mp4',false,'webm'),'My Clip-copy.webm');
 assert.equal(exportName('a.mov',true,'mp4'),'a-edited.mp4');
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
const REPORT:VideoReport={format:'webm',duration_s:3,bytes:12345,videoCodec:'vp9',audioCodec:'opus',steps:['2 clips joined.']};
function fakeEngine(fail?:string):VideoEngineLike&{exports:number;last:{sources:string[],clips:TimelineClip[]}|null}{
 const state={exports:0,last:null as {sources:string[],clips:TimelineClip[]}|null};
 return{...state,get exports(){return state.exports;},get last(){return state.last;},async probe(){return PROBE;},async capabilities(){return{webmVideo:'vp9',mp4Video:null,opus:true,aac:false};},
  async export(sources,clips,format,onProgress){state.exports++;state.last={sources:Object.keys(sources).sort(),clips:clips.map(c=>({...c}))};void format;onProgress?.({stage:'encode',ratio:1,processed_s:3});
   if(fail==='cancel'){const e=new Error('Export cancelled');e.name='ExportCancelled';throw e;}
   if(fail)throw new Error(fail);
   return{bytes:new Uint8Array([0x1a,0x45,0xdf,0xa3]).buffer as ArrayBuffer,mime:'video/webm',report:REPORT} satisfies VideoResult;},
  cancelExport(){},dispose(){}};
}
const mediaItem=(name:string,bytes:Uint8Array)=>{const url=URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer],{type:'video/webm'}));return{name,url};};

test('session: opens, builds a multi-clip timeline, edits and exports it',async()=>{
 const e=fakeEngine();setVideoEngineFactory(()=>e);
 const a=mediaItem('a.webm',bytes(WEBM)),b=mediaItem('b.webm',bytes(WEBM));
 await openVideo(a);
 const s0=getVideoSession('a.webm')!;
 assert.equal(s0.status,'ready',s0.error);assert.equal(s0.clips.length,1);assert.deepEqual([s0.clips[0].in_s,s0.clips[0].out_s],[0,2]);
 await addTimelineClip('a.webm',b);
 const s1=getVideoSession('a.webm')!;
 assert.equal(s1.clips.length,2);assert.equal(s1.clips[1].source,'b.webm');assert.equal(s1.selectedClipId,s1.clips[1].id);
 assert.equal(timelineDuration(getVideoSession('a.webm')!.clips),4);
 trimTimelineClip('a.webm',s1.clips[0].id,'in',0.5);
 assert.equal(getVideoSession('a.webm')!.clips[0].in_s,0.5);
 splitTimelineAt('a.webm',1);
 const s2=getVideoSession('a.webm')!;
 assert.equal(s2.clips.length,3,'split adds a part');
 assert.deepEqual(s2.clips.map(c=>[c.in_s,c.out_s]),[[0.5,1.5],[1.5,2],[0,2]]);
 moveTimelineClip('a.webm',s2.clips[2].id,-1);
 assert.equal(getVideoSession('a.webm')!.clips[1].source,'b.webm');
 setTimelineClipGain('a.webm',s2.clips[0].id,1.5);
 assert.equal(getVideoSession('a.webm')!.clips[0].gain,1.5);
 toggleTimelineClipMute('a.webm',s2.clips[0].id);
 assert.ok(getVideoSession('a.webm')!.clips[0].muted);
 setVideoFormat('a.webm','mp4');
 assert.equal(await runVideoExport('a.webm'),'exported');
 const s3=getVideoSession('a.webm')!;
 assert.equal(s3.status,'ready',s3.error);assert.ok(s3.result);
 assert.deepEqual(e.last?.sources,['a.webm','b.webm'],'export hands every used source to the worker');
 assert.equal(e.last?.clips.length,3);
 assert.equal(exportVideo('a.webm')?.fileName,'a-edited.mp4');
 deleteTimelineClip('a.webm',getVideoSession('a.webm')!.clips[0].id);
 assert.equal(getVideoSession('a.webm')!.clips.length,2);
 resetTimeline('a.webm');
 const s4=getVideoSession('a.webm')!;
 assert.equal(s4.clips.length,1);assert.ok(isNeutralTimeline(s4.clips,'a.webm',2));
 closeVideo('a.webm');closeVideo('b.webm');
 assert.equal(getVideoSession('a.webm'),null);
 URL.revokeObjectURL(a.url);URL.revokeObjectURL(b.url);
});

test('session: cancel returns to ready, engine errors are reported not swallowed',async()=>{
 setVideoEngineFactory(()=>fakeEngine('cancel'));
 const item=mediaItem('clip.webm',bytes(WEBM));await openVideo(item);
 assert.equal(await runVideoExport('clip.webm'),'cancelled');
 assert.equal(getVideoSession('clip.webm')!.status,'ready');assert.equal(getVideoSession('clip.webm')!.result,null);
 closeVideo('clip.webm');URL.revokeObjectURL(item.url);
 setVideoEngineFactory(()=>fakeEngine('demux: unsupported format'));
 const bad=mediaItem('clip.webm',bytes(WEBM));await openVideo(bad);
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
