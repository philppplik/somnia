import {test} from 'node:test';
import assert from 'node:assert/strict';
import Ajv2020 from 'ajv/dist/2020.js';
import schema from './contracts/v2/manifest.schema.json';
import example from './contracts/v2/example.json';
import {validate as precompiled} from './contracts/v2/manifest.validator.js';
// Guards drift between manifest.schema.json and the build-time precompiled validator
// (scripts/generate-manifest-validator.mjs). Node has no CSP, so a fresh runtime
// compile is the reference oracle here; in the app only the precompiled one runs.
test('precompiled manifest validator matches a fresh ajv compile verdict-for-verdict',()=>{
 const reference=new Ajv2020({allErrors:true,strict:false}).compile(schema as object);
 const cases:unknown[]=[
  structuredClone(example),
  {...structuredClone(example),name:undefined},
  {...structuredClone(example) as object,unknownTopLevel:true},
  {...structuredClone(example),manifestVersion:1},
  {...structuredClone(example),version:'not-semver'},
  null,42,'x',{},
 ];
 for(const c of cases){
  const a=precompiled(c),b=reference(c);
  assert.equal(a,b,`verdict mismatch on ${JSON.stringify(c)?.slice(0,60)}`);
  if(!a) assert.ok((precompiled.errors??[]).length>0,'errors populated');
 }
});
