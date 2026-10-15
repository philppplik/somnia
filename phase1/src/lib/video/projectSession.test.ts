import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {addBlankVideoProject,addMediaFile,closeMedia,getMedia} from '../media';
import {addTimelineClip} from './session';
import {setVideoEngineFactory} from './session';
const MP4=new URL('../../../tests/assets/clip.mp4',import.meta.url);
const bytes=(u:URL)=>new Uint8Array(readFileSync(u));
import {addImageClip,closeVideo,duplicateTimelineClip,dirtyVideoNames,getVideoSession,openVideo,redoVideoEdit,replaceClipSource,serializeVideoProjectCopy,setImageClipLength,setTimelineClipFades,setTimelineClipFlip,setTimelineClipFreeze,setVideoFormat,trimTimelineClip,undoVideoEdit,videoIsDirty} from './session';
import {addTitleClip,updateTitle} from './titleSession';

test('project: a saved .video-project reloads its timeline and format, clean',async()=>{
 const a='save-src.video-project';
 addBlankVideoProject(a);
 await openVideo(getMedia().items.find(i=>i.name===a)!);
 addTitleClip(a,Number.MAX_SAFE_INTEGER,{text:'Intro',size:90});
 updateTitle(a,getVideoSession(a)!.clips[0].id,{background:'#222222'});
 setVideoFormat(a,'mp4');
 assert.ok(videoIsDirty(getVideoSession(a)),'edits mark the project dirty');
 assert.deepEqual(dirtyVideoNames(),[a]);
 const copy=serializeVideoProjectCopy(a)!;
 assert.equal(copy.fileName,'save-src.video-project');
 closeVideo(a);closeMedia(a);

 const r=await addMediaFile(new Blob([copy.text],{type:'application/x-somnia-video-project'}),'reloaded.video-project');
 assert.ok('name' in r,JSON.stringify(r));
 await openVideo(getMedia().items.find(i=>i.name==='reloaded.video-project')!);
 const s=getVideoSession('reloaded.video-project')!;
 assert.equal(s.status,'ready');
 assert.equal(s.clips.length,1);
 assert.equal(s.clips[0].kind,'title');
 assert.equal(s.clips[0].title?.text,'Intro');
 assert.equal(s.clips[0].title?.background,'#222222');
 assert.equal(s.format,'mp4');
 assert.ok(!videoIsDirty(s),'a freshly loaded project is clean');
 assert.equal(dirtyVideoNames().length,0);
 closeVideo('reloaded.video-project');closeMedia('reloaded.video-project');
});

test('project: a corrupt project file surfaces an error, not a crash',async()=>{
 const r=await addMediaFile(new Blob(['{"app":"somnia-video","version":42,"clips":[]}']),'broken.video-project');
 assert.ok('name' in r,JSON.stringify(r));
 await openVideo(getMedia().items.find(i=>i.name==='broken.video-project')!);
 const s=getVideoSession('broken.video-project')!;
 assert.equal(s.status,'error');
 assert.match(s.error,/version 42 is not supported/i);
 assert.ok(!videoIsDirty(s));
 closeVideo('broken.video-project');closeMedia('broken.video-project');
});

test('project: undoing back to the saved state clears the dirty flag',async()=>{
 const a='save-undo.video-project';
 addBlankVideoProject(a);
 await openVideo(getMedia().items.find(i=>i.name===a)!);
 addTitleClip(a,Number.MAX_SAFE_INTEGER,{text:'x'});
 assert.ok(videoIsDirty(getVideoSession(a)));
 const copy=serializeVideoProjectCopy(a)!;
 closeVideo(a);closeMedia(a);
 await addMediaFile(new Blob([copy.text]),'save-undo2.video-project');
 await openVideo(getMedia().items.find(i=>i.name==='save-undo2.video-project')!);
 addTitleClip('save-undo2.video-project',Number.MAX_SAFE_INTEGER,{text:'y'});
 assert.ok(videoIsDirty(getVideoSession('save-undo2.video-project')));
 const {undoVideoEdit}=await import('./session');
 undoVideoEdit('save-undo2.video-project');
 assert.ok(!videoIsDirty(getVideoSession('save-undo2.video-project')),'back at the loaded state = clean');
 closeVideo('save-undo2.video-project');closeMedia('save-undo2.video-project');
});

