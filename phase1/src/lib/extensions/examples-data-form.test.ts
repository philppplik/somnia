import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {lintPackage} from './authoring';
const dir=(p:string)=>{const base=new URL(`../../../${p}/`,import.meta.url);const o:Record<string,Uint8Array>={};for(const n of readdirSync(base))o[n]=new Uint8Array(readFileSync(new URL(n,base)));return o;};
for(const [name,perms] of [['data-workbench',['project.read','storage']],['form-kit',['project.read']]] as const){
 test(`${name} example is valid, index-eligible and has no warnings`,()=>{const r=lintPackage(dir(`examples/${name}`));assert.ok(r.ok,r.errors.join('\n'));assert.equal(r.catalogReady,true);assert.deepEqual(r.warnings,[]);assert.deepEqual(r.manifest!.permissions,perms);assert.equal(r.manifest!.code,undefined);});
}
test('form-kit snippets stay under 8000 characters and have no tab stops',()=>{const m=lintPackage(dir('examples/form-kit')).manifest!;assert.ok(m.contributes.snippets.length>=4);for(const s of m.contributes.snippets){assert.ok(s.body.length<8000);assert.ok(!/\$\d|\$\{/.test(s.body),s.label);}});
test('example panels only use the panel API and never touch the network or eval',()=>{for(const n of ['data-workbench','form-kit']){const p=lintPackage(dir(`examples/${n}`)).manifest!.contributes.panels[0].html;assert.ok(p.length<50000);assert.ok(!/\b(fetch|XMLHttpRequest|eval|innerHTML|insertAdjacentHTML|document\.write|navigator\.clipboard)\b|new Function|https?:\/\//.test(p.replace(/<script>document\.write[^<]*<\/script>/,'')),n);assert.ok(!/applyOperations/.test(p));}});
