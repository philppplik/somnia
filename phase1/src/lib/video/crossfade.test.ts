import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {blendAt,clipRanges,fadeOf,sanitizeClips,setCrossfade,splitAt,timelineDuration,titleClip,type TimelineClip} from './timeline';
import {addTimelineClip,closeVideo,getVideoSession,openVideo,runVideoExport,setTimelineClipCrossfade,setVideoEngineFactory} from './session';
import type {VideoEngineLike,VideoResult} from './engine';
import type {VideoProbe,VideoReport} from './protocol';
const WEBM=new URL('../../../tests/assets/clip.webm',import.meta.url);
const bytes=(u:URL)=>new Uint8Array(readFileSync(u));
const PROBE:VideoProbe={duration:2,video:{codec:'vp9',width:320,height:180,fps:25},audio:{codec:'opus',channels:2,rate:48000}};
const REPORT:VideoReport={format:'webm',duration_s:3.5,bytes:12345,videoCodec:'vp9',audioCodec:'opus',steps:['2 clips joined.','Crossfades applied.']};

test('timeline: crossfades overlap the ranges and shorten the duration',()=>{
 const clips:TimelineClip[]=[{id:'a',source:'a',in_s:0,out_s:2,gain:1,muted:false,crossfade_s:0.5},{id:'b',source:'b',in_s:0,out_s:2,gain:1,muted:false}];
 assert.deepEqual(clipRanges(clips).map(r=>[r.start,r.end]),[[0,2],[1.5,3.5]]);
 assert.equal(timelineDuration(clips),3.5);
 const solo=blendAt(clips,1);
 assert.equal(solo.length,1);assert.equal(solo[0].range.clip.id,'a');assert.equal(solo[0].video,1);assert.equal(solo[0].audio,1);
 const mid=blendAt(clips,1.75);
 assert.equal(mid.length,2,'the overlap shows both clips');
 assert.equal(mid[0].range.clip.id,'a');assert.equal(mid[1].range.clip.id,'b');
 assert.ok(Math.abs(mid[1].video-0.5)<1e-9,'video dissolve is linear: 50% at the midpoint');
 assert.ok(Math.abs(mid[0].audio-Math.cos(Math.PI/4))<1e-9&&Math.abs(mid[1].audio-Math.sin(Math.PI/4))<1e-9,'audio crossfade is equal-power');
 assert.equal(mid[0].sourceTime,1.75);assert.equal(mid[1].sourceTime,0.25);
 const done=blendAt(clips,2.5);
 assert.equal(done.length,1);assert.equal(done[0].range.clip.id,'b','past the fade only the incoming clip remains');
});

test('timeline: setCrossfade clamps to both neighbours, sanitize clamps order changes and the last clip',()=>{
 const clips:TimelineClip[]=[{id:'a',source:'a',in_s:0,out_s:2,gain:1,muted:false},{id:'b',source:'b',in_s:0,out_s:1,gain:1,muted:false}];
 assert.equal(fadeOf(setCrossfade(clips,'a',99)[0]),1,'clamped to the shorter neighbour');
 assert.equal(fadeOf(setCrossfade(clips,'b',99)[1]),0,'the last clip takes no fade');
 assert.equal(fadeOf(setCrossfade(clips,'a',-3)[0]),0,'negative fades clamp to a cut');
 assert.equal(fadeOf(setCrossfade(clips,'zzz',1)[0]),0,'unknown id is a no-op');
 const dirty:TimelineClip[]=[{id:'a',source:'a',in_s:0,out_s:2,gain:1,muted:false,crossfade_s:9},{id:'b',source:'b',in_s:0,out_s:1,gain:1,muted:false,crossfade_s:9}];
 const clean=sanitizeClips(dirty,{a:2,b:1});
 assert.equal(fadeOf(clean[0]),1);assert.equal(fadeOf(clean[1]),0);
 const noSource=sanitizeClips([{id:'x',source:'gone',in_s:0,out_s:5,gain:1,muted:false,crossfade_s:2}],{});
 assert.equal(fadeOf(noSource[0]),0,'a clip without a neighbour loses its fade');
});

test('timeline: a split cuts hard on the left and keeps the fade on the right',()=>{
 const clips:TimelineClip[]=[{id:'a',source:'a',in_s:0,out_s:2,gain:1,muted:false,crossfade_s:0.5},{id:'b',source:'b',in_s:0,out_s:2,gain:1,muted:false}];
 const split=splitAt(clips,1)!;
 assert.equal(split.length,3);
 assert.equal(fadeOf(split[0]),0,'left part cuts hard into its own right half');
 assert.equal(fadeOf(split[1]),0.5,'right part keeps the fade into the next clip');
});

test('timeline: title clips sanitize to source-less cards and join the fade math',()=>{
 const card=titleClip({text:'Hi',size:64,color:'#fff',background:'#000'},9999);
 const clean=sanitizeClips([card],{});
 assert.equal(clean[0].in_s,0);assert.equal(clean[0].out_s,3600,'title duration clamps to the cap');
 assert.equal(clean[0].gain,1);assert.equal(clean[0].muted,false);
 const pair=sanitizeClips([{...titleClip({text:'A',size:64,color:'#fff',background:'#000'},3),crossfade_s:9},{id:'m',source:'m',in_s:0,out_s:2,gain:1,muted:false}],{m:2});
 assert.equal(fadeOf(pair[0]),2,'a fade out of a title clamps to the next clip');
});

test('session: crossfade edits ride through editTimeline and reach the export',async()=>{
 const state={last:null as TimelineClip[]|null};
 const engine:VideoEngineLike={async probe(){return PROBE;},async capabilities(){return{webmVideo:'vp9',mp4Video:null,opus:true,aac:false};},
  async export(_sources,clips){state.last=clips.map(c=>({...c}));return{bytes:new Uint8Array([0x1a,0x45,0xdf,0xa3]).buffer as ArrayBuffer,mime:'video/webm',report:REPORT} satisfies VideoResult;},
  cancelExport(){},dispose(){}};
 setVideoEngineFactory(()=>engine);
 const mediaItem=(name:string)=>{const url=URL.createObjectURL(new Blob([bytes(WEBM).buffer as ArrayBuffer],{type:'video/webm'}));return{name,url};};
 const a=mediaItem('a.webm'),b=mediaItem('b.webm');
 await openVideo(a);await addTimelineClip('a.webm',b);
 const s=getVideoSession('a.webm')!;
 setTimelineClipCrossfade('a.webm',s.clips[0].id,0.5);
 assert.equal(getVideoSession('a.webm')!.clips[0].crossfade_s,0.5);
 assert.equal(timelineDuration(getVideoSession('a.webm')!.clips),3.5,'session duration shrinks by the overlap');
 setTimelineClipCrossfade('a.webm',s.clips[0].id,99);
 assert.equal(getVideoSession('a.webm')!.clips[0].crossfade_s,2,'session edits clamp to the shorter clip');
 assert.equal(await runVideoExport('a.webm'),'exported');
 assert.equal(state.last?.[0].crossfade_s,2,'the worker receives the fade');
 closeVideo('a.webm');closeVideo('b.webm');URL.revokeObjectURL(a.url);URL.revokeObjectURL(b.url);
});
