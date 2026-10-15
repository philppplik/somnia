import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sniffVideo,VIDEO_FILE} from './format';
import {exportName} from './recipe';
import {clipFadeGain,clipRanges,fadeInOf,fadeOutOf,flipOf,fullClip,isNeutralTimeline,locate,moveClip,rippleDelete,sanitizeClips,setClipEdge,setClipFades,sliceTimeline,splitAt,timelineDuration,type TimelineClip} from './timeline';
import {probeVideo} from './pipeline';
import {addTimelineClip,closeVideo,deleteTimelineClip,exportVideo,getVideoSession,moveTimelineClip,openVideo,resetTimeline,runVideoExport,setTimelineClipGain,setVideoEngineFactory,setVideoFormat,splitTimelineAt,toggleTimelineClipMute,trimTimelineClip} from './session';
import type {VideoEngineLike,VideoResult} from './engine';
import type {VideoProbe,VideoReport} from './protocol';
import {MEDIA_FILE,sniffMedia,addBlankVideoProject,addMediaFile,getMedia,closeMedia} from '../media';
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


test('blank Video starts with zero clips and no decoder, accepts clips, exports and resets to empty',async()=>{
 const fake=fakeEngine();let probes=0;const oldProbe=fake.probe;fake.probe=async b=>{probes++;return oldProbe(b);};setVideoEngineFactory(()=>fake);
 const name='Blank.video-project';addBlankVideoProject(name);const item=getMedia().items.find(i=>i.name===name)!;
 await openVideo(item);assert.equal(probes,0);assert.equal(getVideoSession(name)?.status,'ready');assert.deepEqual(getVideoSession(name)?.clips,[]);
 assert.equal(await runVideoExport(name),'unavailable');assert.equal(fake.exports,0);
 const added=await addMediaFile(new Blob([bytes(WEBM).buffer as ArrayBuffer]),'blank-source.webm');assert.ok('name' in added);
 const source=getMedia().items.find(i=>i.name==='blank-source.webm')!;await addTimelineClip(name,source);
 assert.equal(probes,1);assert.equal(getVideoSession(name)?.clips.length,1);assert.ok(getVideoSession(name)?.capabilities?.webmVideo);
 assert.equal(await runVideoExport(name),'exported');assert.deepEqual(fake.last?.sources,['blank-source.webm']);
 deleteTimelineClip(name,getVideoSession(name)!.clips[0].id);assert.equal(getVideoSession(name)?.clips.length,0,'last clip can be deleted from a blank project');
 await addTimelineClip(name,source);resetTimeline(name);assert.deepEqual(getVideoSession(name)?.clips,[],'reset never invents a source clip for the project');
 closeMedia(name);closeMedia(source.name);assert.equal(getVideoSession(name),null);
});

test('image clips: sanitize fixes the shape, split halves the duration, edges and speed stay off',()=>{
 const img:TimelineClip={id:'i',source:'photo.png',in_s:2,out_s:90_000,gain:0.3,muted:true,speed:2,kind:'image'};
 const clean=sanitizeClips([img],{});
 assert.deepEqual(clean,[{id:'i',source:'photo.png',in_s:0,out_s:3600,gain:1,muted:false,speed:2,kind:'image'}] as TimelineClip[],'sanitized (clamped)');
 const stills:TimelineClip[]=[{id:'a',source:'a.png',in_s:0,out_s:10,gain:1,muted:false,kind:'image',crossfade_s:1}];
 const split=splitAt(stills,4)!;
 assert.deepEqual(split.map(c=>[c.in_s,c.out_s,c.kind,c.crossfade_s]),[[0,4,'image',0],[0,6,'image',1]],'both halves keep in 0; the crossfade moves to the second half');
 assert.equal(splitAt([{id:'b',source:'b.png',in_s:0,out_s:0.08,gain:1,muted:false,kind:'image'}],0.05),null,'too-short halves refuse');
 const after=setClipEdge(stills,'a','in',3);
 assert.deepEqual(after,stills,'image clips keep in 0 (duration changes go through setImageClipLength)');
});

