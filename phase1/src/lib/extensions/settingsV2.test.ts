import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stringify} from 'smol-toml';
import example from './contracts/v2/example.json';
import {parseManifestV2,validateManifestV2} from './manifestV2';
import {ContributionRegistry,NativeContributionStore} from './contributions';
const fresh=()=>structuredClone(example);
const invalid=(m:unknown,path:string)=>{const r=validateManifestV2(m); assert.equal(r.ok,false); if(!r.ok) assert(r.errors.some(e=>e.path===path),JSON.stringify(r.errors));};

test('example manifest carries typed settings through TOML round-trip',()=>{
 const r=parseManifestV2(stringify(fresh()),{somniaVersion:'12.3.0',apiVersion:'2.0.0'});
 assert.equal(r.ok,true); if(r.ok) assert.deepEqual(JSON.parse(JSON.stringify(r.manifest)),fresh());
});

test('settings must live inside the extension namespace',()=>{
 const m:any=fresh(); m.contributes.settings[0].id='other.ext.sneaky'; invalid(m,'/contributes/settings/0/id');
 const bare:any=fresh(); bare.contributes.settings[0].id='include-footnotes'; invalid(bare,'/contributes/settings/0/id');
});

test('defaults must match the declared type',()=>{
 const m:any=fresh(); m.contributes.settings[0].default='yes'; invalid(m,'/contributes/settings/0/default');
 const n:any=fresh(); n.contributes.settings.push({id:'acme.word-count.limit',type:'number',title:'Limit',default:1e309}); invalid(n,'/contributes/settings/2/default');
 const ok:any=fresh(); ok.contributes.settings.push({id:'acme.word-count.limit',type:'number',title:'Limit',default:500}); assert.equal(validateManifestV2(ok).ok,true);
});

test('enum rules: values required with type enum, forbidden otherwise, default must be listed',()=>{
 const noList:any=fresh(); delete noList.contributes.settings[1].enum; invalid(noList,'/contributes/settings/1/enum');
 const badDefault:any=fresh(); badDefault.contributes.settings[1].default='unknown-metric'; invalid(badDefault,'/contributes/settings/1/default');
 const stray:any=fresh(); stray.contributes.settings[0].enum=['a','b']; invalid(stray,'/contributes/settings/0/enum');
});

test('schema rejects unknown keys and overlong fields',()=>{
 const m:any=fresh(); m.contributes.settings[0].script='evil()'; invalid(m,'/contributes/settings/0/script');
 const long:any=fresh(); long.contributes.settings[0].title='x'.repeat(121); invalid(long,'/contributes/settings/0/title');
});

test('duplicate setting ids are rejected',()=>{
 const m:any=fresh(); m.contributes.settings.push({...m.contributes.settings[0]}); invalid(m,'/contributes/settings/2/id');
});

const metaOnly=()=>{const m:any=fresh(); m.contributes={settings:m.contributes.settings}; return m;};

test('registry registers settings as pure metadata under their full id, no asset required',()=>{
 const store=new NativeContributionStore();
 const registry=new ContributionRegistry(store);
 registry.register(metaOnly(),{});
 const items=[...store.snapshot().items.values()];
 assert.equal(items.length,2);
 assert.equal(items[0]?.family,'settings');
 assert.equal(items[0]?.fullId,'acme.word-count.include-footnotes');
 assert.equal(items[0]?.asset,undefined);
 registry.remove('acme.word-count');
 assert.equal(store.snapshot().items.size,0);
});

test('registry rejects a second extension registering the same setting id',()=>{
 const store=new NativeContributionStore();
 const registry=new ContributionRegistry(store);
 registry.register(metaOnly(),{});
 const other:any=metaOnly(); other.id='acme.other';
 assert.throws(()=>registry.register(other,{}),/already registered|Remove existing/);
});
