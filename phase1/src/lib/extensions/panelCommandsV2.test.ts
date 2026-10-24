import {test} from 'node:test';
import assert from 'node:assert/strict';
import example from './contracts/v2/example.json';
import {ContributionRegistry,NativeContributionStore} from './contributions';
const fresh=()=>structuredClone(example);
const enc=(v:unknown)=>new TextEncoder().encode(JSON.stringify(v));
const manifest=(commands:string[])=>({...fresh(),contributes:{
 commands:commands.map(id=>({id,title:id})),
 panels:[{id:'summary',title:'Word count',side:'right' as const,kind:'declarative' as const,path:'panels/summary.json'}],
}});
const view=(children:unknown[])=>({type:'group',children});

test('declarative panel command binding to a declared command registers',()=>{
 const m=manifest(['acme.word-count.count']);
 const asset=enc(view([{type:'text',text:'Total'},{type:'button',label:'Count words',command:'acme.word-count.count'}]));
 const store=new NativeContributionStore();
 new ContributionRegistry(store).register(m as never,{'panels/summary.json':asset});
 const items=[...store.snapshot().items.values()];
 assert.equal(items.length,2);
 assert.equal(items.find(i=>i.family==='panels')?.fullId,'acme.word-count.summary');
});

test('command bindings deep in the tree are validated',()=>{
 const m=manifest(['acme.word-count.count']);
 const asset=enc(view([{type:'group',children:[{type:'group',children:[{type:'button',label:'Run',command:'acme.word-count.count'}]}]}]));
 const store=new NativeContributionStore();
 new ContributionRegistry(store).register(m as never,{'panels/summary.json':asset});
 assert.equal(store.snapshot().items.size,2);
});

test('undeclared, foreign and non-string command bindings are rejected',()=>{
 const m=manifest(['acme.word-count.count']);
 const undeclared=enc(view([{type:'button',label:'Run',command:'acme.word-count.nope'}]));
 assert.throws(()=>new ContributionRegistry(new NativeContributionStore()).register(m as never,{'panels/summary.json':undeclared}),/undeclared command/);
 const foreign=enc(view([{type:'button',label:'Run',command:'other.extension.cmd'}]));
 assert.throws(()=>new ContributionRegistry(new NativeContributionStore()).register(m as never,{'panels/summary.json':foreign}),/undeclared command/);
 const nonString=enc(view([{type:'button',label:'Run',command:42}]));
 assert.throws(()=>new ContributionRegistry(new NativeContributionStore()).register(m as never,{'panels/summary.json':nonString}),/Invalid declarative panel value/);
});

test('direct sink use without a command-aware context keeps the old refusal',()=>{
 const store=new NativeContributionStore();
 const c={family:'panels' as const,fullId:'acme.word-count.summary',metadata:{id:'summary',kind:'declarative'},asset:enc({type:'button',label:'Run',command:'x.y.z'})};
 assert.throws(()=>store.validateAsset(c as never),/native command-aware validator/);
});

test('webview panels keep the isolated-bridge path and skip tree validation',()=>{
 const m={...fresh(),contributes:{commands:[{id:'acme.word-count.count',title:'Count'}],panels:[{id:'web',title:'Web',side:'right' as const,kind:'webview' as const,path:'panels/web.html'}]}};
 const store=new NativeContributionStore();
 new ContributionRegistry(store).register(m as never,{'panels/web.html':new TextEncoder().encode('<html><body>hi</body></html>')});
 assert.equal(store.snapshot().items.size,2);
});
