import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseOutlineCommand,toBridgeOp,parseColumnList,parseOutlineInfo} from './outlineOps';
test('outline commands accept only closed shapes',()=>{
 assert.deepEqual(parseOutlineCommand({kind:'group',axis:'rows'}),{kind:'group',axis:'rows'});
 assert.deepEqual(parseOutlineCommand({kind:'subtotal',groupBy:'a',columns:['c','C','d']}),{kind:'subtotal',groupBy:'A',function:'sum',columns:['C','D']});
 for(const bad of [null,[],{},{kind:'group'},{kind:'group',axis:'x'},{kind:'group',axis:'rows',extra:1},{kind:'nest',axis:'rows'},{kind:'subtotal',groupBy:'A',columns:[]},{kind:'subtotal',groupBy:'1',columns:['B']},{kind:'subtotal',groupBy:'A',function:'median',columns:['B']},{kind:'subtotal',groupBy:'A',columns:Array(9).fill('B')},{kind:'subtotal',groupBy:'A',columns:[5]}])assert.throws(()=>parseOutlineCommand(bad),JSON.stringify(bad));
});
test('subtotal columns become offsets inside the selection',()=>{
 const sel={r0:4,r1:10,c0:1,c1:4};
 assert.deepEqual(toBridgeOp({kind:'subtotal',groupBy:'B',function:'sum',columns:['D','E']},sel),{kind:'subtotal',groupBy:0,function:'sum',columns:[2,3]});
 assert.throws(()=>toBridgeOp({kind:'subtotal',groupBy:'A',function:'sum',columns:['C']},sel));
 assert.throws(()=>toBridgeOp({kind:'subtotal',groupBy:'B',function:'sum',columns:['F']},sel));
 assert.throws(()=>toBridgeOp({kind:'subtotal',groupBy:'B',function:'sum',columns:['C']},{...sel,r1:5}));
 assert.throws(()=>toBridgeOp({kind:'group',axis:'rows'},{r0:0,r1:10_000,c0:0,c1:0}));
 assert.deepEqual(toBridgeOp({kind:'hide',axis:'cols'},sel),{kind:'hide',axis:'cols'});
});
test('column lists and bridge replies are parsed defensively',()=>{
 assert.deepEqual(parseColumnList(' c, d;C '),['C','D']);assert.equal(parseColumnList(''),null);assert.equal(parseColumnList('C1'),null);assert.equal(parseColumnList('A,B,C,D,E,F,G,H,I'),null);
 assert.deepEqual(parseOutlineInfo({rows:{lines:3,deepest:2,hidden:1},cols:{lines:-1,deepest:'x'}}),{rows:{lines:3,deepest:2,hidden:1},cols:{lines:0,deepest:0,hidden:0}});assert.deepEqual(parseOutlineInfo(null).rows,{lines:0,deepest:0,hidden:0});
});

test('remove-subtotals and level commands are closed and bounded',()=>{
 assert.deepEqual(parseOutlineCommand({kind:'removeSubtotals'}),{kind:'removeSubtotals'});
 assert.deepEqual(parseOutlineCommand({kind:'level',axis:'cols',level:3}),{kind:'level',axis:'cols',level:3});
 for(const bad of [{kind:'removeSubtotals',axis:'rows'},{kind:'level',axis:'rows'},{kind:'level',axis:'rows',level:0},{kind:'level',axis:'rows',level:8},{kind:'level',axis:'rows',level:1.5},{kind:'level',axis:'x',level:1},{kind:'level',axis:'rows',level:'2'}])assert.throws(()=>parseOutlineCommand(bad),bad.toString());
 const sel={r0:0,r1:9,c0:0,c1:2};
 assert.deepEqual(toBridgeOp({kind:'removeSubtotals'},sel),{kind:'removeSubtotals'});
 assert.throws(()=>toBridgeOp({kind:'removeSubtotals'},{...sel,r1:10_000}));
 assert.deepEqual(toBridgeOp({kind:'level',axis:'rows',level:2},sel),{kind:'level',axis:'rows',level:2});
});
