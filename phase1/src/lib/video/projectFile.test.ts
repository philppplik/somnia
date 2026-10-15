import test from 'node:test';
import assert from 'node:assert/strict';
import {clipsSignature,parseVideoProject,projectFileName,serializeVideoProject,VIDEO_PROJECT_VERSION} from './projectFile';
import {newTitleClip} from './titles';
import type {TimelineClip} from './timeline';
const media=(id:string,over:Partial<TimelineClip>={}):TimelineClip=>({id,source:'clip.mp4',in_s:0,out_s:5,gain:1,muted:false,...over});

test('serialize and parse round-trip media and title clips',()=>{
 const title=newTitleClip({text:'Intro',size:90,color:'#A1B2C3',background:'#101010',font:'serif',italic:true,align:'left',fadeIn:0.5},2.5);
 const clips:TimelineClip[]=[media('m1'),{...media('m2',{source:'b roll.webm',in_s:1.25,out_s:3.5,gain:0.4,muted:true}),crossfade_s:0.75},title];
 const text=serializeVideoProject(clips,'mp4');
 const parsed=parseVideoProject(text);
 assert.equal(parsed.format,'mp4');
 assert.equal(parsed.clips.length,3);
 assert.deepEqual(parsed.clips[0],media('m1',{crossfade_s:0}));
 assert.deepEqual([parsed.clips[1].source,parsed.clips[1].in_s,parsed.clips[1].out_s,parsed.clips[1].gain,parsed.clips[1].muted,parsed.clips[1].crossfade_s],['b roll.webm',1.25,3.5,0.4,true,0.75]);
 const t=parsed.clips[2];
 assert.equal(t.kind,'title');
 assert.deepEqual(t.title,{text:'Intro',size:90,color:'#a1b2c3',background:'#101010',font:'serif',bold:true,italic:true,align:'left',vAlign:'middle',fadeIn:0.5,fadeOut:0});
 assert.equal(t.id,title.id,'ids round-trip');
});

test('parse rejects junk, foreign JSON and other versions with clear errors',()=>{
 assert.throws(()=>parseVideoProject('not json'),/not a JSON file/i);
 assert.throws(()=>parseVideoProject('{"hello":1}'),/not a Somnia video project/i);
 assert.throws(()=>parseVideoProject(JSON.stringify({app:'somnia-video',version:99,clips:[]})),/version 99 is not supported/i);
 assert.throws(()=>parseVideoProject(JSON.stringify({app:'somnia-video',version:VIDEO_PROJECT_VERSION})),/no clip list/i);
});

test('parse coerces bad fields, skips degenerate clips and de-duplicates ids',()=>{
 const text=JSON.stringify({app:'somnia-video',version:1,format:'mkv',clips:[
  {id:'a',kind:'media',source:'x.mp4',in_s:-5,out_s:2,gain:99,muted:'yes',crossfade_s:7},
  {id:'a',kind:'media',source:'y.mp4',in_s:0,out_s:1},
  {kind:'media',source:'',in_s:0,out_s:1},
  {kind:'media',source:'z.mp4',in_s:3,out_s:3},
  'garbage',
  {id:'t',kind:'title',out_s:99999,crossfade_s:2,title:{text:'  ',size:99999,color:'red',font:'comic'}},
 ]});
 const {clips,format}=parseVideoProject(text);
 assert.equal(format,'webm','unknown format falls back to the default');
 assert.equal(clips.length,3,'empty source, zero-length range and non-objects drop out');
 assert.equal(clips[0].in_s,0);assert.equal(clips[0].muted,false,'non-boolean mute falls back');
 assert.notEqual(clips[1].id,'a','duplicate id gets replaced');
 assert.equal(clips[0].crossfade_s,1,'fade clamps to the shorter neighbour');
 const t=clips[2];
 assert.equal(t.out_s,3600,'title duration clamps');
 assert.equal(t.crossfade_s,0,'last clip never fades');
 assert.equal(t.title?.size,600);assert.equal(t.title?.color,'#ffffff');assert.equal(t.title?.font,'sans');
});

test('extra unknown fields are tolerated (forward compatibility)',()=>{
 const text=JSON.stringify({app:'somnia-video',version:1,future:'stuff',clips:[{id:'a',kind:'media',source:'x.mp4',in_s:0,out_s:1,what:'ever'}]});
 assert.equal(parseVideoProject(text).clips.length,1);
});

test('clipsSignature changes on edits and is stable for equal timelines',()=>{
 const a=[media('m1')];
 assert.equal(clipsSignature(a),clipsSignature([media('m1')]));
 assert.notEqual(clipsSignature(a),clipsSignature([media('m1',{muted:true})]));
 assert.notEqual(clipsSignature(a),clipsSignature([media('m2')]),'a new id is a different edit');
 assert.notEqual(clipsSignature(a),clipsSignature([{...media('m1'),crossfade_s:0.5}]));
});

test('projectFileName keeps project names and maps video files',()=>{
 assert.equal(projectFileName('Untitled.video-project'),'Untitled.video-project');
 assert.equal(projectFileName('holiday.mp4'),'holiday.video-project');
 assert.equal(projectFileName('a/b/clip.WEBM'),'clip.video-project');
});
