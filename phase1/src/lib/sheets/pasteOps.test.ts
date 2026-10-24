import test from 'node:test';import assert from 'node:assert/strict';
import {parsePasteCommand} from './pasteOps';
test('paste special accepts only the known kinds',()=>{
 assert.deepEqual(parsePasteCommand({}),{what:'all'});
 assert.deepEqual(parsePasteCommand({what:'values',transpose:true,skipBlanks:false}),{what:'values',transpose:true});
 assert.deepEqual(parsePasteCommand({what:'values',operation:'add'}),{what:'values',operation:'add'});
 assert.deepEqual(parsePasteCommand({what:'formats',operation:'none'}),{what:'formats'});
 for(const bad of [null,[],'x',{what:'nope'},{what:'formats',operation:'add'},{operation:'pow'},{operation:1},{transpose:'y'},{x:1}])assert.throws(()=>parsePasteCommand(bad),JSON.stringify(bad));
});
