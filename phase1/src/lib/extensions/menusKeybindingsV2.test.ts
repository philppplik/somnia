import {test} from 'node:test';
import assert from 'node:assert/strict';
import {stringify} from 'smol-toml';
import example from './contracts/v2/example.json';
import {parseManifestV2,validateManifestV2} from './manifestV2';
import {ContributionRegistry,NativeContributionStore} from './contributions';
const fresh=()=>structuredClone(example);
const invalid=(m:unknown,path:string)=>{const r=validateManifestV2(m); assert.equal(r.ok,false); if(!r.ok) assert(r.errors.some(e=>e.path===path),JSON.stringify(r.errors));};

test('example manifest carries a menu placement and a keybinding through TOML round-trip',()=>{
 const r=parseManifestV2(stringify(fresh()),{somniaVersion:'12.3.0',apiVersion:'2.0.0'});
 assert.equal(r.ok,true); if(r.ok) assert.deepEqual(JSON.parse(JSON.stringify(r.manifest)),fresh());
});

test('menus and keybindings may only reference commands of the same extension',()=>{
 const m:any=fresh(); m.contributes.menus[0].command='acme.word-count.missing'; invalid(m,'/contributes/menus/0/command');
 const k:any=fresh(); k.contributes.keybindings[0].command='other.ext.cmd'; invalid(k,'/contributes/keybindings/0/command');
 const host=fresh() as any; host.contributes.menus[0].command='somnia.save'; invalid(host,'/contributes/menus/0/command');
});

test('duplicate placements are rejected per family identity',()=>{
 const m:any=fresh(); m.contributes.menus.push({menu:'Tools',command:'acme.word-count.count'}); invalid(m,'/contributes/menus/1/command');
 const sameOtherMenu:any=fresh(); sameOtherMenu.contributes.menus.push({menu:'Edit',command:'acme.word-count.count'}); assert.equal(validateManifestV2(sameOtherMenu).ok,true);
 const k:any=fresh(); k.contributes.keybindings.push({command:'acme.word-count.count',key:'Ctrl+F8'}); invalid(k,'/contributes/keybindings/1/command');
});

test('schema rejects unknown menus, unsafe shortcuts and extra keys',()=>{
 const m:any=fresh(); m.contributes.menus[0].menu='Secret'; invalid(m,'/contributes/menus/0/menu');
 const noMod:any=fresh(); noMod.contributes.keybindings[0].key='F5'; invalid(noMod,'/contributes/keybindings/0/key');
 const lower:any=fresh(); lower.contributes.keybindings[0].key='ctrl+shift+f7'; invalid(lower,'/contributes/keybindings/0/key');
 const extra:any=fresh(); extra.contributes.keybindings[0].script='evil()'; invalid(extra,'/contributes/keybindings/0/script');
});

test('when grammar gates menus and keybindings without executing code',()=>{
 const m:any=fresh(); m.contributes.menus[0].when='fetch("https://evil.invalid")'; invalid(m,'/contributes/menus/0/when');
 const k:any=fresh(); k.contributes.keybindings[0].when='unknownKey'; invalid(k,'/contributes/keybindings/0/when');
 const ok:any=fresh(); ok.contributes.menus[0].when='!isReadonly && (hasSelection || studio == "vector")'; assert.equal(validateManifestV2(ok).ok,true);
});

const metaOnly=()=>{const m:any=fresh(); m.contributes={commands:m.contributes.commands,menus:m.contributes.menus,keybindings:m.contributes.keybindings}; return m;};

test('registry registers menus and keybindings as pure metadata, no asset required',()=>{
 const store=new NativeContributionStore();
 const registry=new ContributionRegistry(store);
 registry.register(metaOnly(),{});
 const items=[...store.snapshot().items.values()];
 const menu=items.find(i=>i.family==='menus'); const keys=items.find(i=>i.family==='keybindings');
 assert.equal(menu?.fullId,'acme.word-count.Tools:acme.word-count.count');
 assert.equal(keys?.fullId,'acme.word-count.acme.word-count.count');
 assert.equal(menu?.asset,undefined); assert.equal(keys?.asset,undefined);
 registry.remove('acme.word-count');
 assert.equal(store.snapshot().items.size,0);
});

test('registry rejects a second extension placing the same namespaced ids',()=>{
 const store=new NativeContributionStore();
 const registry=new ContributionRegistry(store);
 registry.register(metaOnly(),{});
 const other:any=metaOnly();
 assert.throws(()=>registry.register(other,{}),/already registered|Remove existing/);
});
