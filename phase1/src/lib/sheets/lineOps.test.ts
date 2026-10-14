import test from 'node:test';
import assert from 'node:assert/strict';
import {editSpan,parseEditLines} from './lineOps';
test('insert and delete spans stay inside the sheet and insert-after moves past the selection',()=>{
 assert.deepEqual(editSpan('insertBefore',4,2,1_048_576),{first:4,count:2,op:'insert'});
 assert.deepEqual(editSpan('insertAfter',4,2,1_048_576),{first:6,count:2,op:'insert'});
 assert.deepEqual(editSpan('delete',4,2,1_048_576),{first:4,count:2,op:'delete'});
 assert.throws(()=>editSpan('insertAfter',16_383,1,16_384));assert.throws(()=>editSpan('delete',0,0,10));assert.throws(()=>editSpan('delete',-1,1,10));assert.throws(()=>editSpan('delete',1.5,1,10));
 assert.deepEqual(parseEditLines({axis:'cols',kind:'delete'}),{axis:'cols',kind:'delete'});
 for(const bad of [null,[],{axis:'x',kind:'delete'},{axis:'rows',kind:'x'},{axis:'rows',kind:'delete',n:1}])assert.throws(()=>parseEditLines(bad));
});
