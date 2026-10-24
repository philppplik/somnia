import assert from 'node:assert/strict';
import test from 'node:test';
import {Doc} from 'yjs';
import {Awareness,applyAwarenessUpdate,encodeAwarenessUpdate} from 'y-protocols/awareness';
import {announceCaret,peerCarets,CARET_FIELD} from './docsPresence';
test('caret presence replicates, clears, drops garbage',()=>{
 const a=new Awareness(new Doc()),b=new Awareness(new Doc());
 const push=()=>applyAwarenessUpdate(b,encodeAwarenessUpdate(a,[a.clientID]),'t');
 announceCaret(a,'brief.docx',2,17);a.setLocalStateField('user',{name:'Gabi'});
 push();
 assert.deepEqual(peerCarets(b,'brief.docx').map(x=>({name:x.user.name,block:x.block,off:x.off})),[{name:'Gabi',block:2,off:17}]);
 assert.equal(peerCarets(b,'other.docx').length,0);
 a.setLocalStateField(CARET_FIELD,{file:'brief.docx',block:-1,off:0});push();
 assert.equal(peerCarets(b,'brief.docx').length,0);
 announceCaret(a,null,0,0);push();
 assert.equal(peerCarets(b,'brief.docx').length,0);
 a.destroy();b.destroy();});
