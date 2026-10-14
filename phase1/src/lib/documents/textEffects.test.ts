import test from 'node:test';
import assert from 'node:assert/strict';
import {DocumentsCore,type DocSessionLike} from './core';
import {checkFormatPatch,linkProblem,MAX_LINK_CHARS} from './protocol';
test('links are limited to http, https and mailto without spaces',()=>{
 for(const ok of ['','https://example.com/a?b=1','HTTP://x.org','mailto:a@b.co'])assert.equal(linkProblem(ok),null,ok);
 for(const bad of ['javascript:alert(1)','http://','https://a b.com','ftp://x.org','data:text/html,x','//x.org','https://x\n.org',42,undefined,'https://'+'a'.repeat(MAX_LINK_CHARS)])assert.notEqual(linkProblem(bad),null,String(bad));
});
test('format patches accept the new effects and refuse the rest',()=>{
 for(const ok of [{strike:true},{smallCaps:false},{vertAlign:'superscript'},{vertAlign:'baseline'},{highlight:'yellow'},{highlight:'none'},{link:'https://a.org'},{link:''},{clear:true},{strike:true,bold:true,link:'mailto:a@b.co'}])assert.doesNotThrow(()=>checkFormatPatch(ok),JSON.stringify(ok));
 for(const bad of [{strike:'yes'},{vertAlign:'up'},{highlight:'purple'},{highlight:'other'},{link:'javascript:x'},{link:7},{clear:false},{clear:'true'},{doubleStrike:1},{allCaps:'x'},{underlineStyle:'zigzag'},{charShading:'red'}])assert.throws(()=>checkFormatPatch(bad),JSON.stringify(bad));
});
test('only a valid patch reaches the engine',()=>{
 const calls:string[]=[];
 const S=class{constructor(_b?:Uint8Array){}free(){}blocks(){return '[]';}paginate(){return 1;}page_info(){return '{"pages":[],"cacheHits":0,"cacheMisses":0}';}text(){return '';}
  format_range(a:number,b:number,c:number,d:number,j:string){calls.push(`${a} ${b} ${c} ${d} ${j}`);}};
 const k=new DocumentsCore(S as unknown as new(b:Uint8Array)=>DocSessionLike);k.handle({id:1,kind:'open',bytes:new Uint8Array(4)} as never);
 const f=(patch:unknown)=>k.handle({id:2,kind:'format',start:{block:0,off:0},end:{block:0,off:3},patch} as never).res.ok;
 assert.equal(f({link:'https://a.org',strike:true}),true);
 assert.equal(f({link:'javascript:x'}),false);
 assert.equal(f({highlight:'purple'}),false);
 assert.deepEqual(calls,['0 0 0 3 {"link":"https://a.org","strike":true}']);
});
