import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(process.cwd().endsWith('phase1')?'..':'.');
const spec=readFileSync(resolve(root,'docs/design/pdf-layout-tools.md'),'utf8');
const tokens=readFileSync(resolve(root,'phase1/src/styles/tokens.css'),'utf8');
test('every existing token named in the spec is defined',()=>{
 const block=spec.split('Existing tokens used:')[1].split('Component-local values')[0];
 const names=[...block.matchAll(/`(--[a-z-]+)`/g)].map(m=>m[1]);
 assert.ok(names.length>20);
 for(const n of names)assert.ok(tokens.includes(n+':'),`missing token ${n}`);
});
test('i18n key table is well formed',()=>{
 const rows=[...spec.matchAll(/^\| `(pdf\.[A-Za-z.]+)` \| (.+?) \| (.+?) \|$/gm)];
 assert.ok(rows.length>=35);
 const keys=rows.map(r=>r[1]);assert.equal(new Set(keys).size,keys.length);
 for(const r of rows){assert.ok(r[2].trim());assert.ok(r[3].trim());}
});
test('spec style rules',()=>{
 assert.ok(!spec.includes('\u2014'));assert.ok(!/TODO|TBD/.test(spec));
});
