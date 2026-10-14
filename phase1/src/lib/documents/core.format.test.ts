import test from 'node:test';
import assert from 'node:assert/strict';
import {DocumentsCore,type DocSessionLike} from './core';
/** The host validates every format request before the engine sees it. */
function core(){
 const calls:string[]=[];
 const S=class{constructor(_b?:Uint8Array){}free(){}blocks(){return '[]';}format_range(...[,,,,j]:[number,number,number,number,string]){calls.push(j);}format_state(){return '{"bold":"on","italic":"off","underline":"mixed"}';}paginate(){return {};}} as unknown as new(b:Uint8Array)=>DocSessionLike;
 const k=new DocumentsCore(S);return{k,calls};
}
const rp=(k:DocumentsCore)=>{k.handle({id:1,kind:'open',bytes:new Uint8Array(4)} as never);};
test('format requests with unknown keys, non-booleans, reversed or oversize spans never reach the engine',()=>{
 const {k,calls}=core();rp(k);
 const bad=[{patch:{},s:[0,0],e:[0,1]},{patch:{bold:1},s:[0,0],e:[0,1]},{patch:{color:true},s:[0,0],e:[0,1]},{patch:{bold:true},s:[1,0],e:[0,0]},{patch:{bold:true},s:[0,-1],e:[0,1]},{patch:{bold:true},s:[0,0],e:[5000,0]},{patch:{bold:true},s:[0.5,0],e:[1,0]}];
 for(const b of bad)assert.equal(k.handle({id:2,kind:'format',start:{block:b.s[0],off:b.s[1]},end:{block:b.e[0],off:b.e[1]},patch:b.patch} as never).res.ok,false);
 assert.equal(calls.length,0);
 const good=k.handle({id:9,kind:'format',start:{block:0,off:0},end:{block:0,off:1},patch:{bold:true}} as never).res;void good;assert.deepEqual(calls,['{"bold":true}']);
});
test('formatState validates its span too',()=>{
 const {k}=core();rp(k);assert.equal(k.handle({id:2,kind:'formatState',start:{block:2,off:0},end:{block:1,off:0}} as never).res.ok,false);
 const ok=k.handle({id:3,kind:'formatState',start:{block:0,off:0},end:{block:1,off:0}} as never).res;assert.equal(ok.ok,true);
});

test('font, size and colour patches are validated before the engine',()=>{
 const {k,calls}=core();rp(k);const send=(patch:unknown)=>k.handle({id:2,kind:'format',start:{block:0,off:0},end:{block:0,off:1},patch} as never).res.ok;
 for(const bad of [{size:0},{size:401},{size:'12'},{size:Number.NaN},{font:''},{font:'x'.repeat(65)},{font:'a\u0000'},{font:3},{color:'red'},{color:'#C0392B'},{color:'12345'},{color:7}])assert.equal(send(bad),false,JSON.stringify(bad));
 assert.equal(calls.length,0);
 send({font:'Inter',size:12.5,color:'auto'});send({color:'c0392b'});assert.equal(calls.length,2);
});
