import test from 'node:test';
import assert from 'node:assert/strict';
import '../studios/sheets';
import {clearMedia,getMedia} from '../media';
import {patchState,getState} from '../../store/appStore';
import {clearHandoffOrigin,handoffOrigin} from './registry';
import {openSlidesTableInSheets} from './open';
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
