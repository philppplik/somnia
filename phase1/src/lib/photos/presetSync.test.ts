import test from 'node:test';
import assert from 'node:assert/strict';
import {closePhoto,commitPhotoSettings,getPhotoSession,setPhotoEngineFactory,type PhotoEngineLike} from './studioSession';
import {photoSignature,type PhotoSettings} from './studioSettings';
import {syncLookToPhotos} from './batchExport';
import {BUILT_IN_PRESETS} from './presets';
import type {PhotosResponse} from './engine';
import type {MediaItem} from '../media';

const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
function fakeEngine():PhotoEngineLike{
 const res=(settings?:PhotoSettings):PhotosResponse=>({id:0,ok:true,bytes:new TextEncoder().encode(settings?photoSignature(settings):'src').buffer as ArrayBuffer,width:8,height:4});
 return{async load(){return res();},async renderPhoto(s){return res(s);},async exportPhoto(s){return res(s);},dispose(){}};
}
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAECAIAAAA8r6IuAAAAEElEQVR4nGP8z8DwnwEKmBgA3yEBAemZYhMAAAAASUVORK5CYII=';
const item=(name:string,mime='image/png'):MediaItem=>({name,url:png,mime,kind:'image',size:png.length});
const vivid=BUILT_IN_PRESETS.find(p=>p.id==='vivid')!.look;

test.beforeEach(()=>setPhotoEngineFactory(fakeEngine));
test.afterEach(()=>{for(const n of['a.png','b.png','c.tiff'])closePhoto(n);});

test('sync applies the look to every photo as one commit each, geometry untouched',async()=>{
 await syncLookToPhotos([item('a.png'),item('b.png')],vivid);
 await wait(300); // let the debounced re-render settle
 for(const n of['a.png','b.png']){
  const s=getPhotoSession(n)!;
  assert.equal(s.now.contrast,18);assert.equal(s.now.exposure,0); // vivid replaces the look on a neutral base
  assert.equal(s.past.length,1,'one undo step per photo');
  assert.equal(s.now.crop,null);
 }
});

test('sync replaces an earlier look instead of stacking',async()=>{
 await syncLookToPhotos([item('a.png')],{contrast:30,saturation:20});
 await syncLookToPhotos([item('a.png')],vivid);
 const s=getPhotoSession('a.png')!;
 assert.equal(s.now.contrast,18);assert.equal(s.now.saturation,12); // vivid values, not 30+18 or 20 kept
});

test('a photo that cannot open lands in failed and never aborts the run',async()=>{
 const out=await syncLookToPhotos([item('a.png'),item('c.tiff','image/tiff'),item('b.png')],vivid);
 assert.deepEqual(out.saved,['a.png','b.png']);
 assert.equal(out.failed.length,1);assert.equal(out.failed[0].name,'c.tiff');
 assert.ok(getPhotoSession('b.png')!.now.clarity===15);
});
