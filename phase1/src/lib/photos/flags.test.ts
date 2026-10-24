import test from 'node:test';
import assert from 'node:assert/strict';
import {getFlag,isPhotoFlag,photoFlags,setFlag,subscribeFlags} from './flags';
test('isPhotoFlag accepts pick and reject only',()=>{
 assert.ok(isPhotoFlag('pick')&&isPhotoFlag('reject'));
 assert.ok(!isPhotoFlag('none')&&!isPhotoFlag('')&&!isPhotoFlag(null)&&!isPhotoFlag(1));
});
test('setFlag stores, switches and clears per media name',()=>{
 setFlag('a.png','pick');
 setFlag('b.png','reject');
 assert.equal(getFlag('a.png'),'pick');
 assert.equal(getFlag('b.png'),'reject');
 assert.equal(getFlag('c.png'),null); // unflagged reads as null
 setFlag('a.png','reject');
 assert.equal(getFlag('a.png'),'reject');
 setFlag('a.png',null);
 assert.equal(getFlag('a.png'),null);
 assert.ok(!('a.png' in photoFlags())); // cleared entries leave the map
 setFlag('b.png',null);
});
test('invalid flags and empty names are ignored',()=>{
 setFlag('x.png','maybe' as never);
 setFlag('','pick');
 assert.equal(getFlag('x.png'),null);
 assert.deepEqual(photoFlags(),{});
});
test('subscribers fire on change and unsubscribe stops them',()=>{
 let hits=0;
 const off=subscribeFlags(()=>hits++);
 setFlag('n.png','pick');
 setFlag('n.png',null);
 assert.equal(hits,2);
 off();
 setFlag('n.png','reject');
 assert.equal(hits,2);
 setFlag('n.png',null);
});
