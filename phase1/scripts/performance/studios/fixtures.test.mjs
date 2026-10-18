import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {fixtureInventory} from './fixtures.mjs';
test('fixture inventory hashes real files and counts expanded archive bytes',()=>{
 const result=fixtureInventory(fileURLToPath(new URL('../../../',import.meta.url)));
 assert.equal(result.length,4);
 assert.equal(result[0].sha256,'45c9ad9233b4a2a40c0fa1beb85e33b66cef020c4dbce355047bb2265349f355');
 for(const f of result){assert.ok(f.bytes>0);assert.ok(f.expandedBytes>f.bytes);assert.ok(f.parts>1);assert.match(f.sha256,/^[a-f0-9]{64}$/);}
});
