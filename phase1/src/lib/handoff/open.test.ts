import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import '../studios/sheets';
import {clearMedia,getMedia,findMedia} from '../media';
import {patchState,getState} from '../../store/appStore';
import {clearHandoffOrigin,handoffOrigin} from './registry';
import {readDeckModel} from '../slides/deckPackage';
import {openSlidesTableInSheets,openSlidesPictureInPhotos} from './open';
test('CA1: Edit in Sheets studio is an explicit open and bypasses a manual studio visit',async()=>{
 clearMedia();patchState({activeStudio:'slides',studioChoice:'manual',studioByTab:{}});
 const r=await openSlidesTableInSheets({source:'deck.pptx',slideIndex:0,slideId:257,shapeId:7,cells:[['a','b'],['1','2']]});
 assert.ok(r.ok);
 const active=getMedia().active;assert.ok(active?.endsWith('.xlsx'));
 assert.equal(getState().activeStudio,'sheets','explicit open switches even with studioChoice manual');
 assert.equal(getState().studioByTab[`media:${active}`],'sheets');
 assert.equal(handoffOrigin(active!)?.file,'deck.pptx');
 clearHandoffOrigin(active!);clearMedia();patchState({activeStudio:'code',studioChoice:'automatic',studioByTab:{}});
});
test('CA1: without a manual visit the switch still happens exactly once',async()=>{
 clearMedia();patchState({activeStudio:'slides',studioChoice:'automatic',studioByTab:{}});
 const r=await openSlidesTableInSheets({source:'deck.pptx',slideIndex:1,slideId:9,shapeId:3,cells:[['x']]});
 assert.ok(r.ok);
 const active=getMedia().active;assert.ok(active?.endsWith('.xlsx'));
 assert.equal(getState().activeStudio,'sheets');
 assert.equal(getState().studioChoice,'automatic','open leaves no manual lock behind');
 clearHandoffOrigin(active!);clearMedia();patchState({activeStudio:'code',studioChoice:'automatic',studioByTab:{}});
});
/** CA2: an explicit handoff open must route the shell even when the user picked the current studio by hand. */
test('picture handoff routes to Photos with source open despite a manual studio choice',async()=>{
 clearMedia();patchState({studioChoice:'manual',activeStudio:'slides',studioByTab:{}});
 const bytes=new Uint8Array(readFileSync('slides-engine/fixtures/picture.pptx'));
 const slide=readDeckModel(bytes).slides[0];const pic=slide.shapes.find(s=>s.kind==='picture');assert.ok(pic,'fixture has a picture');
 const r=await openSlidesPictureInPhotos({source:'picture.pptx',slideIndex:0,slideId:slide.id,shapeId:pic.id,working:bytes});
 assert.deepEqual(r,{ok:true});
 const opened=findMedia('picture - picture.png');assert.ok(opened,'picture media opened');
 assert.equal(getState().activeStudio,'photos');
 assert.equal(getState().studioChoice,'automatic','explicit open does not read as a manual studio visit');
 assert.equal(getState().studioByTab['media:picture - picture.png'],'photos');
 clearMedia();patchState({studioChoice:'automatic',activeStudio:'code',studioByTab:{}});
});
test('CA1: a path-like source never leaves media.active dangling (blob URL regression)',async()=>{
 clearMedia();patchState({activeStudio:'slides',studioChoice:'manual',studioByTab:{}});
 // The slides session exposes the deck blob URL as `source`; even such a source must end with the stored item active.
 const r=await openSlidesTableInSheets({source:'blob:http://localhost/3d841ea1-2025-4aba-8859-12d367bc9abf',slideIndex:0,slideId:1,shapeId:2,cells:[['a']]});
 assert.ok(r.ok);
 const m=getMedia();const stored=m.items.find(i=>i.kind==='xlsx');
 assert.ok(stored);assert.equal(m.active,stored.name,'active media is the stored item, never the raw requested name');
 assert.equal(handoffOrigin(stored.name)?.id,'1:2');
 assert.equal(getState().studioByTab[`media:${stored.name}`],'sheets');
 assert.equal(getState().activeStudio,'sheets');
 clearHandoffOrigin(stored.name);clearMedia();patchState({activeStudio:'code',studioChoice:'automatic',studioByTab:{}});
});
