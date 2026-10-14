import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {jobScheduler} from '../jobs/scheduler';
import {openVideo,setVideoEngineFactory,runVideoExport,trimTimelineClip,setVideoFormat,closeVideo,getVideoSession,cancelVideoExport} from './session';
import type {VideoEngineLike} from './engine';
const file=readFileSync(new URL('../../../tests/assets/clip.webm',import.meta.url));
function fixture(){
 let captured:unknown;let exports=0;
 const engine:VideoEngineLike={async probe(){return{duration:2,video:{codec:'vp9',width:320,height:180,fps:25},audio:null};},async capabilities(){return{webmVideo:'vp9',mp4Video:null,opus:true,aac:false};},async export(_sources,clips,format){exports++;captured={clips,format};return{bytes:new ArrayBuffer(4),mime:'video/webm',report:{format:'webm',duration_s:2,bytes:4,videoCodec:'vp9',audioCodec:null,steps:[]}};},cancelExport(){},dispose(){}};
 return {engine,get captured(){return captured;},get exports(){return exports;}};
}
test('queued export captures timeline/format, not later edits or active studio',async()=>{
 const f=fixture();setVideoEngineFactory(()=>f.engine);const url=URL.createObjectURL(new Blob([file]));
 await openVideo({name:'snapshot.webm',url});
 const block=await jobScheduler.acquire({kind:'export',priority:2,exclusive:['video.export']});
 const pending=runVideoExport('snapshot.webm');
 trimTimelineClip('snapshot.webm',getVideoSession('snapshot.webm')!.clips[0].id,'in',.5);setVideoFormat('snapshot.webm','mp4');
 assert.equal(f.exports,0);assert.equal(jobScheduler.needsResource('video.source:snapshot.webm'),true);
 block.release();assert.equal(await pending,'exported');
 const captured=f.captured as {clips:{in_s:number}[];format:string};assert.equal(captured.clips[0].in_s,0);assert.equal(captured.format,'webm');
 closeVideo('snapshot.webm');URL.revokeObjectURL(url);
});
test('cancelled queued export never enters engine and clears ownership',async()=>{
 const f=fixture();setVideoEngineFactory(()=>f.engine);const url=URL.createObjectURL(new Blob([file]));await openVideo({name:'cancel.webm',url});
 const block=await jobScheduler.acquire({kind:'export',priority:2,exclusive:['video.export']});const pending=runVideoExport('cancel.webm');cancelVideoExport('cancel.webm');
 assert.equal(await pending,'cancelled');assert.equal(f.exports,0);assert.equal(jobScheduler.needsResource('video.source:cancel.webm'),false);block.release();closeVideo('cancel.webm');URL.revokeObjectURL(url);
});
