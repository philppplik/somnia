import test from 'node:test';
import assert from 'node:assert/strict';
import {closePhoto,commitPhotoSettings,dirtyPhoto,getPhotoSession,historyPhoto,openPhoto,pendingPhotoRecipes,sanitizePhotoRecipe,setPhotoEngineFactory,createPhotosLifecycleAdapter,beginPhotoGesture,endPhotoGesture,type PhotoEngineLike} from './studioSession';
import {getRegisteredLifecycleAdapter} from '../lifecycle/adapters';
import type {PhotosResponse} from './engine';

const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAECAIAAAA8r6IuAAAAEElEQVR4nGP8z8DwnwEKmBgA3yEBAemZYhMAAAAASUVORK5CYII=';
const OTHER='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';
const item={name:'photo.png',url:PNG,mime:'image/png'};
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const res=():PhotosResponse=>({id:0,ok:true,bytes:new Uint8Array(32).buffer as ArrayBuffer,width:8,height:4});
const fake=():PhotoEngineLike=>({async load(){return res();},async renderPhoto(){return res();},async exportPhoto(){return res();},dispose(){}});
test.beforeEach(()=>setPhotoEngineFactory(fake));
test.afterEach(()=>{closePhoto(item.name);});

test('the Photos adapter is registered for the photos studio',()=>{assert.ok(getRegisteredLifecycleAdapter('photos'));});

test('suspend and resume keep develop settings and undo history; they come back when the same file re-opens',async()=>{
 const adapter=createPhotosLifecycleAdapter();
 await openPhoto(item);
 commitPhotoSettings(item.name,s=>({...s,exposure:1}));
 commitPhotoSettings(item.name,s=>({...s,contrast:20}));
 historyPhoto(item.name,false);
 assert.equal(adapter.hasUnsavedChanges!(),true);
 const snap=(await adapter.snapshot!())!;
 await adapter.suspend!();
 assert.equal(getPhotoSession(item.name),null,'the session and its frames are released');
 assert.equal(pendingPhotoRecipes(),1);
 await adapter.resume!(snap);
 await openPhoto(item);
 const s=getPhotoSession(item.name)!;
 assert.equal(s.status,'ready');
 assert.equal(s.now.exposure,1);assert.equal(s.now.contrast,0);
 assert.equal(s.past.length,1);assert.equal(s.future.length,1);
 assert.ok(dirtyPhoto(s),'the edit is still unexported');
 assert.equal(pendingPhotoRecipes(),0);
});

test('a different file under the same name does not inherit the old edit',async()=>{
 const adapter=createPhotosLifecycleAdapter();
 await openPhoto(item);
 commitPhotoSettings(item.name,s=>({...s,exposure:2}));
 const snap=(await adapter.snapshot!())!;await adapter.suspend!();await adapter.resume!(snap);
 await openPhoto({...item,url:OTHER});
 assert.equal(getPhotoSession(item.name)!.now.exposure,0);
 assert.equal(pendingPhotoRecipes(),0,'the stale recipe is discarded');
});

test('untouched sessions are not checkpointed and a clean studio can be evicted',async()=>{
 const adapter=createPhotosLifecycleAdapter();
 await openPhoto(item);
 assert.equal(adapter.hasUnsavedChanges!(),false);
 const snap=(await adapter.snapshot!())!;
 assert.deepEqual((snap.payload as {entries:unknown[]}).entries,[]);
 await adapter.dispose!();
 assert.equal(getPhotoSession(item.name),null);
});

test('edited studios refuse eviction; a drag in progress and a render in flight pin the studio',async()=>{
 const adapter=createPhotosLifecycleAdapter();
 await openPhoto(item);
 commitPhotoSettings(item.name,s=>({...s,exposure:1}));
 await assert.rejects(()=>adapter.dispose!(),/Refusing/);
 await wait(250);
 assert.deepEqual(adapter.pinReasons!(),[]);
 beginPhotoGesture(item.name);
 assert.ok(adapter.pinReasons!().includes('edit-gesture'));
 endPhotoGesture(item.name);
 assert.deepEqual(adapter.pinReasons!(),[]);
});

test('the snapshot revision moves with edits and a corrupted checkpoint is refused',async()=>{
 const adapter=createPhotosLifecycleAdapter();
 await openPhoto(item);
 const a=(await adapter.snapshot!())!;
 commitPhotoSettings(item.name,s=>({...s,exposure:3}));
 const b=(await adapter.snapshot!())!;
 assert.ok(b.revision>a.revision);
 assert.ok(b.bytesEstimate>0);
 await assert.rejects(()=>adapter.resume!({...b,payload:{entries:[]}}),/verification/);
});

test('recipes from a checkpoint are validated',()=>{
 assert.equal(sanitizePhotoRecipe(null),null);
 assert.equal(sanitizePhotoRecipe({now:{exposure:1},saved:5}),null);
});
