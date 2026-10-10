import test from 'node:test';
import assert from 'node:assert/strict';
import {installExtension,enabledIds} from './registry';
import {storagePrefix,migrateStorageKeys,countStorageKeys,MAX_STORAGE_KEYS} from './storageKeys';
import {callApi} from './api';
import type {ExtensionManifest} from './types';

class LS{private m=new Map<string,string>();
 get length(){return this.m.size;}
 key(i:number){return [...this.m.keys()][i]??null;}
 getItem(k:string){return this.m.get(k)??null;}
 setItem(k:string,v:string){this.m.set(k,v);}
 removeItem(k:string){this.m.delete(k);}
}
const ls=new LS();(globalThis as any).localStorage=ls;(globalThis as any).window={dispatchEvent(){}};
const mk=(id:string,permissions:string[])=>({id,name:id,version:'1.0.0',apiVersion:1,permissions,contributes:{commands:[{id:id+'.run',title:'Run',category:'Tools'}],snippets:[],codeThemes:[],panels:[]}}) as unknown as ExtensionManifest;

test('F5: reinstall with added permissions forces the extension disabled',()=>{
 const a=installExtension(JSON.stringify(mk('acme.f5',['commands'])));
 assert.equal(a.ok,true);localStorage.setItem('somnia.extensions.enabled.v1',JSON.stringify(['acme.f5']));
 assert.deepEqual(enabledIds(),['acme.f5']);
 const b=installExtension(JSON.stringify(mk('acme.f5',['commands','ui.notify'])));
 assert.equal(b.ok,true);
 assert.deepEqual(enabledIds(),[]);
});
test('F5: reinstall without new permissions keeps the enabled flag',()=>{
 const c=installExtension(JSON.stringify(mk('acme.f5b',['commands','ui.notify'])));
 assert.equal(c.ok,true);localStorage.setItem('somnia.extensions.enabled.v1',JSON.stringify(['acme.f5b']));
 installExtension(JSON.stringify(mk('acme.f5b',['commands','ui.notify'])));
 assert.deepEqual(enabledIds(),['acme.f5b']);
});
test('storage keys never collide across dotted extension ids',()=>{
 assert.notEqual(storagePrefix('a.b'),storagePrefix('a'));
 assert.equal(storagePrefix('a.b'),'somnia.ext.a%2Eb.');
});
test('legacy raw-id storage keys are migrated to the escaped layout',()=>{
 localStorage.setItem('somnia.ext.a.b.c','v');
 migrateStorageKeys('a.b',localStorage);
 assert.equal(localStorage.getItem('somnia.ext.a%2Eb.c'),'v');
 assert.equal(localStorage.getItem('somnia.ext.a.b.c'),null);
});
test('countStorageKeys only counts the own escaped prefix',()=>{
 localStorage.setItem('somnia.ext.x%2Ey.k1','1');localStorage.setItem('somnia.ext.x%2Ey.k2','2');
 assert.equal(countStorageKeys('x.y',localStorage),2);
 assert.ok(MAX_STORAGE_KEYS>=50);
});
test('prototype method names are not api methods',()=>{
 const manifest=mk('acme.proto',[]);
 for(const m of ['constructor','__proto__','toString']){
  assert.throws(()=>callApi(manifest,m,[],{files:()=>({}),selection:()=>null,notify(){},registerHandler(){},storage:{get:()=>null,set(){}}}),/Unknown API method/);
 }
});
