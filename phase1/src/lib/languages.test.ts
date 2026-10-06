import test from 'node:test';
import assert from 'node:assert/strict';
import {modeFor} from './languages';
import {computeDiagnostics} from './diagnostics';
import {formatCode,langFor} from './format';
test('file names map to editor modes',()=>{
 const m:Record<string,string>={'a.html':'html','b.HTM':'html','x/c.css':'css','d.js':'javascript','e.mjs':'javascript','f.jsx':'javascript','g.ts':'typescript','h.tsx':'typescript','i.json':'json','manifest.webmanifest':'json','tsconfig.jsonc':'json','j.png':'plain','k.txt':'plain','l.svg':'plain'};
 for(const[f,e]of Object.entries(m))assert.equal(modeFor(f),e,f);});
test('Markdown files get the markdown mode, other text stays plain',()=>{assert.equal(modeFor('a.md'),'markdown');assert.equal(modeFor('docs/README.MD'),'markdown');assert.equal(modeFor('x.markdown'),'markdown');assert.equal(modeFor('a.txt'),'plain');});
test('JSON problems are reported with a line number, valid JSON is clean',()=>{
 assert.deepEqual(computeDiagnostics('data.json','{"a":1,"b":[1,2,3]}'),[]);
 const p=computeDiagnostics('data.json','{\n"a":1,\n"b":,\n}');assert.ok(p.length>0&&p.every(x=>x.severity==='error'),JSON.stringify(p));assert.ok(p.some(x=>x.line>=3),JSON.stringify(p));});
test('JS and CSS problems still work after the language refactor',()=>{
 assert.deepEqual(computeDiagnostics('a.js','const a = {b: 1};\nfunction f(){return a}'),[]);
 assert.ok(computeDiagnostics('a.js','function (').length>0);
 assert.deepEqual(computeDiagnostics('a.css','a{color:red}'),[]);});
test('JSON is formatted with the chosen indent',async()=>{
 assert.equal(langFor('x.json'),'json');
 assert.equal(await formatCode('{"a":1,"b":[1,2]}','json',{indent:4}),'{ "a": 1, "b": [1, 2] }\n');
 assert.equal(await formatCode('{\n"a":1,"b":[1,2]}','json',{indent:2}),'{\n  "a": 1,\n  "b": [1, 2]\n}\n');});
