import test from 'node:test';
import assert from 'node:assert/strict';
import {hiddenPhotos,hidePhotos,isHidden,unhideAll} from './hidden.ts';
import {photoNav} from './photoNav.ts';
const img=(name:string)=>({name,kind:'image',mime:'image/png'});
test('hide, query and restore all',()=>{
 unhideAll();
 hidePhotos(['x.png','y.png','x.png']); // duplicates skipped
 assert.deepEqual(hiddenPhotos(),['x.png','y.png']);
 assert.ok(isHidden('x.png'));assert.ok(!isHidden('z.png'));
 hidePhotos([]);assert.deepEqual(hiddenPhotos(),['x.png','y.png']); // no-op keeps state
 unhideAll();assert.deepEqual(hiddenPhotos(),[]);
 unhideAll(); // clearing twice is fine
});
test('photoNav skips hidden photos and shrinks the total',()=>{
 unhideAll();
 const items=[img('a.png'),img('b.png'),img('c.png')];
 hidePhotos(['b.png']);
 assert.deepEqual(photoNav(items,'a.png'),{prev:null,next:'c.png',position:1,total:2});
 assert.deepEqual(photoNav(items,'b.png'),{prev:null,next:null,position:0,total:2}); // hidden current: outside the library view
 unhideAll();
 assert.deepEqual(photoNav(items,'b.png'),{prev:'a.png',next:'c.png',position:2,total:3});
});
