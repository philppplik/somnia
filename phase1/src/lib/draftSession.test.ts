import test from 'node:test';import assert from 'node:assert/strict';
const ls=new Map<string,string>();(globalThis as any).localStorage={getItem:(k:string)=>ls.get(k)??null,setItem:(k:string,v:string)=>void ls.set(k,v),removeItem:(k:string)=>void ls.delete(k)};
import {readDraft,saveDraft,clearDraft} from './draftSession';
test('draft round-trips and clears',()=>{assert.equal(readDraft(),null);assert.equal(saveDraft({files:{'index.html':'<h1>x</h1>'},activeFile:'index.html',openFiles:['index.html']}),true);const d=readDraft();assert.equal(d?.files['index.html'],'<h1>x</h1>');assert.equal(d?.activeFile,'index.html');clearDraft();assert.equal(readDraft(),null);});
test('corrupt or oversized drafts are ignored',()=>{ls.set('somnia.draft.v1','{nope');assert.equal(readDraft(),null);ls.set('somnia.draft.v1',JSON.stringify({files:{a:5}}));assert.equal(readDraft(),null);assert.equal(saveDraft({files:{a:'x'.repeat(2_100_000)},activeFile:'a',openFiles:[]}),false);});
