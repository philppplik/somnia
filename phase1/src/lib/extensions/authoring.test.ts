import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {strToU8} from 'fflate';
import {lintPackage,buildZip,makeIndexEntry,rawZipURL,fillTemplate} from './authoring';
import {parsePackageZip} from './packageInstall';
const dir=(p:string)=>{const base=new URL(`../../../${p}/`,import.meta.url);const o:Record<string,Uint8Array>={};for(const n of readdirSync(base))o[n]=new Uint8Array(readFileSync(new URL(n,base)));return o;};
test('sample extension is valid and index-eligible',()=>{const r=lintPackage(dir('examples/section-kit'));assert.ok(r.ok);assert.equal(r.catalogReady,true);assert.deepEqual(r.warnings,[]);});
test('template, once filled, validates and warns about worker code',()=>{
 const f=dir('templates/extension');const filled:Record<string,Uint8Array>={};
 for(const [n,b] of Object.entries(f))filled[n]=strToU8(fillTemplate(new TextDecoder().decode(b),{id:'acme.my-tool',name:'My Tool'}));
 const r=lintPackage(filled);assert.ok(r.ok,JSON.stringify(r));assert.equal(r.catalogReady,false);assert.ok(r.warnings.some(w=>/worker code/.test(w)));
});
test('invalid manifest reports errors; missing README/LICENSE warn',()=>{
 const bad=lintPackage({'somnia-extension.json':strToU8('{"id":"x"}')});assert.equal(bad.ok,false);assert.ok(bad.errors.length>0);
 const ok=lintPackage({'somnia-extension.json':strToU8(JSON.stringify({id:'a.b',name:'B',version:'1.0.0',apiVersion:1,permissions:[]}))});
 assert.ok(ok.ok);assert.equal(ok.warnings.filter(w=>/README|LICENSE|contributes nothing/.test(w)).length,3);
});
test('zip is deterministic, installable and index entry validates',()=>{
 const f=dir('examples/section-kit');const a=buildZip(f),b=buildZip(f);
 assert.deepEqual(a,b);assert.ok(parsePackageZip(a).ok);
 const sha=createHash('sha256').update(a).digest('hex');
 const m=lintPackage(f).manifest!;
 const e=makeIndexEntry(m,{author:'Somnia',description:'Sample',repo:'https://github.com/acme/section-kit',download:rawZipURL('https://github.com/acme/section-kit','v1.0.0','dist/section-kit-1.0.0.zip'),sha256:sha});
 assert.equal(e.id,'somnia.section-kit');
 assert.throws(()=>makeIndexEntry(m,{author:'a',description:'d',repo:'https://github.com/acme/x',download:'https://example.com/x.zip',sha256:sha}));
 assert.throws(()=>rawZipURL('https://example.com/x','v1','a.zip'));
});
test('docs manifests validate',()=>{
 const md=readFileSync(new URL('../../../../docs/extensions/12-authoring-kit.md',import.meta.url),'utf8');
 const blocks=[...md.matchAll(/```json\n([\s\S]*?)```/g)].map(m=>m[1]).filter(b=>/"apiVersion"/.test(b));
 assert.ok(blocks.length>=1);for(const b of blocks)assert.ok(lintPackage({'somnia-extension.json':strToU8(b),'main.js':strToU8('await 0;')}).ok);
});