test('project: image clips add, retime, undo and save like title clips',async()=>{
 const a='images.video-project';
 addBlankVideoProject(a);
 await openVideo(getMedia().items.find(i=>i.name===a)!);
 const id=addImageClip(a,{name:'photo.png'})!;
 assert.ok(id,'adds without a probe');
 let s=getVideoSession(a)!;
 assert.deepEqual([s.clips[0].kind,s.clips[0].source,s.clips[0].in_s,s.clips[0].out_s],['image','photo.png',0,5]);
 assert.equal(s.selectedClipId,id,'new clip is selected');
 setImageClipLength(a,id,2.5);
 assert.equal(getVideoSession(a)!.clips[0].out_s,2.5);
 assert.ok(videoIsDirty(getVideoSession(a)));
 undoVideoEdit(a);undoVideoEdit(a);
 assert.equal(getVideoSession(a)!.clips.length,0,'undo removes the clip');
 assert.ok(!videoIsDirty(getVideoSession(a)),'back to clean');
 redoVideoEdit(a);
 assert.equal(getVideoSession(a)!.clips[0].out_s,5);
 setImageClipLength(a,id,0);
 assert.equal(getVideoSession(a)!.clips[0].out_s,0.05,'duration clamps');
 const copy=serializeVideoProjectCopy(a)!;
 assert.match(copy.text,/"kind": "image"/);
 closeVideo(a);closeMedia(a);
});

test('project: duplicating a timeline clip copies it right after the original and selects the copy',async()=>{
 const a='dup.video-project';
 addBlankVideoProject(a);
 await openVideo(getMedia().items.find(i=>i.name===a)!);
 addTitleClip(a,Number.MAX_SAFE_INTEGER,{text:'Intro'});
 const titleId=getVideoSession(a)!.clips[0].id;
 const imgId=addImageClip(a,{name:'photo.png'})!;
 const copyId=duplicateTimelineClip(a,titleId)!;
 let s=getVideoSession(a)!;
 assert.notEqual(copyId,titleId);
 assert.deepEqual(s.clips.map(c=>c.id),[titleId,copyId,imgId],'copy lands right after the original');
 assert.equal(s.clips[1].title?.text,'Intro','title spec copied');
 assert.equal(s.selectedClipId,copyId,'copy is selected');
 const imgCopy=duplicateTimelineClip(a,imgId)!;
 s=getVideoSession(a)!;
 assert.deepEqual([s.clips[3].kind,s.clips[3].source,s.clips[3].out_s],['image','photo.png',5]);
 updateTitle(a,copyId,{text:'Changed'});
 assert.equal(getVideoSession(a)!.clips[0].title?.text,'Intro','copy is independent of the original');
 assert.equal(duplicateTimelineClip(a,'nope'),null,'unknown id is a no-op');
 undoVideoEdit(a);
 assert.equal(getVideoSession(a)!.clips[1].title?.text,'Intro','undo reverts the copy edit');
 undoVideoEdit(a);
 assert.equal(getVideoSession(a)!.clips.length,3,'undo removes the last duplicate');
 assert.ok(videoIsDirty(getVideoSession(a)));
 closeVideo(a);closeMedia(a);
});

test('project: dropping a video source inserts it at the drop time and selects it',async()=>{
 setVideoEngineFactory(()=>({async capabilities(){return{webmVideo:'vp9',mp4Video:null,opus:true,aac:false};},async probe(){return{duration:4,video:{codec:'vp9',width:640,height:360,fps:30},audio:null};},async export(){throw new Error('not needed');},cancelExport(){},dispose(){}}));
 const r=await addMediaFile(new Blob([bytes(MP4)],{type:'video/mp4'}),'drop-src.mp4');
 assert.ok('name' in r,JSON.stringify(r));
 const a='drop-target.video-project';
 addBlankVideoProject(a);
 await openVideo(getMedia().items.find(i=>i.name===a)!);
 addImageClip(a,{name:'photo.png'},2);
 await addTimelineClip(a,getMedia().items.find(i=>i.name==='drop-src.mp4')!,1);
 let s=getVideoSession(a)!;
 assert.deepEqual(s.clips.map(c=>[c.kind??'media',c.source]),[['image','photo.png'],['media','drop-src.mp4']],'inserted after the clip under the drop time');
 assert.equal(s.selectedClipId,s.clips[1].id);
 await addTimelineClip(a,getMedia().items.find(i=>i.name==='drop-src.mp4')!);
 s=getVideoSession(a)!;
 assert.equal(s.clips.length,3);
 assert.equal(s.clips[2].source,'drop-src.mp4','without a time it appends as before');
 closeVideo(a);closeMedia(a);closeMedia('drop-src.mp4');
});

