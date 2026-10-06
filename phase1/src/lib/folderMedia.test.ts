import test from 'node:test';
import assert from 'node:assert/strict';
import {base64ToBlob} from './folderMedia';
test('base64ToBlob restores the exact bytes',async()=>{
 const bytes=Uint8Array.from([0x89,0x50,0x4e,0x47,0,255,128]);
 const b=base64ToBlob(Buffer.from(bytes).toString('base64'));
 assert.deepEqual(new Uint8Array(await b.arrayBuffer()),bytes);
});
