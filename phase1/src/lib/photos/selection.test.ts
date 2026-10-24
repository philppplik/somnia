import test from 'node:test';
import assert from 'node:assert/strict';
import {rangeSelect,toggleSelect} from './selection';
const order=['a','b','c','d'];
test('toggle adds and removes one name',()=>{
 assert.deepEqual(toggleSelect(['a'],'b'),['a','b']);
 assert.deepEqual(toggleSelect(['a','b'],'a'),['b']);
});
test('range selects anchor..target in strip order, both directions',()=>{
 assert.deepEqual(rangeSelect(order,'b','d'),['b','c','d']);
 assert.deepEqual(rangeSelect(order,'d','b'),['b','c','d']);
});
test('range without a known anchor selects the target alone',()=>{
 assert.deepEqual(rangeSelect(order,null,'c'),['c']);
 assert.deepEqual(rangeSelect(order,'zzz','c'),['c']);
 assert.deepEqual(rangeSelect(order,'a','zzz'),['zzz']);
});
