import test from 'node:test';
import assert from 'node:assert/strict';
import {closePhoto,commitPhotoSettings,exportPhotoCopy,openPhoto,setPhotoEngineFactory,type PhotoEngineLike} from './studioSession';
import type {PhotosResponse} from './engine';
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
/** Fake engine recording the byte length of every load, so tests see which source the singleton holds. */
function fakeEngine(){
 const loads:number[]=[];
 const res=():PhotosResponse=>({id:0,ok:true,bytes:new Uint8Array(8*4*4).buffer,width:8,height:4});
 return{loads,
  async load(bytes:ArrayBuffer){loads.push(bytes.byteLength);return res();},
  async renderPhoto(){return res();},
  async exportPhoto(){return res();},
  dispose(){}};
}
let engine:ReturnType<typeof fakeEngine>;
const itemA={name:'reload-a.png',url:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAECAIAAAA8r6IuAAAAEElEQVR4nGP8z8DwnwEKmBgA3yEBAemZYhMAAAAASUVORK5CYII=',mime:'image/png'};
const itemB={name:'reload-b.png',url:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',mime:'image/png'};
let lenA=0,lenB=0;
test.before(async()=>{
 lenA=await fetch(itemA.url).then(r=>r.arrayBuffer()).then(b=>b.byteLength);
 lenB=await fetch(itemB.url).then(r=>r.arrayBuffer()).then(b=>b.byteLength);
 assert.notEqual(lenA,lenB,'the two fixtures must differ in size');
});
test.beforeEach(()=>{engine=fakeEngine();setPhotoEngineFactory(()=>engine);});
test.afterEach(()=>{closePhoto(itemA.name);closePhoto(itemB.name);});
test('editing a photo after another was opened reloads its source first',async()=>{
 await openPhoto(itemA);await openPhoto(itemB);
 assert.deepEqual(engine.loads,[lenA,lenB]);
 commitPhotoSettings(itemA.name,s=>({...s,exposure:1}));
 await wait(250);
 assert.deepEqual(engine.loads,[lenA,lenB,lenA],'render of A reloads A after B was loaded');
 commitPhotoSettings(itemA.name,s=>({...s,exposure:2}));
 await wait(250);
 assert.deepEqual(engine.loads,[lenA,lenB,lenA],'no reload while the same source stays loaded');
 commitPhotoSettings(itemB.name,s=>({...s,contrast:5}));
 await wait(250);
 assert.deepEqual(engine.loads,[lenA,lenB,lenA,lenB],'switching back to B reloads B');
});
test('exporting a photo that is not the loaded one reloads its source first',async()=>{
 await openPhoto(itemA);await openPhoto(itemB);
 const r=await exportPhotoCopy(itemA.name,'png',{save:async()=>true});
 assert.equal(r,'saved');
 assert.deepEqual(engine.loads,[lenA,lenB,lenA]);
});
