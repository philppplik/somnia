import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {lintPackage} from './authoring';
const dir=(p:string)=>{const base=new URL(`../../../${p}/`,import.meta.url);const o:Record<string,Uint8Array>={};for(const n of readdirSync(base))o[n]=new Uint8Array(readFileSync(new URL(n,base)));return o;};
const CASES:[string,string,string[]][]=[
 ['css-variable-inventory','somnia.css-variable-inventory',['project.read']],
 ['locale-parity','somnia.locale-parity',['project.read','storage']],
];
for(const [folder,id,perms] of CASES)test(`panel example ${folder} is valid, index-eligible and read-only`,()=>{
 const r=lintPackage(dir(`examples/${folder}`));
 assert.ok(r.ok,String(r.errors));assert.equal(r.catalogReady,true);assert.deepEqual(r.warnings,[]);
 assert.equal(r.manifest!.id,id);assert.deepEqual([...r.manifest!.permissions].sort(),[...perms].sort());
 const panels=r.manifest!.contributes!.panels!;assert.equal(panels.length,1);
 const html=panels[0].html;assert.ok(html.length<=50000);
 assert.ok(!/https?:\/\//i.test(html),'panel must not reference the network');
 assert.ok(!/innerHTML|insertAdjacentHTML|eval\(|new Function|applyOperations/.test(html),'results are written with textContent only');
});
