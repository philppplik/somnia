import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DocumentsCore} from './core';
import {MAX_TEXT_TABLE_ROWS} from './protocol';
const mk=(withFn=true)=>{const calls:number[][]=[];
 class S{constructor(_b:Uint8Array){}paginate(){return 1;}free(){}}
 if(withFn)(S.prototype as unknown as Record<string,unknown>).text_to_table=(a:number,b:number)=>{calls.push([a,b]);};
 const k=new DocumentsCore(S as never);try{k.handle({id:1,kind:'open',bytes:new Uint8Array(4)} as never);}catch{/* fake describe */}return{k,calls};};
const ok=(k:DocumentsCore,r:unknown)=>k.handle(r as never).res.ok;
test('textToTable bounds the paragraph range before the engine sees it',()=>{
 const {k,calls}=mk();
 for(const [first,last] of [[-1,2],[3,2],[0.5,2],[0,MAX_TEXT_TABLE_ROWS],[0,2**31],['a',1],[null,1]])assert.equal(ok(k,{id:2,kind:'textToTable',first,last}),false,`${first},${last}`);
 assert.equal(calls.length,0);
 ok(k,{id:3,kind:'textToTable',first:1,last:MAX_TEXT_TABLE_ROWS});assert.deepEqual(calls,[[1,MAX_TEXT_TABLE_ROWS]]);
});
test('an engine without text_to_table refuses cleanly',()=>{const {k}=mk(false);assert.equal(ok(k,{id:2,kind:'textToTable',first:0,last:1}),false);});
