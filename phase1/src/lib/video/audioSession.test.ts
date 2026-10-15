import test from 'node:test';
import assert from 'node:assert/strict';
import {addBlankVideoProject,addMediaFile,closeMedia,getMedia} from '../media';
import {addAudioTrackClip,closeVideo,deleteAudioTrackClip,getVideoSession,moveAudioTrackClip,openVideo,redoVideoEdit,serializeVideoProjectCopy,setAudioTrackClipFades,setAudioTrackClipGain,setVideoEngineFactory,trimAudioTrackClip,undoVideoEdit,videoIsDirty} from './session';
import type {VideoEngineLike} from './engine';import type {VideoProbe} from './protocol';

const AUDIO_PROBE:VideoProbe={duration:8,video:null,audio:{codec:'opus',channels:2,rate:48000}};
const fakeAudioEngine=(probe:VideoProbe=AUDIO_PROBE):VideoEngineLike=>({
 async probe(){return probe;},
 async capabilities(){return{webmVideo:'vp9',mp4Video:null,opus:true,aac:false};},
 async export(){throw new Error('not needed');},
 cancelExport(){},dispose(){},
});
const audioItem=(name:string)=>{const url=URL.createObjectURL(new Blob([new Uint8Array(64)],{type:'audio/ogg'}));return{name,url};};

const freshProject=async(name:string)=>{
 addBlankVideoProject(name);
 await openVideo(getMedia().items.find(i=>i.name===name)!);
 return()=>{closeVideo(name);closeMedia(name);};
};

test('audio track: add, move, trim, gain, fades and delete a clip',async()=>{
 setVideoEngineFactory(()=>fakeAudioEngine());
 const done=await freshProject('au-basic.video-project');
 try{
  const id=await addAudioTrackClip('au-basic.video-project',audioItem('music.mp3'));
  assert.ok(id);
  let s=getVideoSession('au-basic.video-project')!;
  assert.equal(s.audioClips.length,1);
  assert.deepEqual([s.audioClips[0].in_s,s.audioClips[0].out_s,s.audioClips[0].at],[0,8,0]);

  moveAudioTrackClip('au-basic.video-project',id!,3.25);
  assert.equal(getVideoSession('au-basic.video-project')!.audioClips[0].at,3.25);
  trimAudioTrackClip('au-basic.video-project',id!,'in',2);
  trimAudioTrackClip('au-basic.video-project',id!,'out',6);
  s=getVideoSession('au-basic.video-project')!;
  assert.deepEqual([s.audioClips[0].in_s,s.audioClips[0].out_s],[2,6]);
  setAudioTrackClipGain('au-basic.video-project',id!,0.5);
  setAudioTrackClipFades('au-basic.video-project',id!,1,2);
  s=getVideoSession('au-basic.video-project')!;
  assert.deepEqual([s.audioClips[0].gain,s.audioClips[0].fadeIn,s.audioClips[0].fadeOut],[0.5,1,2]);
  deleteAudioTrackClip('au-basic.video-project',id!);
  assert.equal(getVideoSession('au-basic.video-project')!.audioClips.length,0);
 }finally{done();}
});

test('audio track: undo and redo restore the audio timeline',async()=>{
 setVideoEngineFactory(()=>fakeAudioEngine());
 const done=await freshProject('au-undo.video-project');
 try{
  const id=await addAudioTrackClip('au-undo.video-project',audioItem('voice.wav'));
  moveAudioTrackClip('au-undo.video-project',id!,5);
  assert.equal(getVideoSession('au-undo.video-project')!.audioClips[0].at,5);
  undoVideoEdit('au-undo.video-project');
  assert.equal(getVideoSession('au-undo.video-project')!.audioClips[0].at,0,'undo restores the placement');
  undoVideoEdit('au-undo.video-project');
  assert.equal(getVideoSession('au-undo.video-project')!.audioClips.length,0,'undo restores the empty track');
  redoVideoEdit('au-undo.video-project');
  assert.equal(getVideoSession('au-undo.video-project')!.audioClips.length,1);
 }finally{done();}
});

