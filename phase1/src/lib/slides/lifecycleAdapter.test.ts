import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {addMediaFile,clearMedia,findMedia} from '../media';
import {createSlidesLifecycleAdapter,restoreSlidesCheckpoint,slidesCheckpointPayload,dirtySlideNames} from './session';
import {fingerprintOf,sealSnapshot} from '../lifecycle/recipeKit';
import {getRegisteredLifecycleAdapter} from '../lifecycle/adapters';

test.afterEach(()=>clearMedia());

test('the Slides adapter is registered for the slides studio',()=>{assert.ok(getRegisteredLifecycleAdapter('slides'));});

test('with no open decks the checkpoint is empty, verified and the studio is evictable',async()=>{
 const adapter=createSlidesLifecycleAdapter();
 assert.deepEqual(slidesCheckpointPayload(),{decks:[]});
 assert.equal(adapter.hasUnsavedChanges!(),false);
 assert.deepEqual(adapter.pinReasons!(),[]);
 assert.equal(adapter.estimateBytes!(),0);
 const snap=(await adapter.snapshot!())!;
 assert.equal(snap.studioId,'slides');
 await adapter.suspend!();
 await adapter.resume!(snap);
 await adapter.dispose!();
});

test('corrupted, foreign and malformed checkpoints are refused',async()=>{
 const adapter=createSlidesLifecycleAdapter();
 const snap=(await adapter.snapshot!())!;
 await assert.rejects(()=>adapter.resume!({...snap,checksum:'bad'}),/verification/);
 await assert.rejects(()=>adapter.resume!({...snap,studioId:'photos'}),/belongs to/);
 const malformed=sealSnapshot({studioId:'slides',schemaVersion:1,revision:1,payload:{nope:true},bytesEstimate:1});
 await assert.rejects(()=>adapter.resume!(malformed),/no decks/);
});

test('restore skips decks whose file was closed or replaced, and keeps clean decks lightweight',async()=>{
 const r=await addMediaFile(new Blob([new Uint8Array(readFileSync(new URL('../../../slides-engine/fixtures/table.pptx',import.meta.url)))]),'deck.pptx');
 assert.ok('name' in r,JSON.stringify(r));
 const item=findMedia('deck.pptx')!;
 assert.equal(item.kind,'pptx');
 // Clean deck with the right fingerprint: only the viewed slide is remembered, no engine is started.
 await restoreSlidesCheckpoint({decks:[{name:'deck.pptx',fingerprint:fingerprintOf(item.url),index:2,dirty:false}]});
 // Unknown file and wrong fingerprint are dropped without registering sessions.
 await restoreSlidesCheckpoint({decks:[
  {name:'gone.pptx',fingerprint:'x',index:0,dirty:true,original:new Uint8Array(1),working:new Uint8Array(1),undo:[],redo:[]},
  {name:'deck.pptx',fingerprint:'stale',index:0,dirty:true,original:new Uint8Array(1),working:new Uint8Array(1),undo:[],redo:[]},
 ]});
 assert.deepEqual(dirtySlideNames(),[]);
 assert.deepEqual(slidesCheckpointPayload(),{decks:[]});
});
