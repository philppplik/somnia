import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateManifest} from './manifest';
/** Keeps docs/extensions honest: every complete manifest in the docs must pass the real validator. */
for(const file of ['08-tutorial.md','02-manifest.md']){
 test(`manifests in ${file} validate`,()=>{
  const md=readFileSync(new URL(`../../../../docs/extensions/${file}`,import.meta.url),'utf8');
  const blocks=[...md.matchAll(/```json\n([\s\S]*?)```/g)].map(m=>m[1]).filter(b=>/"apiVersion"/.test(b)&&/"id"/.test(b));
  assert.ok(blocks.length>=1);
  for(const b of blocks){const r=validateManifest(JSON.parse(b));assert.ok(r.ok,JSON.stringify(r));}
 });
}