test('audio track: edits dirty the project and the saved copy round-trips the audio',async()=>{
 setVideoEngineFactory(()=>fakeAudioEngine());
 const done=await freshProject('au-save.video-project');
 try{
  assert.ok(!videoIsDirty(getVideoSession('au-save.video-project')));
  const id=await addAudioTrackClip('au-save.video-project',audioItem('score.mp3'),1.5);
  setAudioTrackClipFades('au-save.video-project',id!,0.5,1);
  assert.ok(videoIsDirty(getVideoSession('au-save.video-project')),'audio edits mark the project dirty');
  const copy=serializeVideoProjectCopy('au-save.video-project')!;
  assert.match(copy.text,/"version": 2/);
  done();
  const r=await addMediaFile(new Blob([copy.text]),'au-save-2.video-project');
  assert.ok('name' in r,JSON.stringify(r));
  await openVideo(getMedia().items.find(i=>i.name==='au-save-2.video-project')!);
  const s=getVideoSession('au-save-2.video-project')!;
  assert.equal(s.status,'ready',s.error);
  assert.equal(s.audioClips.length,1);
  assert.deepEqual([s.audioClips[0].source,s.audioClips[0].at,s.audioClips[0].fadeIn,s.audioClips[0].fadeOut],['score.mp3',1.5,0.5,1]);
  assert.ok(!videoIsDirty(s),'a freshly loaded project is clean');
  closeVideo('au-save-2.video-project');closeMedia('au-save-2.video-project');
 }finally{closeVideo('au-save.video-project');closeMedia('au-save.video-project');}
});

test('audio track: a source without an audio track is rejected with an error',async()=>{
 setVideoEngineFactory(()=>fakeAudioEngine({duration:1,video:null,audio:null}));
 const done=await freshProject('au-bad.video-project');
 try{
  const id=await addAudioTrackClip('au-bad.video-project',audioItem('silent.bin'));
  assert.equal(id,null);
  const s=getVideoSession('au-bad.video-project')!;
  assert.equal(s.audioClips.length,0);
  assert.match(s.error,/no audio track/i);
 }finally{done();}
});

test('audio track: selection is exclusive across tracks and survives edits only while the clip does',async()=>{
 setVideoEngineFactory(()=>fakeAudioEngine());
 const done=await freshProject('au-select.video-project');
 try{
  const {addTitleClip}=await import('./titleSession');
  const {selectTimelineClip,selectAudioTrackClip}=await import('./session');
  addTitleClip('au-select.video-project',Number.MAX_SAFE_INTEGER,{text:'t'});
  const videoId=getVideoSession('au-select.video-project')!.clips[0].id;
  selectTimelineClip('au-select.video-project',videoId);
  const audioId=await addAudioTrackClip('au-select.video-project',audioItem('narration.wav'));
  selectAudioTrackClip('au-select.video-project',audioId!);
  let s=getVideoSession('au-select.video-project')!;
  assert.equal(s.selectedAudioClipId,audioId);
  assert.equal(s.selectedClipId,null,'audio selection clears the video selection');
  selectTimelineClip('au-select.video-project',videoId);
  s=getVideoSession('au-select.video-project')!;
  assert.equal(s.selectedClipId,videoId);
  assert.equal(s.selectedAudioClipId,null,'video selection clears the audio selection');
  selectAudioTrackClip('au-select.video-project',audioId!);
  moveAudioTrackClip('au-select.video-project',audioId!,2);
  assert.equal(getVideoSession('au-select.video-project')!.selectedAudioClipId,audioId,'an edit keeps the selection');
  deleteAudioTrackClip('au-select.video-project',audioId!);
  assert.equal(getVideoSession('au-select.video-project')!.selectedAudioClipId,null,'deleting the clip clears the selection');
 }finally{done();}
});

