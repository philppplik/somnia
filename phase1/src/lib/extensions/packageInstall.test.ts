import {test} from 'node:test';import assert from 'node:assert/strict';import {strToU8} from 'fflate';
import {installFromFiles} from './packageInstall';
(globalThis as any).window=globalThis;(globalThis as any).CustomEvent=class{constructor(public type:string){}};(globalThis as any).dispatchEvent=()=>true;
const ls=new Map<string,string>();(globalThis as any).localStorage={getItem:(k:string)=>ls.get(k)??null,setItem:(k:string,v:string)=>void ls.set(k,v),removeItem:(k:string)=>void ls.delete(k)};
const man={id:'t.pkg',name:'Pkg',version:'1.0.0',apiVersion:1,main:'main.js',permissions:['commands'],contributes:{commands:[{id:'t.pkg.run',title:'Run',category:'Tools'}]}};
test('package: manifest main is inlined as code',()=>{const r=installFromFiles({'pkg/manifest.json':strToU8(JSON.stringify(man)),'pkg/main.js':strToU8('// hi')});assert.equal(r.ok,true);if(r.ok)assert.equal(r.manifest.code,'// hi');});
test('package: missing manifest, missing main and unsafe paths are rejected',()=>{assert.equal(installFromFiles({'a.txt':strToU8('x')}).ok,false);assert.equal(installFromFiles({'manifest.json':strToU8(JSON.stringify(man))}).ok,false);assert.equal(installFromFiles({'manifest.json':strToU8('{}'),'../x':strToU8('x')}).ok,false);});
