import assert from 'node:assert/strict';
import {test} from 'node:test';
import {addMarker,moveMarker,nextMarker,prevMarker,removeMarker,renameMarker,sanitizeMarkers,MAX_MARKERS} from './markers';
import {fullClip} from './timeline';
import {clipsSignature,parseVideoProject,serializeVideoProject} from './projectFile';

test('sanitize sorts, rounds, clamps to the duration, trims labels and drops junk',()=>{
 const out=sanitizeMarkers([{id:'b',at:5.04,label:'  end  '},{id:'a',at:1},{id:'x',at:Number.NaN},{id:'',at:2},{id:'late',at:99}],10);
 assert.deepEqual(out.map(m=>m.id),['a','b','late']);
 assert.equal(out[1].label,'end');
 assert.equal(out[2].at,10);
 assert.equal(sanitizeMarkers([{id:'l',at:1,label:'x'.repeat(200)}])[0].label.length,60);
 assert.deepEqual(sanitizeMarkers(undefined),[]);
});
test('add, rename, move and remove keep the list ordered and capped',()=>{
 let m=addMarker([],4,'b');m=addMarker(m,1,'a');
 assert.deepEqual(m.map(x=>x.label),['a','b']);
 m=renameMarker(m,m[0].id,'intro');assert.equal(m[0].label,'intro');
 m=moveMarker(m,m[0].id,9);assert.deepEqual(m.map(x=>x.label),['b','intro']);
 m=removeMarker(m,m[0].id);assert.equal(m.length,1);
 let big:ReturnType<typeof addMarker>=[];for(let i=0;i<MAX_MARKERS;i++)big=addMarker(big,i);
 assert.equal(big.length,MAX_MARKERS);
 assert.throws(()=>addMarker(big,1),RangeError);
});
test('next and previous skip the marker under the playhead',()=>{
 const m=sanitizeMarkers([{id:'a',at:1},{id:'b',at:3},{id:'c',at:6}]);
 assert.equal(nextMarker(m,3)?.id,'c');assert.equal(prevMarker(m,3)?.id,'a');
 assert.equal(nextMarker(m,6),null);assert.equal(prevMarker(m,1),null);
});
test('markers survive save and load, change the dirty signature and are absent when empty',()=>{
 const clips=[fullClip('a.mp4',10)];
 const m=addMarker([],2.5,'cut here');
 const back=parseVideoProject(serializeVideoProject(clips,[],'webm',undefined,[],m));
 assert.equal(back.markers.length,1);assert.equal(back.markers[0].label,'cut here');assert.equal(back.markers[0].at,2.5);
 assert.notEqual(clipsSignature(clips,[],[],m),clipsSignature(clips));
 const plain=serializeVideoProject(clips,[],'webm');
 assert.equal(plain.includes('markers'),false);
 assert.deepEqual(parseVideoProject(plain).markers,[]);
});
