import {test} from 'node:test';import assert from 'node:assert/strict';
import {emptyRack,validateRack} from './rack';
import {copyRack,resetSlotParams,newInsertId} from './rackOps';
const rack=()=>{const r=emptyRack();r.bypass=true;r.slots.push({id:'a',pluginId:'gain',enabled:false,params:{gain:3}},{id:'b',pluginId:'eq',enabled:true,params:{}});return r;};
test('copyRack gives fresh unique ids, keeps everything else, and does not alias params',()=>{const src=rack();let n=0;const out=copyRack(src,()=>'x'+(n++%2));assert.deepEqual(out.slots.map(s=>s.id),['x0','x1']);assert.equal(out.bypass,true);assert.equal(out.slots[0].enabled,false);assert.deepEqual(out.slots[0].params,{gain:3});out.slots[0].params.gain=9;assert.equal(src.slots[0].params.gain,3);assert.deepEqual(src.slots.map(s=>s.id),['a','b']);validateRack(out);});
test('copyRack re-rolls a colliding id instead of producing duplicates',()=>{const ids=['d','d','e'];const out=copyRack(rack(),()=>ids.shift()!);assert.deepEqual(out.slots.map(s=>s.id),['d','e']);});
test('resetSlotParams clears one insert only; unknown id returns the same rack',()=>{const r=rack();const out=resetSlotParams(r,'a');assert.deepEqual(out.slots[0].params,{});assert.equal(out.slots[0].enabled,false);assert.equal(resetSlotParams(r,'zzz'),r);assert.deepEqual(r.slots[0].params,{gain:3});});
test('newInsertId is deterministic with injected sources',()=>{assert.equal(newInsertId(()=>0.5,()=>7),'insert-7-i');});
