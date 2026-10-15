import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DocumentsCore} from './core';
import {checkFormatPatch} from './protocol';
import {buildLookPatch,lookFromState} from '../../components/documents/CharLookDialog';
const mk=(withFn=true)=>{const calls:boolean[]=[];
 class S{constructor(_b:Uint8Array){}paginate(){return 1;}free(){}}
 if(withFn)(S.prototype as unknown as Record<string,unknown>).set_show_hidden=(on:boolean)=>{calls.push(on);};
 const k=new DocumentsCore(S as never);try{k.handle({id:1,kind:'open',bytes:new Uint8Array(4)} as never);}catch{/* fake describe */}return{k,calls};};
test('show hidden reaches the session for booleans only',()=>{
 const {k,calls}=mk();
 for(const on of ['yes',1,null,undefined])assert.equal(k.handle({id:2,kind:'setShowHidden',on} as never).res.ok,false);
 assert.equal(calls.length,0);
 k.handle({id:3,kind:'setShowHidden',on:true} as never);assert.deepEqual(calls,[true]);
});
test('an engine without the call reports it instead of crashing',()=>{
 const {k}=mk(false);assert.equal(k.handle({id:2,kind:'setShowHidden',on:true} as never).res.ok,false);
});
test('the hidden flag must be a boolean',()=>{
 checkFormatPatch({hidden:true});
 for(const v of ['yes',1,null])assert.throws(()=>checkFormatPatch({hidden:v}));
});
test('the character dialog only sends hidden when it changed',()=>{
 const f={bold:'off',italic:'off',underline:'off',hidden:'off'} as never;
 const form=lookFromState(f);assert.equal(buildLookPatch(f,form),null);
 assert.deepEqual(buildLookPatch(f,{...form,hidden:true}),{hidden:true});
 const on={bold:'off',italic:'off',underline:'off',hidden:'on'} as never;
 assert.deepEqual(buildLookPatch(on,{...lookFromState(on),hidden:false}),{hidden:false});
 assert.equal(buildLookPatch({bold:'off',italic:'off',underline:'off',hidden:'mixed'} as never,{...form,hidden:false}),null);
});
