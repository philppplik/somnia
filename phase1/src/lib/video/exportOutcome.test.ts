import test from 'node:test';
import assert from 'node:assert/strict';
import {addBlankVideoProject,getMedia,closeMedia} from '../media';
import {exportVideoFile,getVideoSession,openVideo,closeVideo,runVideoExport,setVideoEngineFactory,setVideoExportOptions,setVideoExportRange,subscribeVideo} from './session';
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

test('export options default to original/high, clamp to presets and reach the engine',async()=>{
 let seen:unknown;
 setVideoEngineFactory(()=>({...engine(),async export(_s,_c,_f,_p,_a,opts){seen=opts;return{bytes:new Uint8Array([1]).buffer,mime:'video/webm',report:{format:'webm',duration_s:2,bytes:1,videoCodec:'vp9',audioCodec:null,steps:[]}};}}));
 addBlankVideoProject('export-opts.somnia-video');
 const item=getMedia().items.find(i=>i.name===getMedia().active)!;await openVideo(item);addTitleClip(item.name,0);
 try{
  assert.deepEqual(getVideoSession(item.name)!.exportOptions,{scale:1,quality:'high',fps:null},'defaults');
  setVideoExportOptions(item.name,{scale:0.5,quality:'medium'});
  setVideoExportOptions(item.name,{scale:0.7,quality:'ultra' as never});
  assert.deepEqual(getVideoSession(item.name)!.exportOptions,{scale:1,quality:'high',fps:null},'junk values fall back field by field');
  setVideoExportOptions(item.name,{scale:0.25,quality:'low',fps:null});
  assert.equal(await runVideoExport(item.name),'exported');
  assert.deepEqual(seen,{scale:0.25,quality:'low',fps:null},'the engine receives the chosen options');
 }finally{closeVideo(item.name);closeMedia(item.name);}
});

test('export range clamps to the timeline, normalizes a full range away and slices what the engine sees',async()=>{
 let seenClips:unknown,seenAudio:unknown;
 setVideoEngineFactory(()=>({...engine(),async export(_s,c,_f,_p,a){seenClips=c;seenAudio=a;return{bytes:new Uint8Array([1]).buffer,mime:'video/webm',report:{format:'webm',duration_s:2,bytes:1,videoCodec:'vp9',audioCodec:null,steps:[]}};}}));
 addBlankVideoProject('range-opts.somnia-video');
 const item=getMedia().items.find(i=>i.name===getMedia().active)!;await openVideo(item);addTitleClip(item.name,0);
 const name=item.name;
 try{
  setVideoExportRange(name,{start:-5,end:999});
  assert.equal(getVideoSession(name)!.exportRange,null,'a range covering everything normalizes to a full export');
  setVideoExportRange(name,{start:2,end:1});
  assert.equal(getVideoSession(name)!.exportRange,null,'an inverted range is dropped');
  setVideoExportRange(name,{start:1,end:2.5});
  assert.deepEqual(getVideoSession(name)!.exportRange,{start:1,end:2.5});
  assert.equal(await runVideoExport(name),'exported');
  const sc=seenClips as {in_s:number;out_s:number;kind?:string}[];
  assert.equal(sc.length,1);
  assert.deepEqual([sc[0].in_s,sc[0].out_s],[0,1.5],'the title shrinks to the range');
  assert.deepEqual(seenAudio,[]);
  setVideoExportRange(name,null);
  assert.equal(getVideoSession(name)!.exportRange,null);
 }finally{closeVideo(name);closeMedia(name);}
});
