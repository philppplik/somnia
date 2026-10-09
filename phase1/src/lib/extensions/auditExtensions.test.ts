import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {lintPackage} from './authoring';
import {validateManifest} from './manifest';
const NAMES=['accessibility-audit','seo-preflight'] as const;
const base=(n:string)=>new URL(`../../../examples/${n}/`,import.meta.url);
const pkg=(n:string)=>{const o:Record<string,Uint8Array>={};for(const f of readdirSync(base(n)))o[f]=new Uint8Array(readFileSync(new URL(f,base(n))));return o;};
for(const n of NAMES){
 test(`${n}: package is valid, index-eligible, read-only and panel-only`,()=>{
  const r=lintPackage(pkg(n));assert.ok(r.ok,JSON.stringify(r));assert.equal(r.catalogReady,true);assert.deepEqual(r.warnings,[]);
  const m=JSON.parse(readFileSync(new URL('somnia-extension.json',base(n)),'utf8'));
  assert.ok(validateManifest(m).ok);
  assert.deepEqual(m.permissions,['project.read']);
  assert.equal(m.code,undefined);assert.equal(m.main,undefined);
  assert.equal(m.contributes.panels.length,1);assert.ok(m.contributes.panels[0].html.length<50000);
 });
 test(`${n}: manifest html matches panel.html (run node build.mjs after editing)`,()=>{
  const m=JSON.parse(readFileSync(new URL('somnia-extension.json',base(n)),'utf8'));
  assert.equal(m.contributes.panels[0].html,readFileSync(new URL('panel.html',base(n)),'utf8').trim());
 });
 test(`${n}: panel renders results only with textContent and never executes or fetches`,()=>{
  const h=readFileSync(new URL('panel.html',base(n)),'utf8');
  for(const bad of ['innerHTML','outerHTML','insertAdjacentHTML','document.write','eval(','new Function','fetch(','XMLHttpRequest','WebSocket','http://','src="http'])assert.ok(!h.includes(bad),`forbidden: ${bad}`);
  assert.ok(h.includes('DOMParser'));
  assert.ok(!/somnia\.(editor|storage|ui|selection)/.test(h));
 });
}
