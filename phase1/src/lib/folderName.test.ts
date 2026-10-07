import test from 'node:test';import assert from 'node:assert/strict';
import {folderNameFor} from './folderName';
test('folderNameFor sanitises like the save flow',()=>{
 assert.equal(folderNameFor('Bäckerei Sonnenschein'),'Bäckerei Sonnenschein');
 assert.equal(folderNameFor('a/b:c?'),'a_b_c_');
 assert.equal(folderNameFor(''),'somnia-project');
 assert.equal(folderNameFor('x. '),'x');
 assert.equal(folderNameFor('y'.repeat(120)).length,80);
});
