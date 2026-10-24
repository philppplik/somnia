import test from 'node:test';
import assert from 'node:assert/strict';
import {closeSound,createSoundLifecycleAdapter,getSoundSession,openSound,pendingSoundRecipes,sanitizeSoundRecipe,setSoundEngineFactory,setSoundSelection,updateSoundSettings} from './session';
import {getRegisteredLifecycleAdapter} from '../lifecycle/adapters';
import type {SoundEngineLike} from './engine';

const stats={frames:100,sample_rate:100,channels:1,duration_s:10,peak_db:-3,rms_db:-12};
const wav=()=>new Uint8Array(44).buffer as ArrayBuffer;
const fake=():SoundEngineLike=>({async init(){return [];},async process(){return{wav:wav(),peaks:new Float32Array(4),report:{format:'wav',input:stats,output:stats,trimmed_range:null,steps:[],wav_bytes:44},ms:1};},dispose(){}});
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const A={name:'a.wav',url:'data:audio/wav;base64,UklGRg=='};
const B={name:'a.wav',url:'data:audio/wav;base64,UklGRgAA'};
test.beforeEach(()=>setSoundEngineFactory(fake));
test.afterEach(()=>closeSound(A.name));

test('the Sound adapter is registered for the sound studio',()=>{assert.ok(getRegisteredLifecycleAdapter('sound'));});

test('effect settings and the pending selection come back when the same file re-opens',async()=>{
 const adapter=createSoundLifecycleAdapter();
 await openSound(A);
 updateSoundSettings(A.name,s=>({...s,pitch:5}));
 setSoundSelection(A.name,{start:1,end:3});
 await wait(300);
 assert.equal(adapter.hasUnsavedChanges!(),true);
 const snap=(await adapter.snapshot!())!;
 await adapter.suspend!();
 assert.equal(getSoundSession(A.name),null,'rendered versions and source bytes are released');
 assert.equal(pendingSoundRecipes(),1);
 await adapter.resume!(snap);
 await openSound(A);
 const s=getSoundSession(A.name)!;
 assert.equal(s.status,'ready');
 assert.equal(s.settings.pitch,5);
 assert.deepEqual(s.selection,{start:1,end:3});
 assert.equal(pendingSoundRecipes(),0);
});

test('a different file under the same name does not inherit the old settings',async()=>{
 const adapter=createSoundLifecycleAdapter();
 await openSound(A);
 updateSoundSettings(A.name,s=>({...s,pitch:2}));
 await wait(300);
 const snap=(await adapter.snapshot!())!;await adapter.suspend!();await adapter.resume!(snap);
 await openSound(B);
 assert.equal(getSoundSession(A.name)!.settings.pitch,0);
 assert.equal(pendingSoundRecipes(),0);
});

test('a neutral session is not checkpointed; an edited one refuses eviction',async()=>{
 const adapter=createSoundLifecycleAdapter();
 await openSound(A);
 assert.equal(adapter.hasUnsavedChanges!(),false);
 assert.deepEqual(((await adapter.snapshot!())!.payload as {entries:unknown[]}).entries,[]);
 updateSoundSettings(A.name,s=>({...s,pitch:1}));
 await assert.rejects(()=>adapter.dispose!(),/Refusing/);
});

test('a render in flight pins the studio; playback leases are listed as resources',async()=>{
 const adapter=createSoundLifecycleAdapter();
 await openSound(A);
 updateSoundSettings(A.name,s=>({...s,pitch:1}));
 assert.ok(adapter.pinReasons!().includes('render-scheduled'));
 await wait(400);
 assert.deepEqual(adapter.pinReasons!(),[]);
 assert.ok(adapter.resourceIds!().includes(`sound.playback:${A.name}`));
 assert.ok(adapter.estimateBytes!()>0);
});

test('recipes are validated, corrupted checkpoints refused, revision moves with edits',async()=>{
 assert.equal(sanitizeSoundRecipe(null),null);
 assert.equal(sanitizeSoundRecipe({settings:5}),null);
 const adapter=createSoundLifecycleAdapter();
 await openSound(A);
 const a=(await adapter.snapshot!())!;
 updateSoundSettings(A.name,s=>({...s,pitch:4}));
 const b=(await adapter.snapshot!())!;
 assert.ok(b.revision>a.revision);
 await assert.rejects(()=>adapter.resume!({...b,checksum:'bad'}),/verification/);
});
test('an early re-open between suspend and resume still receives the stashed recipe',async()=>{
 const adapter=createSoundLifecycleAdapter();
 await openSound(A);
 updateSoundSettings(A.name,s=>({...s,pitch:3}));
 await wait(300);
 const snap=(await adapter.snapshot!())!;
 await adapter.suspend!(); // suspend stashes live recipes before releasing sessions
 await openSound(A); // shell preview race: the file re-opens before resume
 assert.equal(getSoundSession(A.name)!.settings.pitch,3,'stashed recipe applied to the early re-open');
 await adapter.resume!(snap);
 assert.equal(getSoundSession(A.name)!.settings.pitch,3);
});