test('range export slicing: media windows shift, stills shrink, cut fades die, interior fades survive',()=>{
 const a:TimelineClip={id:'a',source:'a.mp4',in_s:10,out_s:20,gain:1,muted:false,crossfade_s:1};
 const b:TimelineClip={id:'b',source:'b.png',in_s:0,out_s:6,gain:1,muted:false,kind:'image'};
 const c2:TimelineClip={id:'c',source:'c.mp4',in_s:0,out_s:4,gain:1,muted:false,speed:2};
 const clips=[a,b,c2]; // a: 0-10, b: 10-16, c: 16-18 (2 timeline s at 2x)
 const sliced=sliceTimeline(clips,5,14);
 assert.deepEqual(sliced.map(c=>[c.source,c.in_s,c.out_s,c.crossfade_s]),[
  ['a.mp4',15,20,1],['b.png',0,5,0]],'a keeps its fade into b (the fade zone overlaps b by 1 s); the cut through b becomes a hard cut');
 assert.equal(timelineDuration(sliced),9);
 const inside=sliceTimeline(clips,16.5,17.5);
 assert.deepEqual(inside.map(c=>[c.in_s,c.out_s]),[[3,4]],'sped clip (15-17 on the timeline): source window moves at 2x and clamps to the clip end');
 assert.deepEqual(sliceTimeline(clips,3,3),[],'empty range');
 assert.deepEqual(sliceTimeline(clips,50,60),[],'outside the timeline');
 const full=sliceTimeline(clips,0,18);
 assert.equal(full.length,3);
 assert.equal(full[0].crossfade_s,1,'uncut fade survives');
});

test('clip flips: sanitize keeps the four real values and drops junk and none',()=>{
 const mk=(flip:unknown):TimelineClip=>({id:'a',source:'a.mp4',in_s:0,out_s:2,gain:1,muted:false,flip:flip as never});
 assert.deepEqual(sanitizeClips([mk('h')],{'a.mp4':5})[0].flip,'h');
 assert.deepEqual(sanitizeClips([mk('hv')],{'a.mp4':5})[0].flip,'hv');
 assert.equal(sanitizeClips([mk('none')],{'a.mp4':5})[0].flip,undefined);
 assert.equal(sanitizeClips([mk('diagonal')],{'a.mp4':5})[0].flip,undefined);
 assert.equal(flipOf(mk('v')),'v');
 assert.equal(flipOf(mk(undefined)),'none');
});

test('timeline: clip audio fades clamp into the clip length and strip on stills',()=>{
 const clip={...fullClip('a.mp4',10),fadeIn:3,fadeOut:4};
 const clean=sanitizeClips([clip],{'a.mp4':10})[0];
 assert.deepEqual([fadeInOf(clean),fadeOutOf(clean)],[3,4],'fades inside the length survive');
 const over=sanitizeClips([{...clip,fadeIn:8,fadeOut:8}],{'a.mp4':10})[0];
 assert.deepEqual([fadeInOf(over),fadeOutOf(over)],[8,2],'fadeOut caps at duration minus fadeIn');
 const zero=sanitizeClips([{...clip,fadeIn:0,fadeOut:0}],{'a.mp4':10})[0];
 assert.equal(zero.fadeIn,undefined,'zero fades are dropped');
 const sped=sanitizeClips([{...clip,speed:2,fadeIn:9,fadeOut:9}],{'a.mp4':10})[0];
 assert.deepEqual([fadeInOf(sped),fadeOutOf(sped)],[5,0],'fades clamp to the sped timeline length');
 const title=sanitizeClips([{id:'t1',kind:'title',source:'',in_s:0,out_s:5,gain:1,muted:false,fadeIn:2,title:{text:'T'}}],{})[0];
 assert.equal(title.fadeIn,undefined,'titles carry no fades');
 const img=sanitizeClips([{id:'i1',kind:'image',source:'p.png',in_s:0,out_s:5,gain:1,muted:false,fadeIn:2}],{})[0];
 assert.equal(img.fadeIn,undefined,'image clips carry no fades');
});

test('timeline: clipFadeGain is an equal-power envelope over the clip range',()=>{
 const c={...fullClip('a.mp4',10),fadeIn:2,fadeOut:2};
 assert.equal(clipFadeGain(c,0,10,5),1,'untouched in the middle');
 assert.equal(clipFadeGain(c,0,10,0),0,'silent at the head');
 assert.ok(Math.abs(clipFadeGain(c,0,10,1)-Math.SQRT1_2)<1e-9,'half the fade-in is equal power');
 assert.ok(clipFadeGain(c,0,10,10)<1e-9,'silent at the tail');
 assert.ok(Math.abs(clipFadeGain(c,0,10,9)-Math.SQRT1_2)<1e-9,'half the fade-out is equal power');
 const plain=fullClip('a.mp4',10);
 assert.equal(clipFadeGain(plain,0,10,0),1,'no fades means unity');
});

test('timeline: setClipFades + a faded clip is no longer neutral',()=>{
 const clips=[fullClip('a.mp4',10)];
 const faded=setClipFades(clips,clips[0].id,1,2);
 assert.deepEqual([fadeInOf(faded[0]),fadeOutOf(faded[0])],[1,2]);
 assert.equal(isNeutralTimeline(faded,'a.mp4',10),false,'fades make the timeline edited');
 assert.equal(isNeutralTimeline(clips,'a.mp4',10),true,'untouched stays neutral');
});
