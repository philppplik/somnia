import test from 'node:test';
import assert from 'node:assert/strict';
import {addBlankVideoProject,closeMedia,getMedia} from '../media';
import {closeVideo,editTimeline,getVideoSession,openVideo,redoVideoEdit,resetTimeline,undoVideoEdit,videoCanRedo,videoCanUndo} from './session';
import {addTitleClip,updateTitle} from './titleSession';
import {VIDEO_HISTORY_LIMIT} from './history';
const open=async(name:string)=>{
 addBlankVideoProject(name);
 const item=getMedia().items.find(i=>i.name===name)!;
 await openVideo(item);
 return name;
};

test('session: edits record undo steps, undo and redo restore them',async()=>{
 const name=await open('undo-session.somnia-video');
 try{
  assert.ok(!videoCanUndo(getVideoSession(name)));
  addTitleClip(name,Number.MAX_SAFE_INTEGER,{text:'one'});
  addTitleClip(name,Number.MAX_SAFE_INTEGER,{text:'two'});
  assert.equal(getVideoSession(name)!.clips.length,2);
  assert.ok(videoCanUndo(getVideoSession(name)));
  undoVideoEdit(name);
  assert.equal(getVideoSession(name)!.clips.length,1);
  assert.ok(videoCanRedo(getVideoSession(name)));
  undoVideoEdit(name);
  assert.equal(getVideoSession(name)!.clips.length,0);
  assert.ok(!videoCanUndo(getVideoSession(name)),'the open state is the floor');
  redoVideoEdit(name);
  assert.equal(getVideoSession(name)!.clips.length,1);
  redoVideoEdit(name);
  assert.equal(getVideoSession(name)!.clips.length,2);
  assert.ok(!videoCanRedo(getVideoSession(name)));
 }finally{closeVideo(name);closeMedia(name);}
});

test('session: a new edit clears the redo branch, reset is one undoable step',async()=>{
 const name=await open('undo-fork.somnia-video');
 try{
  addTitleClip(name,Number.MAX_SAFE_INTEGER,{text:'a'});
  undoVideoEdit(name);
  addTitleClip(name,Number.MAX_SAFE_INTEGER,{text:'b'});
  assert.ok(!videoCanRedo(getVideoSession(name)),'the fork drops the redo branch');
  assert.equal(getVideoSession(name)!.clips[0].title?.text,'b');
  resetTimeline(name);
  assert.equal(getVideoSession(name)!.clips.length,0);
  undoVideoEdit(name);
  assert.equal(getVideoSession(name)!.clips.length,1,'reset is one undo step back');
 }finally{closeVideo(name);closeMedia(name);}
});

test('session: a repeated gesture key coalesces, no-op edits record nothing',async()=>{
 const name=await open('undo-gesture.somnia-video');
 try{
  addTitleClip(name,Number.MAX_SAFE_INTEGER,{text:'x'});
  const id=getVideoSession(name)!.clips[0].id;
  const base=getVideoSession(name)!.history.past.length;
  updateTitle(name,id,{text:'xy'},`title:${id}`);
  updateTitle(name,id,{text:'xyz'},`title:${id}`);
  updateTitle(name,id,{text:'xyz!'},`title:${id}`);
  assert.equal(getVideoSession(name)!.history.past.length,base+1,'three keystrokes in one gesture window are one undo step');
  undoVideoEdit(name);
  assert.equal(getVideoSession(name)!.clips[0].title?.text,'x','the whole typing gesture undoes at once');
  redoVideoEdit(name);
  const before=getVideoSession(name)!.history.past.length;
  editTimeline(name,clips=>clips.map(c=>({...c})));
  assert.equal(getVideoSession(name)!.history.past.length,before,'a value-identical edit records no step');
 }finally{closeVideo(name);closeMedia(name);}
});

test('session: the history caps at the limit',async()=>{
 const name=await open('undo-cap.somnia-video');
 try{
  addTitleClip(name,Number.MAX_SAFE_INTEGER,{text:'x'});
  const id=getVideoSession(name)!.clips[0].id;
  for(let i=0;i<VIDEO_HISTORY_LIMIT+3;i++)updateTitle(name,id,{text:'t'+i});
  assert.equal(getVideoSession(name)!.history.past.length,VIDEO_HISTORY_LIMIT,'oldest steps drop first');
 }finally{closeVideo(name);closeMedia(name);}
});
