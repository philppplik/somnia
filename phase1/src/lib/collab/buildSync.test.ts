import test from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import {Awareness,encodeAwarenessUpdate,applyAwarenessUpdate} from 'y-protocols/awareness';
import {announceBuild,buildOfState,peerBuilds,buildMismatches} from './buildSync';

const made:Awareness[]=[];
const pair=()=>{const a=new Awareness(new Y.Doc()),b=new Awareness(new Y.Doc());made.push(a,b);return{a,b};};
test.after(()=>{for(const a of made){a.destroy();a.doc.destroy();}});
const connect=(a:Awareness,b:Awareness)=>applyAwarenessUpdate(b,encodeAwarenessUpdate(a,[a.clientID]),'test'); // one awareness round-trip, like the wire does

test('build strings are validated, dev and junk read as unknown',()=>{
 assert.equal(buildOfState('12.2.0-beta.3'),'12.2.0-beta.3');
 assert.equal(buildOfState('dev'),null);assert.equal(buildOfState(''),null);
 assert.equal(buildOfState('12.2.0; drop table'),null);assert.equal(buildOfState(42),null);
 assert.equal(buildOfState('x'.repeat(70)),null);
});
test('announced builds survive the awareness wire and mismatches are found',()=>{
 const {a,b}=pair();
 announceBuild(a,'12.2.0-beta.3');connect(a,b);
 assert.deepEqual([...peerBuilds(b).values()],['12.2.0-beta.3']);
 assert.deepEqual(buildMismatches(b,'12.2.0-beta.3'),[]);
 assert.deepEqual(buildMismatches(b,'12.3.0'),[a.clientID]);
});
test('a peer without a build field is not a mismatch (old build, text collab stays fine)',()=>{
 const {a,b}=pair();a.setLocalState({user:{name:'Old'}});connect(a,b);
 assert.deepEqual(buildMismatches(b,'12.2.0-beta.3'),[]);
 assert.equal(peerBuilds(b).size,0);
});
test('own build "dev" never flags anyone (tests and tooling are not a session rule)',()=>{
 const {a,b}=pair();announceBuild(a,'12.2.0-beta.3');connect(a,b);
 assert.deepEqual(buildMismatches(b,'dev'),[]);
});