test('project: mirroring a clip sets, changes and clears the flip; titles refuse',async()=>{
 const a='flip.video-project';
 addBlankVideoProject(a);
 await openVideo(getMedia().items.find(i=>i.name===a)!);
 const imgId=addImageClip(a,{name:'photo.png'})!;
 addTitleClip(a,Number.MAX_SAFE_INTEGER,{text:'T'});
 const titleId=getVideoSession(a)!.clips[1].id;
 setTimelineClipFlip(a,imgId,'h');
 assert.equal(getVideoSession(a)!.clips[0].flip,'h');
 setTimelineClipFlip(a,imgId,'hv');
 assert.equal(getVideoSession(a)!.clips[0].flip,'hv');
 setTimelineClipFlip(a,imgId,'none');
 assert.equal(getVideoSession(a)!.clips[0].flip,undefined,'none clears the field');
 setTimelineClipFlip(a,titleId,'h');
 assert.equal(getVideoSession(a)!.clips[1].flip,undefined,'titles stay unflipped');
 assert.ok(videoIsDirty(getVideoSession(a)));
 undoVideoEdit(a);undoVideoEdit(a);
 assert.equal(getVideoSession(a)!.clips[0].flip,'h','undo walks the flips back');
 closeVideo(a);closeMedia(a);
});

test('project: replacing a clip source keeps trim, speed and flip and clamps to the new duration',async()=>{
 setVideoEngineFactory(()=>({async capabilities(){return{webmVideo:'vp9',mp4Video:null,opus:true,aac:false};},async probe(){return{duration:4,video:{codec:'vp9',width:640,height:360,fps:30},audio:null};},async export(){throw new Error('not needed');},cancelExport(){},dispose(){}}));
 for(const n of ['swap-a.mp4','swap-b.mp4']){const r=await addMediaFile(new Blob([bytes(MP4)],{type:'video/mp4'}),n);assert.ok('name' in r,JSON.stringify(r));}
 const itemA=getMedia().items.find(i=>i.name==='swap-a.mp4')!;
 await openVideo(itemA);
 const name='swap-a.mp4';
 trimTimelineClip(name,getVideoSession(name)!.clips[0].id,'in',1);
 const clipId=getVideoSession(name)!.clips[0].id;
 setTimelineClipFlip(name,clipId,'h');
 try{
  const ok=await replaceClipSource(name,clipId,getMedia().items.find(i=>i.name==='swap-b.mp4')!);
  assert.ok(ok);
  const c=getVideoSession(name)!.clips[0];
  assert.equal(c.source,'swap-b.mp4');
  assert.deepEqual([c.in_s,c.out_s],[1,4],'trim kept, clamped into the 4 s replacement');
  assert.equal(c.flip,'h','flip survives');
  assert.equal(await replaceClipSource(name,clipId,getMedia().items.find(i=>i.name==='swap-b.mp4')!),false,'same source is a no-op');
  undoVideoEdit(getVideoSession(name)!.name);
  assert.equal(getVideoSession(name)!.clips[0].source,'swap-a.mp4','undo restores the old source');
 }finally{closeVideo(name);closeVideo('swap-b.mp4');closeMedia(name);closeMedia('swap-b.mp4');}
});

