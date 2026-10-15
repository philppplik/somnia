import test from 'node:test';
import assert from 'node:assert/strict';
import {detectSeries} from './autoStack.ts';
test('consecutive numbers form a series, gaps split it',()=>{
 assert.deepEqual(detectSeries(['IMG_2.png','IMG_1.png','IMG_3.png']),[['IMG_1.png','IMG_2.png','IMG_3.png']]); // order-free
 assert.deepEqual(detectSeries(['IMG_1.png','IMG_2.png','IMG_4.png']),[['IMG_1.png','IMG_2.png']]); // 4 breaks the run
});
test('prefixes separate series, singles and numberless names are ignored',()=>{
 const out=detectSeries(['a1.jpg','a2.jpg','b1.jpg','b2.jpg','solo.jpg','plain.jpg']);
 assert.equal(out.length,2);
 assert.deepEqual(detectSeries(['only7.jpg']),[]);
 assert.deepEqual(detectSeries(['no-number.jpg']),[]);
});
test('extensions and padded numbers parse',()=>{
 assert.deepEqual(detectSeries(['x-01.CR2','x-02.cr2','x-03.jpg']),[['x-01.CR2','x-02.cr2','x-03.jpg']]);
});
