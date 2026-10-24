import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stringify} from 'smol-toml';
import example from './contracts/v2/example.json';
import {parseManifestV2,validateManifestV2} from './manifestV2';
import {ContributionRegistry,NativeContributionStore} from './contributions';
const fresh=()=>structuredClone(example);
const invalid=(m:unknown,path:string)=>{const r=validateManifestV2(m); assert.equal(r.ok,false); if(!r.ok) assert(r.errors.some(e=>e.path===path),JSON.stringify(r.errors));};

test('example manifest carries a snippet set through TOML round-trip',()=>{
 const r=parseManifestV2(stringify(fresh()),{somniaVersion:'12.3.0',apiVersion:'2.0.0'});
 assert.equal(r.ok,true); if(r.ok) assert.deepEqual(JSON.parse(JSON.stringify(r.manifest)),fresh());
});

test('schema rejects bad language ids, missing label and unknown keys',()=>{
 const m:any=fresh(); m.contributes.snippets[0].language='WordList'; invalid(m,'/contributes/snippets/0/language');
 const l:any=fresh(); delete l.contributes.snippets[0].label; invalid(l,'/contributes/snippets/0/label');
 const x:any=fresh(); x.contributes.snippets[0].script='evil()'; invalid(x,'/contributes/snippets/0/script');
});

test('duplicate snippet-set ids are rejected inside one extension',()=>{
 const m:any=fresh(); m.contributes.snippets.push({id:'wordlist-snippets',label:'Other',language:'html',path:'snippets/other.json'}); invalid(m,'/contributes/snippets/1/id');
});

test('snippet path must be a safe package path',()=>{
 const m:any=fresh(); m.contributes.snippets[0].path='../escape/snippet.json'; invalid(m,'/contributes/snippets/0/path');
 const abs:any=fresh(); abs.contributes.snippets[0].path='/etc/passwd'; invalid(abs,'/contributes/snippets/0/path');
});

test('registry stages a snippet asset and rejects invalid snippet data or a missing asset',()=>{
 const good=new TextEncoder().encode(JSON.stringify({body:'word ${1:list}',description:'Word list starter'}));
 const noBody=new TextEncoder().encode(JSON.stringify({description:'no body'}));
 const m:any=fresh(); m.contributes={snippets:m.contributes.snippets};
 const store=new NativeContributionStore();
 const registry=new ContributionRegistry(store);
 registry.register(m,{'snippets/wordlist.json':good});
 const items=[...store.snapshot().items.values()];
 assert.equal(items.length,1);
 assert.equal(items[0]?.family,'snippets');
 assert.equal(items[0]?.fullId,'acme.word-count.wordlist-snippets');
 assert.equal(items[0]?.asset?.length,good.length);
 registry.remove('acme.word-count');
 assert.equal(store.snapshot().items.size,0);
 const store2=new NativeContributionStore();
 const registry2=new ContributionRegistry(store2);
 assert.throws(()=>registry2.register(m,{'snippets/wordlist.json':noBody}),/Invalid snippet data/);
 // The CodeMirror snippet parser is intentionally lenient about incomplete placeholders; the safety gate is that insertion parses with the real parser, never template evaluation.
 assert.throws(()=>registry2.register(m,{}),/asset is missing/);
});

test('snippet assets obey the 32 KiB budget',()=>{
 const m:any=fresh(); m.contributes={snippets:m.contributes.snippets};
 const big=new TextEncoder().encode(JSON.stringify({body:'x'.repeat(33*1024)}));
 const registry=new ContributionRegistry(new NativeContributionStore());
 assert.throws(()=>registry.register(m,{'snippets/wordlist.json':big}),/budget/);
});
