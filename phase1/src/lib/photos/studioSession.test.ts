import test from 'node:test';
import assert from 'node:assert/strict';
import {applyPhotoCrop,beginPhotoGesture,cancelPhotoCrop,closePhoto,commitPhotoSettings,dirtyPhoto,endPhotoGesture,exportPhotoCopy,flipPhoto,getPhotoSession,historyPhoto,openPhoto,previewPhotoSettings,resetPhoto,rotatePhoto,setPhotoCropping,setPhotoCropDraft,setPhotoEngineFactory,type PhotoEngineLike} from './studioSession';
import {neutralPhotoSettings,photoSignature,type PhotoSettings} from './studioSettings';
import type {PhotosResponse} from './engine';
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
/** Fake engine: the rendered "pixels" are the settings signature, so tests see exactly what was rendered. */
function fakeEngine():PhotoEngineLike&{renders:PhotoSettings[]}{
 const renders:PhotoSettings[]=[];
 const res=(settings?:PhotoSettings):PhotosResponse=>({id:0,ok:true,bytes:new TextEncoder().encode(settings?photoSignature(settings):'src').buffer as ArrayBuffer,width:8,height:4});
 return{renders,
  async load(){return res();},
  async renderPhoto(s){renders.push({...s});return res(s);},
  async exportPhoto(s){return res(s);},
  dispose(){}};
}
let engine:ReturnType<typeof fakeEngine>;
const item={name:'photo.png',url:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAECAIAAAA8r6IuAAAAEElEQVR4nGP8z8DwnwEKmBgA3yEBAemZYhMAAAAASUVORK5CYII=',mime:'image/png'};
const open=async()=>{await openPhoto(item);const s=getPhotoSession(item.name);assert.equal(s?.status,'ready');return s!;};
test.beforeEach(()=>{engine=fakeEngine();setPhotoEngineFactory(()=>engine);});
test.afterEach(()=>closePhoto(item.name));
test('open decodes once, renders neutral + current and starts clean',async()=>{
 const s=await open();
 assert.equal(s.sourceWidth,8);assert.equal(s.sourceHeight,4);
 assert.ok(s.original&&s.frame);assert.ok(!dirtyPhoto(s));
 assert.equal(engine.renders.length,2);
});
test('one slider gesture is one undo step; commits are one step each; undo/redo walk in order',async()=>{
 await open();
 beginPhotoGesture(item.name);
 previewPhotoSettings(item.name,s=>({...s,exposure:1}));
 previewPhotoSettings(item.name,s=>({...s,exposure:2}));
 endPhotoGesture(item.name);
 assert.equal(getPhotoSession(item.name)!.past.length,1,'a drag is a single undo step');
 commitPhotoSettings(item.name,s=>({...s,contrast:10}));
 assert.equal(getPhotoSession(item.name)!.past.length,2);
 historyPhoto(item.name,false);assert.equal(getPhotoSession(item.name)!.now.contrast,0);assert.equal(getPhotoSession(item.name)!.now.exposure,2);
 historyPhoto(item.name,false);assert.equal(getPhotoSession(item.name)!.now.exposure,0);
 historyPhoto(item.name,true);assert.equal(getPhotoSession(item.name)!.now.exposure,2);
 historyPhoto(item.name,true);assert.equal(getPhotoSession(item.name)!.now.contrast,10);
 assert.equal(getPhotoSession(item.name)!.future.length,0);
 await wait(250);
 assert.equal(photoSignature(engine.renders.at(-1)!),photoSignature(getPhotoSession(item.name)!.now),'the last render matches the session');
});
test('a no-op gesture and a no-op commit add no history',async()=>{
 await open();
 beginPhotoGesture(item.name);previewPhotoSettings(item.name,s=>({...s}));endPhotoGesture(item.name);
 commitPhotoSettings(item.name,s=>({...s}));
 assert.equal(getPhotoSession(item.name)!.past.length,0);
});
test('crop mode renders the whole frame, apply is one step, rotate resets the crop',async()=>{
 await open();
 commitPhotoSettings(item.name,s=>({...s,crop:{x0:0.1,y0:0.1,x1:0.5,y1:0.5}}));
 setPhotoCropping(item.name,true);
 await wait(250);
 assert.equal(engine.renders.at(-1)!.crop,null,'crop mode previews the full frame');
 setPhotoCropDraft(item.name,{x0:0.2,y0:0.2,x1:0.8,y1:0.9});
 const before=getPhotoSession(item.name)!.past.length;
 applyPhotoCrop(item.name);
 const s=getPhotoSession(item.name)!;
 assert.deepEqual(s.now.crop,{x0:0.2,y0:0.2,x1:0.8,y1:0.9});assert.equal(s.cropping,false);assert.equal(s.past.length,before+1);
 rotatePhoto(item.name,1);
 assert.equal(getPhotoSession(item.name)!.now.orientation,1);assert.equal(getPhotoSession(item.name)!.now.crop,null,'rotating resets the crop frame');
 rotatePhoto(item.name,-1);rotatePhoto(item.name,-1);
 assert.equal(getPhotoSession(item.name)!.now.orientation,3,'counter-clockwise rotation wraps 0 to 270');
 flipPhoto(item.name,'h');assert.equal(getPhotoSession(item.name)!.now.flipH,true);
 resetPhoto(item.name);assert.equal(photoSignature(getPhotoSession(item.name)!.now),photoSignature(neutralPhotoSettings));
});
test('cancel crop keeps the previous crop and adds no history',async()=>{
 await open();
 commitPhotoSettings(item.name,s=>({...s,crop:{x0:0.1,y0:0.1,x1:0.5,y1:0.5}}));
 const before=getPhotoSession(item.name)!.past.length;
 setPhotoCropping(item.name,true);setPhotoCropDraft(item.name,{x0:0.3,y0:0.3,x1:0.6,y1:0.6});
 cancelPhotoCrop(item.name);
 const s=getPhotoSession(item.name)!;
 assert.deepEqual(s.now.crop,{x0:0.1,y0:0.1,x1:0.5,y1:0.5});assert.equal(s.past.length,before);
});
test('a near-full draft crop applies as no crop',async()=>{
 await open();
 setPhotoCropping(item.name,true);setPhotoCropDraft(item.name,{x0:0,y0:0,x1:1,y1:1});
 applyPhotoCrop(item.name);
 assert.equal(getPhotoSession(item.name)!.now.crop,null);
});
test('dirty tracks unexported edits; a successful export marks them saved',async()=>{
 await open();
 commitPhotoSettings(item.name,s=>({...s,exposure:1}));
 assert.ok(dirtyPhoto(getPhotoSession(item.name)!));
 const saved:{name?:string}={};
 const out=await exportPhotoCopy(item.name,'png',{save:async(_b,suggested)=>{saved.name=suggested;return true;}});
 assert.equal(out,'saved');assert.equal(saved.name,'photo-edited.png');
 assert.ok(!dirtyPhoto(getPhotoSession(item.name)!));
 // a cancelled export keeps the edits dirty
 commitPhotoSettings(item.name,s=>({...s,exposure:2}));
 const cancelled=await exportPhotoCopy(item.name,'jpeg',{save:async()=>false});
 assert.equal(cancelled,'cancelled');assert.ok(dirtyPhoto(getPhotoSession(item.name)!));
});
test('unsupported mime and engine failures become honest error states',async()=>{
 await openPhoto({name:'a.webp',url:item.url,mime:'image/webp'});
 assert.equal(getPhotoSession('a.webp')?.status,'error');
 assert.match(getPhotoSession('a.webp')!.error,/JPEG and PNG/);
 closePhoto('a.webp');
});
