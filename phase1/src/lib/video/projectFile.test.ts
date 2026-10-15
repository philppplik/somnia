import test from 'node:test';
import assert from 'node:assert/strict';
import {clipsSignature,parseVideoProject,projectFileName,serializeVideoProject,VIDEO_PROJECT_VERSION} from './projectFile';
import {newTitleClip} from './titles';
import type {TimelineClip} from './timeline';
const media=(id:string,over:Partial<TimelineClip>={}):TimelineClip=>({id,source:'clip.mp4',in_s:0,out_s:5,gain:1,muted:false,speed:1,...over});

test('serialize and parse round-trip media and title clips',()=>{
 const title=newTitleClip({text:'Intro',size:90,color:'#A1B2C3',background:'#101010',font:'serif',italic:true,align:'left',fadeIn:0.5},2.5);
 const clips:TimelineClip[]=[media('m1'),{...media('m2',{source:'b roll.webm',in_s:1.25,out_s:3.5,gain:0.4,muted:true}),crossfade_s:0.75},title];
 const text=serializeVideoProject(clips,[],'mp4');
 const parsed=parseVideoProject(text);
 assert.equal(parsed.format,'mp4');
 assert.deepEqual(parsed.audioClips,[]);
 assert.equal(parsed.clips.length,3);
 assert.deepEqual(parsed.clips[0],media('m1',{crossfade_s:0}));
 assert.deepEqual([parsed.clips[1].source,parsed.clips[1].in_s,parsed.clips[1].out_s,parsed.clips[1].gain,parsed.clips[1].muted,parsed.clips[1].crossfade_s],['b roll.webm',1.25,3.5,0.4,true,0.75]);
 const t=parsed.clips[2];
 assert.equal(t.kind,'title');
 assert.deepEqual(t.title,{text:'Intro',size:90,color:'#a1b2c3',background:'#101010',font:'serif',bold:true,italic:true,align:'left',vAlign:'middle',fadeIn:0.5,fadeOut:0,bgAlpha:1});
 assert.equal(t.id,title.id,'ids round-trip');
});

test('audio clips round-trip and version 2 is the written format',()=>{
 const audio=[{id:'au1',source:'music.mp3',in_s:2,out_s:12,at:4,gain:0.7,muted:true,duck:0.5,fadeIn:1.5,fadeOut:2}];
 const text=serializeVideoProject([media('m1')],audio,'mp4');
 assert.equal(JSON.parse(text).version,VIDEO_PROJECT_VERSION);
 const parsed=parseVideoProject(text);
 assert.equal(parsed.audioClips.length,1);
 assert.deepEqual(parsed.audioClips[0],audio[0]);
});

test('legacy version 1 files load with an empty audio track; version 3+ is rejected',()=>{
 const v1=JSON.stringify({app:'somnia-video',version:1,format:'mp4',clips:[{id:'a',kind:'media',source:'x.mp4',in_s:0,out_s:1}]});
 const parsed=parseVideoProject(v1);
 assert.equal(parsed.clips.length,1);
 assert.deepEqual(parsed.audioClips,[]);
 const v2nomute=JSON.stringify({app:'somnia-video',version:2,clips:[],audio:[{id:'x',source:'m.mp3',in_s:0,out_s:1,at:0,gain:1,fadeIn:0,fadeOut:0}]});
 assert.equal(parseVideoProject(v2nomute).audioClips[0].muted,false,'v2 files written before mute load unmuted');
 assert.equal(parseVideoProject(v2nomute).audioClips[0].duck,0,'v2 files written before duck load with duck 0');
 const v3=JSON.stringify({app:'somnia-video',version:3,clips:[]});
 assert.throws(()=>parseVideoProject(v3),/version 3 is not supported/i);
});

test('audio fields are coerced and junk audio entries are skipped',()=>{
 const text=JSON.stringify({app:'somnia-video',version:2,clips:[{id:'a',kind:'media',source:'x.mp4',in_s:0,out_s:1}],audio:[
  {id:'au1',source:'m.mp3',in_s:-2,out_s:5,at:-1,gain:9,fadeIn:-3,fadeOut:0},
  {source:'',in_s:0,out_s:1},
  'garbage',
 ]});
 const parsed=parseVideoProject(text);
 assert.equal(parsed.audioClips.length,1);
 assert.deepEqual([parsed.audioClips[0].in_s,parsed.audioClips[0].at,parsed.audioClips[0].gain,parsed.audioClips[0].fadeIn],[0,0,2,0]);
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
 const au=[{id:'au1',source:'m.mp3',in_s:0,out_s:2,at:0,gain:1,muted:false,duck:0,fadeIn:0,fadeOut:0}];
 assert.notEqual(clipsSignature(a),clipsSignature(a,au),'audio edits change the signature');
 assert.equal(clipsSignature(a,au),clipsSignature(a,au.map(c=>({...c}))));
 assert.notEqual(clipsSignature(a),clipsSignature([{...media('m1'),crossfade_s:0.5}]));
});

