import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stringify} from 'smol-toml';
import example from './contracts/v2/example.json';
import {parseManifestV2,validateManifestV2} from './manifestV2';
import {ContributionRegistry,NativeContributionStore} from './contributions';
const fresh=()=>structuredClone(example);
const invalid=(m:unknown,path:string)=>{const r=validateManifestV2(m); assert.equal(r.ok,false); if(!r.ok) assert(r.errors.some(e=>e.path===path),JSON.stringify(r.errors));};

test('example manifest carries a language registration through TOML round-trip',()=>{
 const r=parseManifestV2(stringify(fresh()),{somniaVersion:'12.3.0',apiVersion:'2.0.0'});
 assert.equal(r.ok,true); if(r.ok) assert.deepEqual(JSON.parse(JSON.stringify(r.manifest)),fresh());
});

test('schema rejects bad ids, dotless extensions and unknown keys',()=>{
 const m:any=fresh(); m.contributes.languages[0].id='WordList'; invalid(m,'/contributes/languages/0/id');
 const e:any=fresh(); e.contributes.languages[0].extensions=['wl']; invalid(e,'/contributes/languages/0/extensions/0');
 const x:any=fresh(); x.contributes.languages[0].script='evil()'; invalid(x,'/contributes/languages/0/script');
});

test('duplicate language ids are rejected inside one extension',()=>{
 const m:any=fresh(); m.contributes.languages.push({id:'wordlist',aliases:['Other'],extensions:['.wl2']}); invalid(m,'/contributes/languages/1/id');
});

test('grammar path must be a safe package path',()=>{
 const m:any=fresh(); m.contributes.languages[0].path='../escape/grammar.json'; invalid(m,'/contributes/languages/0/path');
 const abs:any=fresh(); abs.contributes.languages[0].path='/etc/passwd'; invalid(abs,'/contributes/languages/0/path');
});

test('registry registers a grammar-less language as pure metadata',()=>{
 const store=new NativeContributionStore();
 const registry=new ContributionRegistry(store);
 const m:any=fresh(); m.contributes={languages:m.contributes.languages};
 registry.register(m,{});
 const items=[...store.snapshot().items.values()];
 assert.equal(items.length,1);
 assert.equal(items[0]?.family,'languages');
 assert.equal(items[0]?.fullId,'acme.word-count.wordlist');
 assert.equal(items[0]?.asset,undefined);
 registry.remove('acme.word-count');
 assert.equal(store.snapshot().items.size,0);
});

test('registry stages a grammar asset and rejects invalid grammar JSON',()=>{
 const grammar=new TextEncoder().encode(JSON.stringify({scopeName:'source.wordlist',patterns:[{match:'\\b\\w+\\b',name:'word'}]}));
 const bad=new TextEncoder().encode(JSON.stringify({name:'no-scope'}));
 const m:any=fresh(); m.contributes={languages:[{id:'wordlist',aliases:['Word list'],extensions:['.wl'],path:'grammars/wordlist.json'}]};
 const store=new NativeContributionStore();
 const registry=new ContributionRegistry(store);
 registry.register(m,{'grammars/wordlist.json':grammar});
 const items=[...store.snapshot().items.values()];
 assert.equal(items[0]?.asset?.length,grammar.length);
 const store2=new NativeContributionStore();
 const registry2=new ContributionRegistry(store2);
 assert.throws(()=>registry2.register(m,{'grammars/wordlist.json':bad}),/Invalid TextMate grammar/);
 assert.throws(()=>registry2.register(m,{}),/asset is missing/);
});
