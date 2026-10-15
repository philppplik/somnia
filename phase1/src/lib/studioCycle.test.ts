import test from 'node:test';import assert from 'node:assert/strict';
import {cycleStudioId} from './studioCycle';
const ids=['code','photos','docs'];
test('wraps forward and back',()=>{
 assert.equal(cycleStudioId(ids,'code'),'photos');assert.equal(cycleStudioId(ids,'docs'),'code');
 assert.equal(cycleStudioId(ids,'code',-1),'docs');assert.equal(cycleStudioId(ids,'photos',-1),'code');
});
test('unknown or missing active, empty and single list',()=>{
 assert.equal(cycleStudioId(ids,'nope'),'code');assert.equal(cycleStudioId(ids,undefined,-1),'docs');
 assert.equal(cycleStudioId([],'code'),undefined);assert.equal(cycleStudioId(['code'],'code'),'code');
});
