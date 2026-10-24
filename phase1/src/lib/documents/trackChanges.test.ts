import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DocumentsCore} from './core';
import {parseReviewState,MAX_REVIEW_CHANGES} from './protocol';
const mk=(withFn=true)=>{const calls:unknown[][]=[];
 class S{constructor(_b:Uint8Array){}paginate(){return 1;}free(){}}
 const p=S.prototype as unknown as Record<string,unknown>;
 if(withFn){p.set_track_changes=(...a:unknown[])=>{calls.push(['track',...a]);};p.resolve_change=(...a:unknown[])=>{calls.push(['one',...a]);};p.resolve_all_changes=(...a:unknown[])=>{calls.push(['all',...a]);return 1;};p.review_state=()=>'{"track":true,"changes":[]}';}
 const k=new DocumentsCore(S as never);try{k.handle({id:1,kind:'open',bytes:new Uint8Array(4)} as never);}catch{/* fake describe */}return{k,calls};};
const ok=(k:DocumentsCore,r:unknown)=>k.handle(r as never).res.ok;
test('setTrack validates flag, author and date',()=>{
 const {k,calls}=mk();const d='2026-10-15T01:00:00Z';
 for(const on of ['yes',1,null])assert.equal(ok(k,{id:2,kind:'setTrack',on,author:'A',date:d}),false);
 for(const author of ['',' ','x'.repeat(61),'a\u0000b',5])assert.equal(ok(k,{id:3,kind:'setTrack',on:true,author,date:d}),false);
 for(const date of ['yesterday','',3])assert.equal(ok(k,{id:4,kind:'setTrack',on:true,author:'A',date}),false);
 assert.equal(calls.length,0);
 ok(k,{id:5,kind:'setTrack',on:true,author:'Ann',date:d});assert.deepEqual(calls[0],['track',true,'Ann',d]);
});
test('resolve requests reject bad ranges and flags',()=>{
 const {k,calls}=mk();
 for(const r of [{block:-1,start:0,end:1},{block:0,start:2,end:2},{block:0,start:0.5,end:3},{block:0,start:0,end:2**31}])assert.equal(ok(k,{id:2,kind:'resolveChange',...r,accept:true}),false);
 assert.equal(ok(k,{id:3,kind:'resolveChange',block:0,start:0,end:3,accept:'y'}),false);assert.equal(ok(k,{id:4,kind:'resolveAll',accept:null}),false);
 assert.equal(calls.length,0);
 ok(k,{id:5,kind:'resolveChange',block:0,start:1,end:3,accept:false});ok(k,{id:6,kind:'resolveAll',accept:true});
 assert.deepEqual(calls,[['one',0,1,3,false],['all',true]]);
});
test('an engine without the methods refuses cleanly',()=>{
 const {k}=mk(false);
 assert.equal(ok(k,{id:2,kind:'setTrack',on:true,author:'A',date:'2026-10-15T01:00:00Z'}),false);assert.equal(ok(k,{id:3,kind:'reviewState'}),false);
 assert.equal(ok(k,{id:4,kind:'resolveAll',accept:true}),false);
});
test('parseReviewState drops malformed entries and caps the list',()=>{
 assert.deepEqual(parseReviewState('nope'),{track:false,changes:[]});assert.deepEqual(parseReviewState('[]'),{track:false,changes:[]});
 const good={id:1,kind:'insert',author:'A',date:'d',block:0,start:0,end:2,text:'hi'};
 const r=parseReviewState(JSON.stringify({track:true,changes:[good,{...good,end:0},{...good,kind:'x'},{...good,text:5},{...good,id:-1},null]}));
 assert.equal(r.track,true);assert.equal(r.changes.length,1);
 const many=Array.from({length:MAX_REVIEW_CHANGES+50},()=>good);assert.equal(parseReviewState(JSON.stringify({track:false,changes:many})).changes.length,MAX_REVIEW_CHANGES);
});
test('setViewMarks takes two booleans and reaches the engine',()=>{
 const calls:boolean[][]=[];class S{constructor(_b:Uint8Array){}paginate(){return 1;}free(){}set_view_marks(a:boolean,b:boolean){calls.push([a,b]);}}
 const k=new DocumentsCore(S as never);try{k.handle({id:1,kind:'open',bytes:new Uint8Array(4)} as never);}catch{/* fake describe */}
 for(const [marks,markup] of [['y',true],[true,1],[null,false],[true,undefined]])assert.equal(ok(k,{id:2,kind:'setViewMarks',marks,markup}),false);
 assert.equal(calls.length,0);ok(k,{id:3,kind:'setViewMarks',marks:true,markup:false});assert.deepEqual(calls,[[true,false]]);
 const {k:k2}=mk(false);assert.equal(ok(k2,{id:4,kind:'setViewMarks',marks:true,markup:true}),false);
});
