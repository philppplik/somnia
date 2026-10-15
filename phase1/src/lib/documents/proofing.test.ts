import test from 'node:test';
import assert from 'node:assert/strict';
import {DocumentsCore} from './core';
import {parseProofIssues,proofWordOk,MAX_PROOF_ISSUES} from './protocol';
import {parseUserWords} from './userWords';
import {visibleIssues,firstAtOrAfter} from '../../components/documents/ProofDialog';
const issue=(o:Record<string,unknown>={})=>({block:0,start:0,end:3,kind:'spelling',word:'teh',message:'Possible spelling mistake',suggestions:['the'],fixable:true,...o});
test('engine issues are checked and capped',()=>{
 assert.equal(parseProofIssues(JSON.stringify([issue()])).length,1);
 for(const bad of ['x','{}','null','[1]',JSON.stringify([issue({end:0})]),JSON.stringify([issue({start:-1})]),JSON.stringify([issue({kind:'x'})]),JSON.stringify([issue({fixable:1})]),JSON.stringify([issue({block:1.5})]),JSON.stringify([issue({suggestions:'x'})])])assert.deepEqual(parseProofIssues(bad),[],bad);
 assert.deepEqual(parseProofIssues(JSON.stringify([issue({suggestions:['a','',7,'b\nc','ok']})]))[0].suggestions,['a','ok']);
 assert.equal(parseProofIssues(JSON.stringify(Array.from({length:MAX_PROOF_ISSUES+50},()=>issue()))).length,MAX_PROOF_ISSUES);
});
test('user words: only valid, unique, bounded words survive',()=>{
 assert.deepEqual(parseUserWords(JSON.stringify(['Somnia','somnia','a b','',7,'x'.repeat(41),'ok'])),['Somnia','ok']);
 for(const bad of [null,'','x','{}','7'])assert.deepEqual(parseUserWords(bad),[]);
 assert.equal(parseUserWords(JSON.stringify(Array.from({length:1500},(_,i)=>'w'+i))).length,1000);
 assert.equal(parseUserWords('['+'"a",'.repeat(100_000)+'"b"]').length,0,'oversized storage is ignored');
 assert.ok(proofWordOk('don\'t'));for(const bad of ['',' ','a b','a\nb',null,3,'x'.repeat(41)])assert.equal(proofWordOk(bad),false);
});
test('the dialog skips ignored words and resumes after a fix',()=>{
 const l=[issue({word:'Teh'}),issue({block:1,start:4,end:7,word:'foo'}),issue({block:1,start:9,end:12,word:'bar'})] as never[];
 assert.equal(visibleIssues(l,new Set(['teh'])).length,2);
 assert.equal(firstAtOrAfter(l,1,5),2);assert.equal(firstAtOrAfter(l,0,0),0);assert.equal(firstAtOrAfter(l,9,0),0,'past the end wraps to the first');
});
function core(){
 const calls:string[]=[];
 const S=class{constructor(_b?:Uint8Array){}free(){}blocks(){return '[]';}paginate(){return 1;}page_info(){return '{"pages":[],"cacheHits":0,"cacheMisses":0}';}text(){return '';}
  proof_check(w:string){calls.push('check '+w);return JSON.stringify([issue()]);}proof_suggest(w:string){calls.push('sug '+w);return JSON.stringify(['the','x y']);}set_proofing(o:boolean){calls.push('mark '+o);}};
 const k=new DocumentsCore(S as never);k.handle({id:1,kind:'open',bytes:new Uint8Array(4)} as never);return{k,calls};
}
test('proofing requests are validated before the engine',()=>{
 const {k,calls}=core();const h=(r:Record<string,unknown>)=>k.handle({id:2,...r} as never).res;
 for(const r of [{kind:'proofCheck',words:'x'},{kind:'proofCheck',words:['a b']},{kind:'proofCheck',words:Array(1001).fill('w')},{kind:'proofSuggest',word:''},{kind:'proofSuggest',word:'a b'},{kind:'setProofing',on:1}])assert.equal(h(r).ok,false,JSON.stringify(r).slice(0,60));
 assert.deepEqual(calls,[]);
 assert.equal(h({kind:'proofCheck',words:['Somnia']}).ok,true);
 const s=h({kind:'proofSuggest',word:'teh'});assert.ok(s.ok&&s.kind==='suggest'&&JSON.stringify(s.words)==='["the"]','suggestions that are not words are dropped');
 assert.equal(h({kind:'setProofing',on:true}).ok,true);
 assert.deepEqual(calls,['check ["Somnia"]','sug teh','mark true']);
});