test('projectFileName keeps project names and maps video files',()=>{
 assert.equal(projectFileName('Untitled.video-project'),'Untitled.video-project');
 assert.equal(projectFileName('holiday.mp4'),'holiday.video-project');
 assert.equal(projectFileName('a/b/clip.WEBM'),'clip.video-project');
});

test('image clips round-trip with fixed shape and clamped duration',()=>{
 const clips:TimelineClip[]=[media('m1'),{id:'img1',kind:'image',source:'photo.png',in_s:0,out_s:5,gain:1,muted:false,crossfade_s:0.5},media('m2')];
 const parsed=parseVideoProject(serializeVideoProject(clips,[],'webm'));
 const img=parsed.clips[1];
 assert.equal(img.kind,'image');
 assert.deepEqual([img.source,img.in_s,img.out_s,img.gain,img.muted,img.crossfade_s],['photo.png',0,5,1,false,0.5]);
 assert.equal(JSON.parse(serializeVideoProject(clips,[],'webm')).clips[1].kind,'image','serialized as image');
 const loose=JSON.stringify({app:'somnia-video',version:2,clips:[{id:'i',kind:'image',source:'p.jpg',in_s:3,out_s:99999,gain:0.2,muted:true}]});
 const parsedLoose=parseVideoProject(loose);
 assert.deepEqual([parsedLoose.clips[0].in_s,parsedLoose.clips[0].out_s,parsedLoose.clips[0].gain,parsedLoose.clips[0].muted],[0,3600,1,false],'shape is fixed: in 0, duration clamped, no gain/mute');
});

test('export options round-trip and old files load with the defaults',()=>{
 const withOpts=parseVideoProject(serializeVideoProject([media('m1')],[],'webm',{scale:0.5,quality:'medium'}));
 assert.deepEqual(withOpts.exportOptions,{scale:0.5,quality:'medium'});
 const legacy=JSON.stringify({app:'somnia-video',version:2,format:'mp4',clips:[{id:'a',kind:'media',source:'x.mp4',in_s:0,out_s:1}]});
 assert.deepEqual(parseVideoProject(legacy).exportOptions,{scale:1,quality:'high'},'files without options keep the defaults');
 const junk=JSON.stringify({app:'somnia-video',version:2,scale:0.7,quality:'ultra',clips:[{id:'a',kind:'media',source:'x.mp4',in_s:0,out_s:1}]});
 assert.deepEqual(parseVideoProject(junk).exportOptions,{scale:1,quality:'high'},'unsupported values are clamped');
});

test('clip flips round-trip; none is omitted from the file',()=>{
 const clips:TimelineClip[]=[media('m1',{flip:'h'}),{id:'img1',kind:'image',source:'photo.png',in_s:0,out_s:5,gain:1,muted:false,flip:'hv'}];
 const parsed=parseVideoProject(serializeVideoProject(clips,[],'webm'));
 assert.equal(parsed.clips[0].flip,'h');
 assert.equal(parsed.clips[1].flip,'hv');
 assert.ok(!JSON.stringify(serializeVideoProject([media('m1')],[],'webm')).includes('flip'),'unflipped clips write no flip field');
 const junk=JSON.stringify({app:'somnia-video',version:2,clips:[{id:'a',kind:'media',source:'x.mp4',in_s:0,out_s:1,flip:'diagonal'}]});
 assert.equal(parseVideoProject(junk).clips[0].flip,undefined,'unsupported values drop');
});

test('media clip audio fades round-trip and feed the signature',()=>{
 const clip:TimelineClip={id:'c1',source:'a.mp4',in_s:0,out_s:8,gain:1,muted:false,fadeIn:1.5,fadeOut:2.5};
 const text=serializeVideoProject([clip],[],'webm');
 const parsed=parseVideoProject(text);
 assert.deepEqual([parsed.clips[0].fadeIn,parsed.clips[0].fadeOut],[1.5,2.5]);
 assert.notEqual(clipsSignature([clip]),clipsSignature([{...clip,fadeOut:1}]),'fades are part of the dirty signature');
 const plain=parseVideoProject(serializeVideoProject([{...clip,fadeIn:undefined,fadeOut:undefined}],[],'webm'));
 assert.equal(plain.clips[0].fadeIn,undefined,'absent fades stay absent');
});
