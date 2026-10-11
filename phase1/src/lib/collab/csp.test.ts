import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const conf=JSON.parse(readFileSync(new URL('../../../src-tauri/tauri.conf.json',import.meta.url),'utf8')).app.security as {csp:string;devCsp:string};
const connect=(csp:string)=>csp.split(';').map(s=>s.trim()).find(s=>s.startsWith('connect-src '))!.split(/\s+/).slice(1);
test('connect-src allows user-chosen ws/wss hosts for collaboration, and nothing broader',()=>{
 for(const csp of [conf.csp,conf.devCsp]){const c=connect(csp);
  assert.ok(c.includes('ws:')&&c.includes('wss:'));
  assert.equal(c.includes('*'),false);assert.equal(c.includes('http:'),false);assert.equal(c.includes('https:'),false);}
 assert.match(conf.csp,/default-src 'self'/);assert.match(conf.csp,/object-src 'none'/);});
test('connect-src allows blob: so studios can fetch() the blob URLs of opened local files',()=>{
 for(const csp of [conf.csp,conf.devCsp]){assert.ok(connect(csp).includes('blob:'),'connect-src must include blob: (fetch(item.url) of opened files)');}
});
test('every studio that reads opened files via fetch(item.url) is covered by blob: in connect-src',()=>{
 for(const csp of [conf.csp,conf.devCsp]){const c=connect(csp);assert.equal(c.includes('data:'),false);assert.equal(c.includes('filesystem:'),false);}
});
