import {test} from 'node:test';import assert from 'node:assert/strict';
import {fillBlockProblem,parseFillCommand} from './fillOps';
test('parseFillCommand accepts only the four directions',()=>{
 for(const dir of ['down','right','up','left'])assert.deepEqual(parseFillCommand({dir}),{dir});
 for(const bad of [{},{dir:'sideways'},{dir:1},{dir:'down',x:1},null,[],'down'])assert.throws(()=>parseFillCommand(bad),JSON.stringify(bad));
});
test('fillBlockProblem: single row needs a row above, up/left need two, size is bounded',()=>{
 assert.equal(fillBlockProblem(3,0,3,2,'down'),null);
 assert.equal(fillBlockProblem(3,0,1,2,'down'),null);
 assert.equal(fillBlockProblem(0,0,1,2,'down'),'edge');
 assert.equal(fillBlockProblem(3,0,1,2,'up'),'edge');
 assert.equal(fillBlockProblem(0,1,2,1,'right'),null);
 assert.equal(fillBlockProblem(0,0,2,1,'right'),'edge');
 assert.equal(fillBlockProblem(0,0,2_000_000,1,'down'),'large');
 assert.equal(fillBlockProblem(0,0,0,1,'down'),'small');
 assert.equal(fillBlockProblem(0.5,0,2,1,'down'),'small');
});
