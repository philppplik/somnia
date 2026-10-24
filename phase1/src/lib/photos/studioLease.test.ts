import test from 'node:test';
import assert from 'node:assert/strict';
import {closePhoto,commitPhotoSettings,exportPhotoCopy,getPhotoSession,openPhoto,setPhotoEngineFactory,type PhotoEngineLike} from './studioSession';
import type {PhotoSettings} from './studioSettings';
import type {PhotosResponse} from './engine';
import {jobScheduler} from '../jobs/scheduler';

const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return {promise,resolve};};
function fakeEngine():PhotoEngineLike&{renders:PhotoSettings[];exports:number}{
 const renders:PhotoSettings[]=[];let exports=0;
 const res=():PhotosResponse=>({id:0,ok:true,bytes:new TextEncoder().encode('x').buffer as ArrayBuffer,width:8,height:4});
 return{renders,get exports(){return exports;},
  async load(){return res();},
  async renderPhoto(s){renders.push({...s});return res();},
  async exportPhoto(){exports++;return res();},
  dispose(){}};
}
let engine:ReturnType<typeof fakeEngine>;
const item=(name:string)=>({name,url:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAECAIAAAA8r6IuAAAAEElEQVR4nGP8z8DwnwEKmBgA3yEBAemZYhMAAAAASUVORK5CYII=',mime:'image/png'});
test.beforeEach(()=>{engine=fakeEngine();setPhotoEngineFactory(()=>engine);});
test.afterEach(()=>{closePhoto('a.png');closePhoto('b.png');});

test('photo activation queues behind a held photos.engine block instead of interleaving engine state',async()=>{
 const gate=deferred();
 const block=jobScheduler.run({kind:'export',priority:2,documentId:'blocker',exclusive:['photos.engine']},()=>gate.promise);
 const opening=openPhoto(item('a.png'));
 await wait(50);
 assert.equal(getPhotoSession('a.png')?.status,'loading','activation waits for the engine lease');
 assert.equal(engine.renders.length,0,'no engine work runs while the block holds the singleton');
 const queued=jobScheduler.list().find(r=>r.state==='queued'&&r.resources.includes('photos.engine'));
 assert.ok(queued,'the activation is visible as a queued photos.engine job');
 gate.resolve();await block;await opening;
 assert.equal(getPhotoSession('a.png')?.status,'ready');
 assert.equal(engine.renders.length,2);
});

test('photo export waits for the engine block, then saves exactly once',async()=>{
 await openPhoto(item('b.png'));
 const gate=deferred();
 const block=jobScheduler.run({kind:'export',priority:2,documentId:'blocker',exclusive:['photos.engine']},()=>gate.promise);
 let saved=0;
 const exporting=exportPhotoCopy('b.png','png',{save:async()=>{saved++;return true;}});
 await wait(50);
 assert.equal(saved,0,'the export cannot touch the engine while the block holds it');
 assert.equal(engine.exports,0);
 gate.resolve();await block;
 assert.equal(await exporting,'saved');
 assert.equal(saved,1);
 assert.equal(engine.exports,1);
});
