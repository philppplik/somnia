import test from 'node:test';import assert from 'node:assert/strict';import {modelDiskAdvice} from './localModelDisk';
const disk={token:'fixture',source:'user-selected-volume' as const,freeBytes:20*1024**3,checkedAt:1000};
test('model volume fit is only estimated and unknown or stale never pretends checked capacity',()=>{
 assert.equal(modelDiskAdvice('qwen3:4b',disk,1000).state,'estimated-fit');assert.equal(modelDiskAdvice('qwen3:4b',{...disk,freeBytes:1},1000).state,'insufficient');assert.equal(modelDiskAdvice('arbitrary:tag',disk,1000).state,'unknown');assert.equal(modelDiskAdvice('qwen3:4b',null,1000).state,'unknown');assert.equal(modelDiskAdvice('qwen3:4b',disk,62000).state,'stale');assert.equal(modelDiskAdvice('qwen3:4b',{...disk,freeBytes:NaN},1000).state,'unknown');
});