test('audio track: undo restores a deleted clip; selection follows the current state, not history',async()=>{
 setVideoEngineFactory(()=>fakeAudioEngine());
 const done=await freshProject('au-undosel.video-project');
 try{
  const {selectAudioTrackClip}=await import('./session');
  const audioId=await addAudioTrackClip('au-undosel.video-project',audioItem('bed.mp3'));
  selectAudioTrackClip('au-undosel.video-project',audioId!);
  deleteAudioTrackClip('au-undosel.video-project',audioId!);
  assert.equal(getVideoSession('au-undosel.video-project')!.audioClips.length,0);
  assert.equal(getVideoSession('au-undosel.video-project')!.selectedAudioClipId,null,'deleting clears the selection');
  undoVideoEdit('au-undosel.video-project');
  const s=getVideoSession('au-undosel.video-project')!;
  assert.equal(s.audioClips.length,1,'undo brings the clip back');
  assert.equal(s.selectedAudioClipId,null,'selection is not revived from history (same as video clips)');
  selectAudioTrackClip('au-undosel.video-project',audioId!);
  assert.equal(getVideoSession('au-undosel.video-project')!.selectedAudioClipId,audioId,'and can be set again');
 }finally{done();}
});

test('audio track: mute toggles, dirties and undoes',async()=>{
 setVideoEngineFactory(()=>fakeAudioEngine());
 const done=await freshProject('au-mute.video-project');
 try{
  const {toggleAudioTrackClipMute}=await import('./session');
  const id=await addAudioTrackClip('au-mute.video-project',audioItem('pad.mp3'));
  assert.equal(getVideoSession('au-mute.video-project')!.audioClips[0].muted,false);
  const sig=serializeVideoProjectCopy('au-mute.video-project')!.text;
  toggleAudioTrackClipMute('au-mute.video-project',id!);
  assert.equal(getVideoSession('au-mute.video-project')!.audioClips[0].muted,true);
  assert.ok(videoIsDirty(getVideoSession('au-mute.video-project')));
  toggleAudioTrackClipMute('au-mute.video-project',id!);
  assert.equal(getVideoSession('au-mute.video-project')!.audioClips[0].muted,false);
  undoVideoEdit('au-mute.video-project');
  assert.equal(getVideoSession('au-mute.video-project')!.audioClips[0].muted,true,'undo restores the muted state');
  assert.match(serializeVideoProjectCopy('au-mute.video-project')!.text,/"muted": true/,'mute lands in the saved copy');
  void sig;
 }finally{done();}
});

test('audio track: duck sets, dirties and undoes',async()=>{
 setVideoEngineFactory(()=>fakeAudioEngine());
 const done=await freshProject('au-duck.video-project');
 try{
  const {setAudioTrackClipDuck}=await import('./session');
  const id=await addAudioTrackClip('au-duck.video-project',audioItem('bed.mp3'));
  assert.equal(getVideoSession('au-duck.video-project')!.audioClips[0].duck,0);
  setAudioTrackClipDuck('au-duck.video-project',id!,0.5);
  assert.equal(getVideoSession('au-duck.video-project')!.audioClips[0].duck,0.5);
  assert.ok(videoIsDirty(getVideoSession('au-duck.video-project')));
  undoVideoEdit('au-duck.video-project');
  assert.equal(getVideoSession('au-duck.video-project')!.audioClips[0].duck,0,'undo restores duck 0');
 }finally{done();}
});

test('audio track: duplicate selects the copy, dirties and undoes',async()=>{
 setVideoEngineFactory(()=>fakeAudioEngine());
 const done=await freshProject('au-dupe.video-project');
 try{
  const {duplicateAudioTrackClip}=await import('./session');
  const id=await addAudioTrackClip('au-dupe.video-project',audioItem('loop.mp3'),2);
  const copy=duplicateAudioTrackClip('au-dupe.video-project',id!);
  assert.ok(copy&&copy!==id);
  const s=getVideoSession('au-dupe.video-project')!;
  assert.equal(s.audioClips.length,2);
  assert.equal(s.audioClips[1].at,10,'copy lands after the 8 s original at 2');
  assert.equal(s.selectedAudioClipId,copy,'the copy is selected');
  assert.ok(videoIsDirty(s));
  undoVideoEdit('au-dupe.video-project');
  const s2=getVideoSession('au-dupe.video-project')!;
  assert.equal(s2.audioClips.length,1,'undo drops the copy');
  assert.equal(s2.selectedAudioClipId,null,'and the dead selection goes with it');
 }finally{done();}
});
