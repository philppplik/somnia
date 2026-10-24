import test from 'node:test';
import assert from 'node:assert/strict';
import {nextCopyName} from './virtualCopy.ts';
test('first copy, counter skips taken names, extension kept',()=>{
 const taken=new Set<string>();
 assert.equal(nextCopyName('strip-1.png','Kopie',n=>taken.has(n)),'strip-1 (Kopie 1).png');
 taken.add('strip-1 (Kopie 1).png');taken.add('strip-1 (Kopie 2).png');
 assert.equal(nextCopyName('strip-1.png','Kopie',n=>taken.has(n)),'strip-1 (Kopie 3).png');
 assert.equal(nextCopyName('archive.tar.gz','Kopie',()=>false),'archive.tar (Kopie 1).gz');
 assert.equal(nextCopyName('noext','Kopie',()=>false),'noext (Kopie 1)');
 assert.equal(nextCopyName('strip-1.png','Copy',()=>false),'strip-1 (Copy 1).png'); // localized word
});
