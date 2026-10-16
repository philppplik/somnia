import {test} from 'node:test';
import assert from 'node:assert/strict';
import {safeSliceUtf8} from './text';
test('safeSliceUtf8 slices in either order and never throws on stale offsets',()=>{
 assert.equal(safeSliceUtf8('héllo',1,3),'é');assert.equal(safeSliceUtf8('héllo',3,1),'é');
 assert.equal(safeSliceUtf8('abc',0,99),'');assert.equal(safeSliceUtf8('',6,6),'');assert.equal(safeSliceUtf8('é',1,1),'');assert.equal(safeSliceUtf8('abc',1,1),'');
});
