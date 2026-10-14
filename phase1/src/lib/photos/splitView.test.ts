import test from 'node:test';
import assert from 'node:assert/strict';
import {clampSplitX,splitClearRect} from './splitView';
test('clampSplitX keeps the divider inside the frame with a visible margin',()=>{
 assert.equal(clampSplitX(0.5),0.5);
 assert.equal(clampSplitX(-1),0.02);
 assert.equal(clampSplitX(2),0.98);
 assert.equal(clampSplitX(NaN),0.5);
});
test('splitClearRect erases exactly the right of the divider',()=>{
 const r=splitClearRect(300,200,1/3);
 assert.deepEqual(r,{x:100,y:0,width:200,height:200});
});
test('splitClearRect at the edges never covers the whole frame',()=>{
 assert.deepEqual(splitClearRect(300,200,0),{x:6,y:0,width:294,height:200});
 assert.deepEqual(splitClearRect(300,200,1),{x:294,y:0,width:6,height:200});
});
test('splitClearRect rounds the divider to whole pixels',()=>{
 const r=splitClearRect(7,3,0.5);
 assert.equal(r.x,4);assert.equal(r.width,3);
});
