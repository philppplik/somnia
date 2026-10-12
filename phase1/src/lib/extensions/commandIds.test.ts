import test from 'node:test';
import assert from 'node:assert/strict';
import {extensionCommandId} from './commandIds';
import {isCommandId} from '../commandSpec';

test('extension command ids become strict dispatcher ids',()=>{
 for(const id of['acme.format-code','acme.cmd.Run Me','acme.zip','a-b.snippet.0','acme..x','acme.x.','acme.ünï'])assert.ok(isCommandId(extensionCommandId(id)),id);
});
test('mapping is injective',()=>{
 const ids=['a-b.c','ab.c','a.b.c','aZ002db.c','a.z','a.Z','acme.x-y','acme.xZ002dy'];
 assert.equal(new Set(ids.map(extensionCommandId)).size,ids.length);
});
test('plain ids stay readable',()=>assert.equal(extensionCommandId('acme.format'),'ext.acme.format'));
