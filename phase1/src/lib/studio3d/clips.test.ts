import test from 'node:test';import assert from 'node:assert/strict';
import {insertKey,removeKey,findKey,isPlainTrack,parseTrackName,trackName,snapKeyTime,checkKeyTime,checkDuration,checkClipName,MAX_KEYS_PER_TRACK,ClipError} from './clips';
test('insertKey keeps times sorted and values aligned',()=>{
 let r=insertKey([],[],'position',1,[1,2,3]);r=insertKey(r.times,r.values,'position',0,[0,0,0]);r=insertKey(r.times,r.values,'position',0.5,[9,8,7]);
 assert.deepEqual(r.times,[0,0.5,1]);assert.deepEqual(r.values,[0,0,0,9,8,7,1,2,3]);assert.equal(r.replaced,false);
});
test('insertKey replaces the value of a key at the same time instead of adding one',()=>{
 const a=insertKey([0,1],[0,0,0,1,1,1],'scale',1.0004,[2,2,2]);
 assert.equal(a.replaced,true);assert.deepEqual(a.times,[0,1]);assert.deepEqual(a.values,[0,0,0,2,2,2]);
});
test('insertKey checks the value size, finiteness and the key limit; rotation takes four numbers',()=>{
 assert.throws(()=>insertKey([],[],'position',0,[1,2]),ClipError);
 assert.throws(()=>insertKey([],[],'rotation',0,[0,0,0]),ClipError);
 assert.throws(()=>insertKey([],[],'scale',0,[1,Number.NaN,1]),ClipError);
 assert.equal(insertKey([],[],'rotation',0,[0,0,0,1]).values.length,4);
 const times=Array.from({length:MAX_KEYS_PER_TRACK},(_,i)=>i/100),values=times.flatMap(()=>[0,0,0]);
 assert.throws(()=>insertKey(times,values,'position',999,[0,0,0]),/at most/);
 assert.doesNotThrow(()=>insertKey(times,values,'position',0,[1,1,1]));
});
test('removeKey drops one key and its values',()=>{
 const r=removeKey([0,1,2],[0,0,0,1,1,1,2,2,2],'position',1);assert.deepEqual(r.times,[0,2]);assert.deepEqual(r.values,[0,0,0,2,2,2]);
 assert.throws(()=>removeKey([0],[0,0,0],'position',3),ClipError);assert.throws(()=>removeKey([0],[0,0,0],'position',-1),ClipError);
});
test('findKey and isPlainTrack',()=>{
 assert.equal(findKey([0,1,2],2.0002),2);assert.equal(findKey([0,1],0.5),-1);
 assert.equal(isPlainTrack([0,1],[0,0,0,1,1,1],'position'),true);assert.equal(isPlainTrack([0,1],new Array(18).fill(0),'position'),false);assert.equal(isPlainTrack([],[],'scale'),false);
});
test('track names round trip and refuse anything that is not a simple node property',()=>{
 assert.equal(trackName('abc-1','rotation'),'abc-1.quaternion');assert.deepEqual(parseTrackName('abc-1.quaternion'),{node:'abc-1',path:'rotation'});
 assert.equal(parseTrackName('a.b.position')?.node,undefined);assert.equal(parseTrackName('node.morphTargetInfluences'),null);assert.equal(parseTrackName('noprop'),null);assert.equal(parseTrackName('.position'),null);
});
test('time, duration and name checks',()=>{
 assert.equal(snapKeyTime(1.23456),1.235);assert.equal(checkKeyTime(0),0);assert.throws(()=>checkKeyTime(-1),ClipError);assert.throws(()=>checkKeyTime(1e9),ClipError);assert.throws(()=>checkKeyTime('1'),ClipError);
 assert.equal(checkDuration(2),2);assert.throws(()=>checkDuration(0),ClipError);assert.throws(()=>checkDuration(Number.NaN),ClipError);
 assert.equal(checkClipName('  Walk   cycle '),'Walk cycle');assert.throws(()=>checkClipName(''),ClipError);assert.throws(()=>checkClipName('x'.repeat(81)),ClipError);assert.throws(()=>checkClipName(5),ClipError);
});
