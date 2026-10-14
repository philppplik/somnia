import test from 'node:test';
import assert from 'node:assert/strict';
import {addBlankVideoProject,getMedia,closeMedia} from '../media';
import {exportVideoFile,getVideoSession,openVideo,closeVideo,setVideoEngineFactory,subscribeVideo} from './session';
import {addTitleClip} from './titleSession';
import type {VideoEngineLike} from './engine';
const engine=(cancel=false):VideoEngineLike=>({
 async capabilities(){return {webmVideo:'vp9',mp4Video:null,opus:true,aac:false};},
 async probe(){throw new Error('Title-only project needs no media probe.');},
 async export(){if(cancel)throw Object.assign(new Error('cancelled'),{name:'ExportCancelled'});return {bytes:new Uint8Array([1]).buffer,mime:'video/webm',report:{format:'webm',duration_s:2,bytes:1,videoCodec:'vp9',audioCodec:null,steps:[]}};},
 cancelExport(){},dispose(){}
});
test('download notification belongs to the video session and survives switching UI hosts',async()=>{
 setVideoEngineFactory(()=>engine());addBlankVideoProject('download-notice.somnia-video');
 const item=getMedia().items.find(i=>i.name===getMedia().active)!;await openVideo(item);addTitleClip(item.name,0);
 const originalDocument=globalThis.document;let clicks=0;
 Object.defineProperty(globalThis,'document',{configurable:true,value:{createElement:()=>({href:'',download:'',click(){clicks++;}})}});
 const changes:(string|undefined)[]=[];const off=subscribeVideo(()=>changes.push(getVideoSession(item.name)?.exportOutcome));
 try{
  assert.equal(await exportVideoFile(item.name),'downloaded');assert.equal(clicks,1);
  assert.equal(getVideoSession(item.name)?.exportOutcome,'downloaded');assert.equal(changes.at(-1),'downloaded');
 }finally{off();Object.defineProperty(globalThis,'document',{configurable:true,value:originalDocument});closeVideo(item.name);closeMedia(item.name);}
});
test('cancelled and unavailable exports never claim a download',async()=>{
 setVideoEngineFactory(()=>engine(true));addBlankVideoProject('cancel-notice.somnia-video');
 const item=getMedia().items.find(i=>i.name===getMedia().active)!;await openVideo(item);
 try{
  assert.equal(await exportVideoFile(item.name),'unavailable');assert.equal(getVideoSession(item.name)?.exportOutcome,'unavailable');
  addTitleClip(item.name,0);assert.equal(await exportVideoFile(item.name),'cancelled');assert.equal(getVideoSession(item.name)?.exportOutcome,'cancelled');
  assert.equal(getVideoSession(item.name)?.result,null);
 }finally{closeVideo(item.name);closeMedia(item.name);}
});
