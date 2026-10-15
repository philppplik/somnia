import test from 'node:test';
import assert from 'node:assert/strict';
import {addBlankVideoProject,addMediaFile,closeMedia,getMedia} from '../media';
import {closeVideo,dirtyVideoNames,getVideoSession,openVideo,serializeVideoProjectCopy,setVideoFormat,videoIsDirty} from './session';
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
