import test from 'node:test';
import assert from 'node:assert/strict';
import {addBlankVideoProject,clearMedia,closeMedia,getMedia} from '../media';
import {addTitleClip} from './titleSession';
import {closeVideo,createVideoLifecycleAdapter,getVideoSession,openVideo,pendingVideoRecipes,sanitizeVideoRecipe,setVideoFormat,undoVideoEdit,videoIsDirty} from './session';
import {getRegisteredLifecycleAdapter} from '../lifecycle/adapters';

const NAME='lc.video-project';
const open=async()=>{addBlankVideoProject(NAME);await openVideo(getMedia().items.find(i=>i.name===NAME)!);const s=getVideoSession(NAME)!;assert.equal(s.status,'ready');return s;};
test.afterEach(()=>{closeVideo(NAME);closeMedia(NAME);clearMedia();});

test('the Video adapter is registered for the video studio',()=>{assert.ok(getRegisteredLifecycleAdapter('video'));});

test('timeline, format and undo history survive suspend and resume once the project re-opens',async()=>{
 const adapter=createVideoLifecycleAdapter();
 await open();
 addTitleClip(NAME,Number.MAX_SAFE_INTEGER,{text:'Intro',size:90});
 addTitleClip(NAME,Number.MAX_SAFE_INTEGER,{text:'Outro',size:90});
 undoVideoEdit(NAME);
 setVideoFormat(NAME,'mp4');
 assert.equal(adapter.hasUnsavedChanges!(),true);
 const snap=(await adapter.snapshot!())!;
 await adapter.suspend!();
 assert.equal(getVideoSession(NAME),null,'session released');
 assert.equal(pendingVideoRecipes(),1);
 await adapter.resume!(snap);
 await openVideo(getMedia().items.find(i=>i.name===NAME)!);
 const s=getVideoSession(NAME)!;
 assert.equal(s.status,'ready');
 assert.equal(s.clips.length,1);assert.equal(s.clips[0].title?.text,'Intro');
 assert.equal(s.format,'mp4');
 assert.equal(s.history.future.length,1,'redo survived');
 assert.ok(videoIsDirty(s));
 assert.equal(pendingVideoRecipes(),0);
});

test('a clean project is not checkpointed and can be evicted',async()=>{
 const adapter=createVideoLifecycleAdapter();
 await open();
 assert.equal(adapter.hasUnsavedChanges!(),false);
 assert.deepEqual(((await adapter.snapshot!())!.payload as {entries:unknown[]}).entries,[]);
 await adapter.dispose!();
 assert.equal(getVideoSession(NAME),null);
});

test('edited projects refuse eviction and an export in flight pins the studio',async()=>{
 const adapter=createVideoLifecycleAdapter();
 await open();
 addTitleClip(NAME,Number.MAX_SAFE_INTEGER,{text:'T',size:90});
 await assert.rejects(()=>adapter.dispose!(),/Refusing/);
 assert.deepEqual(adapter.pinReasons!(),[]);
 const s=getVideoSession(NAME)!;
 (s as {status:string}).status='exporting';
 assert.ok(adapter.pinReasons!().includes('video-export'));
 (s as {status:string}).status='ready';
});

test('checkpoint recipes are validated and corrupted checkpoints are refused',async()=>{
 assert.equal(sanitizeVideoRecipe(null),null);
 assert.equal(sanitizeVideoRecipe({clips:[],audioClips:[],overlayClips:[],savedSig:'x',format:'mp4',history:{past:'no',future:[]}}),null);
 const adapter=createVideoLifecycleAdapter();
 await open();
 addTitleClip(NAME,Number.MAX_SAFE_INTEGER,{text:'T',size:90});
 const a=(await adapter.snapshot!())!;
 setVideoFormat(NAME,'webm');
 const b=(await adapter.snapshot!())!;
 assert.ok(b.revision>a.revision);
 await assert.rejects(()=>adapter.resume!({...a,checksum:'bad'}),/verification/);
});

test('an early re-open between suspend and resume still receives the stashed recipe',async()=>{
 const adapter=createVideoLifecycleAdapter();
 await open();
 addTitleClip(NAME,Number.MAX_SAFE_INTEGER,{text:'Early',size:90});
 const snap=(await adapter.snapshot!())!;
 await adapter.suspend!();
 await openVideo(getMedia().items.find(i=>i.name===NAME)!); // shell preview race
 const early=getVideoSession(NAME)!;
 assert.equal(early.clips.length,1,'recipe was already waiting for the early re-open');
 assert.equal(early.clips[0].title?.text,'Early');
 await adapter.resume!(snap); // late resume must not clobber the live session
 assert.equal(getVideoSession(NAME)!.clips.length,1);
 closeVideo(NAME);
 await openVideo(getMedia().items.find(i=>i.name===NAME)!); // drain the re-stashed recipe
 assert.equal(getVideoSession(NAME)!.clips.length,1);
 assert.equal(pendingVideoRecipes(),0);
});
