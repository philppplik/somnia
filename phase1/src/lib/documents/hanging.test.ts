import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hangingPatch,HANG_STEP_PT} from './hanging';
import {checkParaPatch} from './protocol';
test('more moves the text right and keeps the first line where it was',()=>{
 assert.deepEqual(hangingPatch(0,0,'more'),{indentLeft:36,indentFirst:-36});
 assert.deepEqual(hangingPatch(36,-36,'more'),{indentLeft:72,indentFirst:-72});
 assert.deepEqual(hangingPatch(72,18,'more'),{indentLeft:108,indentFirst:-18});
 assert.deepEqual(hangingPatch(null,null,'more'),{indentLeft:36,indentFirst:-36});
});
test('less shrinks the hang by a step and never below zero',()=>{
 assert.deepEqual(hangingPatch(72,-72,'less'),{indentLeft:36,indentFirst:-36});
 assert.deepEqual(hangingPatch(36,-36,'less'),{indentLeft:0,indentFirst:0});
 assert.deepEqual(hangingPatch(50,-20,'less'),{indentLeft:30,indentFirst:0});
 assert.equal(hangingPatch(36,0,'less'),null);assert.equal(hangingPatch(36,12,'less'),null);assert.equal(hangingPatch(null,null,'less'),null);
});
test('limits and bad numbers',()=>{
 assert.equal(hangingPatch(1440,0,'more'),null);
 assert.deepEqual(hangingPatch(1420,0,'more'),{indentLeft:1440,indentFirst:-20});
 assert.deepEqual(hangingPatch(Number.NaN,Number.POSITIVE_INFINITY,'more'),{indentLeft:HANG_STEP_PT,indentFirst:-HANG_STEP_PT});
 for(const [l,f,d] of [[0,0,'more'],[1000,-500,'more'],[300,-300,'less'],[1420,3,'more']] as const){const p=hangingPatch(l,f,d);if(p)assert.doesNotThrow(()=>checkParaPatch(p));}
});
