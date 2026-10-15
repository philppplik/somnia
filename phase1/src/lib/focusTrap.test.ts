import {test} from 'node:test';
import assert from 'node:assert/strict';
import {trapTabIndex} from './focusTrap';
test('trapTabIndex wraps forward past the last control',()=>{
 assert.equal(trapTabIndex(false,2,3),0);
 assert.equal(trapTabIndex(false,-1,3),0);
 assert.equal(trapTabIndex(false,1,3),null);
});
test('trapTabIndex wraps backward past the first control',()=>{
 assert.equal(trapTabIndex(true,0,3),2);
 assert.equal(trapTabIndex(true,-1,3),2);
 assert.equal(trapTabIndex(true,2,3),null);
});
test('trapTabIndex empty and single control',()=>{
 assert.equal(trapTabIndex(false,0,0),null);
 assert.equal(trapTabIndex(false,0,1),0);
 assert.equal(trapTabIndex(true,0,1),0);
});
