import assert from 'node:assert/strict';
import test from 'node:test';
import {Doc} from 'yjs';
import {Awareness,applyAwarenessUpdate,encodeAwarenessUpdate} from 'y-protocols/awareness';
import {announceSlide,peerSlides,SLIDE_FIELD} from './slidesPresence';
test('slide presence replicates, clears, drops garbage',()=>{
 const a=new Awareness(new Doc()),b=new Awareness(new Doc());
 const push=()=>applyAwarenessUpdate(b,encodeAwarenessUpdate(a,[a.clientID]),'t');
 announceSlide(a,'deck.pptx',4);a.setLocalStateField('user',{name:'Gabi'});
 push();
 assert.deepEqual(peerSlides(b,'deck.pptx').map(x=>({name:x.user.name,slide:x.slide})),[{name:'Gabi',slide:4}]);
 assert.equal(peerSlides(b,'other.pptx').length,0);
 a.setLocalStateField(SLIDE_FIELD,{file:'deck.pptx',slide:-1});push();
 assert.equal(peerSlides(b,'deck.pptx').length,0);
 announceSlide(a,null,0);push();
 assert.equal(peerSlides(b,'deck.pptx').length,0);
 a.destroy();b.destroy();});