test('project: image clips swap their file, titles refuse a swap',async()=>{
 const a='swap-img.video-project';
 addBlankVideoProject(a);
 await openVideo(getMedia().items.find(i=>i.name===a)!);
 const imgId=addImageClip(a,{name:'one.png'})!;
 addTitleClip(a,Number.MAX_SAFE_INTEGER,{text:'T'});
 const titleId=getVideoSession(a)!.clips[1].id;
 assert.equal(await replaceClipSource(a,imgId,{name:'two.png',url:'',kind:'image'}),true);
 assert.deepEqual([getVideoSession(a)!.clips[0].source,getVideoSession(a)!.clips[0].out_s],['two.png',5],'name swapped, duration kept');
 assert.equal(await replaceClipSource(a,titleId,{name:'x.mp4',url:''}),false,'titles refuse');
 closeVideo(a);closeMedia(a);
});

test('project: clip audio fades set, undo and never get swallowed as no-ops',async()=>{
 const name='fade-a.mp4';
 setVideoEngineFactory(()=>({async capabilities(){return{webmVideo:'vp9',mp4Video:null,opus:true,aac:false};},async probe(){return{duration:6,video:{codec:'vp9',width:640,height:360,fps:30},audio:null};},async export(){throw new Error('not needed');},cancelExport(){},dispose(){}}));
 const r=await addMediaFile(new Blob([bytes(MP4)],{type:'video/mp4'}),name);assert.ok('name' in r,JSON.stringify(r));
 await openVideo(getMedia().items.find(i=>i.name===name)!);
 try{
  const id=getVideoSession(name)!.clips[0].id;
  const before=getVideoSession(name)!.history.past.length;
  setTimelineClipFades(name,id,1,2);
  let c=getVideoSession(name)!.clips[0];
  assert.deepEqual([c.fadeIn??0,c.fadeOut??0],[1,2]);
  assert.equal(getVideoSession(name)!.history.past.length,before+1,'a fade-only edit is recorded, not swallowed');
  setTimelineClipFades(name,id,1,2);
  assert.equal(getVideoSession(name)!.history.past.length,before+1,'repeating the same fades is a no-op');
  setTimelineClipFades(name,id,99,99);
  c=getVideoSession(name)!.clips[0];
  assert.deepEqual([c.fadeIn??0,c.fadeOut??0],[6,0],'fades clamp into the clip length');
  undoVideoEdit(name);
  assert.deepEqual([getVideoSession(name)!.clips[0].fadeIn??0,getVideoSession(name)!.clips[0].fadeOut??0],[1,2],'undo restores the previous fades');
 }finally{closeVideo(name);closeMedia(name);}
});

test('project: freeze frame toggles, re-frames, unfreezes and undoes',async()=>{
 const name='freeze-a.mp4';
 setVideoEngineFactory(()=>({async capabilities(){return{webmVideo:'vp9',mp4Video:null,opus:true,aac:false};},async probe(){return{duration:6,video:{codec:'vp9',width:640,height:360,fps:30},audio:null};},async export(){throw new Error('not needed');},cancelExport(){},dispose(){}}));
 const r=await addMediaFile(new Blob([bytes(MP4)],{type:'video/mp4'}),name);assert.ok('name' in r,JSON.stringify(r));
 await openVideo(getMedia().items.find(i=>i.name===name)!);
 try{
  const id=getVideoSession(name)!.clips[0].id;
  trimTimelineClip(name,id,'in',1);trimTimelineClip(name,id,'out',5);
  const before=getVideoSession(name)!.history.past.length;
  setTimelineClipFreeze(name,id,2);
  let c=getVideoSession(name)!.clips[0];
  assert.deepEqual([c.freeze,c.in_s,c.out_s],[2,0,4],'frame at 2 s, hold keeps the timeline length');
  assert.equal(getVideoSession(name)!.history.past.length,before+1,'freeze-only edit is recorded');
  setTimelineClipFreeze(name,id,3.5);
  assert.equal(getVideoSession(name)!.clips[0].freeze,3.5,'re-framing a frozen clip moves the frame');
  setTimelineClipFreeze(name,id,null);
  c=getVideoSession(name)!.clips[0];
  assert.equal(c.freeze,undefined,'unfrozen');
  assert.deepEqual([c.in_s,c.out_s],[3.5,6],'playback resumes from the frozen frame, clamped to the source');
  undoVideoEdit(name);
  assert.equal(getVideoSession(name)!.clips[0].freeze,3.5,'undo restores the freeze');
 }finally{closeVideo(name);closeMedia(name);}
});
