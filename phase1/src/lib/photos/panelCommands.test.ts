import test from 'node:test';
import assert from 'node:assert/strict';
import {CommandDispatcher} from '../commandDispatcher';
import {addMediaFile,clearMedia,getMedia} from '../media';
import {closePhoto,getPhotoSession,openPhoto,setPhotoEngineFactory,type PhotoEngineLike} from './studioSession';
import {neutralPhotoSettings,photoSignature,type PhotoSettings} from './studioSettings';
import {activePhotoName,photosCommandSpecs,photoStateSummary,registerPhotosCommands,sectionKeys} from './panelCommands';
import {PHOTOS_PANEL_COMMANDS} from './panelManifest';
import type {PhotosResponse} from './engine';
const PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAECAIAAAA8r6IuAAAAEElEQVR4nGP8z8DwnwEKmBgA3yEBAemZYhMAAAAASUVORK5CYII=';
const png=()=>Uint8Array.from(atob(PNG.split(',')[1]),c=>c.charCodeAt(0));
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
function fakeEngine():PhotoEngineLike&{renders:PhotoSettings[];exports:string[]}{
 const renders:PhotoSettings[]=[],exports:string[]=[];
 // RGBA frame: 2 px, one black and one white, so the histogram command has real data.
 const frame=(settings?:PhotoSettings):PhotosResponse=>({id:0,ok:true,bytes:Uint8Array.from([0,0,0,255,255,255,255,255]).buffer as ArrayBuffer,width:2,height:1,...(settings?{}:{})});
 return{renders,exports,async load(){return {...frame(),width:8,height:4};},async renderPhoto(s){renders.push({...s});return frame(s);},async exportPhoto(_s,f){exports.push(f);return {...frame(),bytes:new Uint8Array([1,2,3]).buffer as ArrayBuffer};},dispose(){}};
}
let engine:ReturnType<typeof fakeEngine>,dispatcher:CommandDispatcher;
const NAME='panel-test.png';
const run=(id:string,params?:unknown)=>dispatcher.runCommand(id,params,{origin:'test'});
test.beforeEach(async()=>{
 engine=fakeEngine();setPhotoEngineFactory(()=>engine);
 clearMedia();const r=await addMediaFile(new Blob([png()],{type:'image/png'}),NAME);assert.ok(!('error' in r));assert.equal(getMedia().active,NAME);
 await openPhoto({name:NAME,url:PNG,mime:'image/png'});assert.equal(getPhotoSession(NAME)?.status,'ready');
 dispatcher=new CommandDispatcher();for(const s of photosCommandSpecs())dispatcher.register(s as never);
});
test.afterEach(()=>{closePhoto(NAME);clearMedia();});
test('every command the panels declare exists, ids are namespaced and unique',()=>{
 const ids=photosCommandSpecs().map(s=>s.id);assert.equal(new Set(ids).size,ids.length);
 for(const id of ids)assert.match(id,/^photos\.[a-zA-Z.]+$/);
 for(const id of PHOTOS_PANEL_COMMANDS)assert.ok(ids.includes(id),`panel command ${id} has no spec`);
});
test('active photo and state summary come from the session',async()=>{
 assert.equal(activePhotoName(),NAME);
 const st=await run('photos.getState') as ReturnType<typeof photoStateSummary>;
 assert.deepEqual({open:st.open,w:st.width,h:st.height,ow:st.outputWidth,oh:st.outputHeight,neutral:st.neutral,dirty:st.dirty,changed:st.changed},{open:true,w:8,h:4,ow:8,oh:4,neutral:true,dirty:false,changed:[]});
});
test('setAdjustment is one undo step, clamps to the engine range and rejects unknown keys',async()=>{
 await run('photos.setAdjustment',{key:'exposure',value:1.5});
 let s=getPhotoSession(NAME)!;assert.equal(s.now.exposure,1.5);assert.equal(s.past.length,1);
 await run('photos.setAdjustment',{key:'exposure',value:99});assert.equal(getPhotoSession(NAME)!.now.exposure,5);
 await assert.rejects(()=>run('photos.setAdjustment',{key:'orientation',value:1}));
 await assert.rejects(()=>run('photos.setAdjustment',{key:'exposure'}));
 await assert.rejects(()=>run('photos.setAdjustment',{key:'exposure',value:1,extra:true}));
 await run('photos.undo');assert.equal(getPhotoSession(NAME)!.now.exposure,1.5);
 await run('photos.redo');assert.equal(getPhotoSession(NAME)!.now.exposure,5);
 assert.equal((await run('photos.getState') as {changed:string[]}).changed[0],'exposure');
});
test('resetAdjustments by section leaves other sections alone; transform reset clears geometry',async()=>{
 await run('photos.setAdjustment',{key:'exposure',value:1});await run('photos.setAdjustment',{key:'saturation',value:30});
 await run('photos.rotate',{direction:1});await run('photos.flip',{axis:'h'});
 await run('photos.resetAdjustments',{section:'light'});
 let n=getPhotoSession(NAME)!.now;assert.equal(n.exposure,0);assert.equal(n.saturation,30);assert.equal(n.orientation,1);
 await run('photos.resetAdjustments',{section:'transform'});n=getPhotoSession(NAME)!.now;assert.equal(n.orientation,0);assert.equal(n.flipH,false);assert.equal(n.saturation,30);
 await run('photos.resetAdjustments',{});assert.equal(photoSignature(getPhotoSession(NAME)!.now),photoSignature(neutralPhotoSettings));
 await assert.rejects(()=>run('photos.resetAdjustments',{section:'bogus'}));
});
test('applyLook with a built-in id replaces the look and keeps geometry; a custom look is clamped by the schema',async()=>{
 await run('photos.rotate',{direction:1});await run('photos.setAdjustment',{key:'exposure',value:2});
 await run('photos.applyLook',{preset:'bw'});
 const n=getPhotoSession(NAME)!.now;assert.equal(n.saturation,-100);assert.equal(n.exposure,0);assert.equal(n.orientation,1);
 await run('photos.applyLook',{look:{exposure:0.5,contrast:10}});assert.equal(getPhotoSession(NAME)!.now.exposure,0.5);assert.equal(getPhotoSession(NAME)!.now.saturation,0);
 await assert.rejects(()=>run('photos.applyLook',{preset:'nope'}));await assert.rejects(()=>run('photos.applyLook',{}));
 await assert.rejects(()=>run('photos.applyLook',{look:{exposure:50}}));await assert.rejects(()=>run('photos.applyLook',{look:{orientation:3}}));
});
test('rotate and flip: quarter turns wrap, flips toggle',async()=>{
 await run('photos.rotate',{direction:-1});assert.equal(getPhotoSession(NAME)!.now.orientation,3);
 await run('photos.rotate',{direction:1});assert.equal(getPhotoSession(NAME)!.now.orientation,0);
 await run('photos.flip',{axis:'v'});assert.equal(getPhotoSession(NAME)!.now.flipV,true);
 await assert.rejects(()=>run('photos.rotate',{direction:2}));await assert.rejects(()=>run('photos.flip',{axis:'x'}));
});
test('crop flow: start, aspect, apply, remove; enabled flags follow the state',async()=>{
 assert.equal(dispatcher.isEnabled('photos.crop.apply',{origin:'test'}),false);assert.equal(dispatcher.isEnabled('photos.crop.reset',{origin:'test'}),false);
 await run('photos.crop.start');assert.equal(getPhotoSession(NAME)!.cropping,true);assert.equal(dispatcher.isEnabled('photos.crop.apply',{origin:'test'}),true);
 await run('photos.crop.setAspect',{aspect:'1:1'});
 const d=getPhotoSession(NAME)!.cropDraft!;assert.ok(Math.abs((d.x1-d.x0)*8-(d.y1-d.y0)*4)<1e-9,'square in pixels on an 8x4 frame');
 await run('photos.crop.apply');let s=getPhotoSession(NAME)!;assert.equal(s.cropping,false);assert.ok(s.now.crop);
 assert.deepEqual({w:photoStateSummary().outputWidth,h:photoStateSummary().outputHeight},{w:4,h:4});
 await run('photos.crop.reset');s=getPhotoSession(NAME)!;assert.equal(s.now.crop,null);
 await run('photos.crop.setAspect',{aspect:'free'});assert.equal(getPhotoSession(NAME)!.cropping,true,'free starts crop mode without changing the rect');
 await run('photos.crop.cancel');assert.equal(getPhotoSession(NAME)!.cropping,false);
 await assert.rejects(()=>run('photos.crop.setAspect',{aspect:'7:5'}));
});
test('history.jump walks undo and redo steps exactly and refuses out-of-range indexes',async()=>{
 for(const v of [1,2,3])await run('photos.setAdjustment',{key:'exposure',value:v});
 await run('photos.history.jump',{index:1});assert.equal(getPhotoSession(NAME)!.now.exposure,1);assert.equal(getPhotoSession(NAME)!.future.length,2);
 await run('photos.history.jump',{index:3});assert.equal(getPhotoSession(NAME)!.now.exposure,3);
 await run('photos.history.jump',{index:0});assert.equal(getPhotoSession(NAME)!.now.exposure,0);
 await assert.rejects(()=>run('photos.history.jump',{index:4}));await assert.rejects(()=>run('photos.history.jump',{index:-1}));
 await wait(200);assert.equal(photoSignature(engine.renders.at(-1)!),photoSignature(getPhotoSession(NAME)!.now),'the preview follows the jump');
});
test('getHistogram reads the rendered frame',async()=>{
 const h=await run('photos.getHistogram') as {samples:number;clipShadows:number;clipHighlights:number;meanLuma:number};
 assert.equal(h.samples,2);assert.equal(h.clipShadows,0.5);assert.equal(h.clipHighlights,0.5);assert.equal(h.meanLuma,127.5);
});
test('export refuses unknown formats before touching the engine',async()=>{
 await assert.rejects(()=>run('photos.export',{format:'gif'}));assert.equal(engine.exports.length,0);
});
test('agent and MCP origins cannot run edit commands, but may read state',async()=>{
 await assert.rejects(()=>dispatcher.runCommand('photos.setAdjustment',{key:'exposure',value:1},{origin:'agent'}));
 await assert.rejects(()=>dispatcher.runCommand('photos.applyLook',{preset:'bw'},{origin:'mcp'}));
 assert.equal(getPhotoSession(NAME)!.now.exposure,0);
 const st=await dispatcher.runCommand('photos.getState',{},{origin:'agent'}) as {open:boolean};assert.equal(st.open,true);
});
test('commands refuse to run without an open photo',async()=>{
 closePhoto(NAME);
 await assert.rejects(()=>run('photos.setAdjustment',{key:'exposure',value:1}),/not available/);
 assert.equal((await run('photos.getState') as {open:boolean}).open,false);
});
test('sectionKeys and resetSection cover the slider keys',()=>{
 assert.deepEqual(sectionKeys('light'),['exposure','contrast','highlights','shadows','whites','blacks']);
 assert.ok(sectionKeys('all').includes('straighten'));
});
test('registerPhotosCommands is reference counted',()=>{
 const a=registerPhotosCommands(),b=registerPhotosCommands();a();a();b();
 const c=registerPhotosCommands();c();
});
