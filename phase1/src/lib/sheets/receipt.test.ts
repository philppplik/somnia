import test from 'node:test';
import assert from 'node:assert/strict';
import {isStaleError,parseEditReceipt,parseNativeState} from './receipt';
const good={sheet:0,address:'A30',beforeRevision:1,afterRevision:2,applied:1,undoable:true,token:'2:1:0:ab',readback:{address:'A30',value:42,formula:null}};
test('a well-formed owner receipt is accepted unchanged',()=>{assert.deepEqual(parseEditReceipt(good),good);assert.deepEqual(parseNativeState({revision:3,token:'3:0:0:f'}),{revision:3,token:'3:0:0:f'});});
test('malformed receipts and states are rejected, never repaired',()=>{
 const bad:unknown[]=[null,[],{},{...good,applied:2},{...good,applied:'1'},{...good,undoable:1},{...good,afterRevision:0},{...good,beforeRevision:-1},{...good,token:''},{...good,address:'x'.repeat(17)},{...good,sheet:1.5},{...good,readback:null},{...good,readback:{address:'A30',value:1,formula:5}}];
 for(const b of bad)assert.throws(()=>parseEditReceipt(b),JSON.stringify(b));
 for(const b of [null,{},{revision:-1,token:'a'},{revision:1,token:''},{revision:1.5,token:'a'}])assert.throws(()=>parseNativeState(b));
});
test('only stale errors are proven non-mutations of this kind',()=>{assert.equal(isStaleError(new Error('stale: the cell changed')),true);assert.equal(isStaleError(new Error('worker crashed')),false);assert.equal(isStaleError('stale'),false);});
