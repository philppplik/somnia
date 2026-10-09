import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {lintPackage,buildZip} from './authoring';
import {parsePackageZip} from './packageInstall';
const dir=(p:string)=>{const base=new URL(`../../../${p}/`,import.meta.url);const o:Record<string,Uint8Array>={};for(const n of readdirSync(base))o[n]=new Uint8Array(readFileSync(new URL(n,base)));return o;};
for(const [folder,id] of [['editorial-metrics','somnia.editorial-metrics'],['todo-navigator','somnia.todo-navigator']] as const){
 test(`${folder}: valid, index-eligible, no warnings, panel.html is in sync`,()=>{
  const f=dir(`examples/${folder}`);const r=lintPackage(f);
  assert.ok(r.ok,JSON.stringify(r.errors));assert.equal(r.catalogReady,true);assert.deepEqual(r.warnings,[]);
  assert.equal(r.manifest!.id,id);assert.deepEqual(r.manifest!.permissions,['project.read','storage']);
  const html=r.manifest!.contributes.panels[0].html;assert.ok(html.length<50000);
  assert.equal(html,new TextDecoder().decode(f['panel.html']).trim(),'run node scripts/build-example-panels.mjs');
  assert.doesNotMatch(html,/\.write\(|innerHTML|outerHTML|eval\(|new Function|fetch\(|XMLHttpRequest|https?:\/\//);
  const a=buildZip(f);assert.deepEqual(a,buildZip(f));assert.ok(parsePackageZip(a).ok);
 });
}
