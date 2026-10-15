import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseRangeReceipt,isStaleError} from './receipt';
const good=()=>({sheet:0,row:4,col:1,rows:1,cols:2,beforeRevision:3,afterRevision:4,applied:1,undoable:true,token:'t',readback:[{address:'B5',value:1,formula:null},{address:'C5',value:2,formula:'B5+1'}]});
test('a well formed range receipt is accepted',()=>{const r=parseRangeReceipt(good());assert.equal(r.readback.length,2);assert.equal(r.readback[1].formula,'B5+1');assert.equal(r.applied,1);});
test('malformed range receipts are rejected, never repaired',()=>{
 const bad:Record<string,(o:ReturnType<typeof good>)=>unknown>={
  notObject:()=>null,applied:o=>({...o,applied:2}),undoable:o=>({...o,undoable:'yes'}),backwards:o=>({...o,afterRevision:1}),
  shortReadback:o=>({...o,readback:o.readback.slice(1)}),noReadback:o=>({...o,readback:null}),hugeRange:o=>({...o,rows:2000,cols:1}),zeroRows:o=>({...o,rows:0}),
  badFormula:o=>({...o,readback:[{...o.readback[0],formula:5},o.readback[1]]}),noToken:o=>({...o,token:''}),negative:o=>({...o,row:-1}),badCell:o=>({...o,readback:[1,2]}),
 };
 for(const [name,mut] of Object.entries(bad))assert.throws(()=>parseRangeReceipt(mut(good())),name);
});
test('stale errors are recognised by their prefix',()=>{assert.ok(isStaleError(new Error('stale: changed')));assert.ok(!isStaleError(new Error('other')));});
