import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MUTATING_OPS,READ_ONLY_OPS,isMutatingOp} from './engineOps';
const workerOps=[...readFileSync(new URL('./worker.ts',import.meta.url),'utf8').matchAll(/case '([a-zA-Z]+)'/g)].map(m=>m[1]);
test('every worker request is classified exactly once as mutating or read-only',()=>{
 const known=new Set([...MUTATING_OPS,...READ_ONLY_OPS]);
 assert.equal(known.size,MUTATING_OPS.length+READ_ONLY_OPS.length,'no op is in both lists');
 const open=workerOps.filter(op=>op!=='init'&&!known.has(op));
 assert.deepEqual(open,[],'classify new worker requests in engineOps.ts');
 assert.ok(workerOps.length>80);
});
test('the lists name no request the worker does not handle',()=>{
 const handled=new Set(workerOps);
 const unknown=[...MUTATING_OPS,...READ_ONLY_OPS].filter(op=>!handled.has(op));
 assert.deepEqual(unknown,[]);
});
test('writes are never classified as reads',()=>{
 for(const op of ['set','setValues','clear','format','sort','filter','fill','undo','redo','open','close','pasteSpecial','shiftCells','viewOp','protectOp','editSheet'])assert.equal(isMutatingOp(op),true,op);
 for(const op of ['range','view','info','layout','sheets','save','cellInfo'])assert.equal(isMutatingOp(op),false,op);
});
