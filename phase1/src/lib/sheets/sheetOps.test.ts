import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSheetOp,sheetNameProblem} from './sheetOps';
test('sheet names follow the engine rules and operations come from a closed list',()=>{
 assert.equal(sheetNameProblem('Sales 2026'),null);assert.equal(sheetNameProblem('  '),'blank');assert.equal(sheetNameProblem('x'.repeat(32)),'long');assert.equal(sheetNameProblem('x'.repeat(31)),null);
 for(const c of [':','\\','/','?','*','[',']','\u0001'])assert.equal(sheetNameProblem('a'+c+'b'),'chars',c);
 assert.equal(sheetNameProblem("'x"),'apostrophe');assert.equal(sheetNameProblem('History'),'reserved');
 assert.deepEqual(parseSheetOp({kind:'add'}),{kind:'add'});assert.deepEqual(parseSheetOp({kind:'add',name:' Notes '}),{kind:'add',name:'Notes'});
 assert.deepEqual(parseSheetOp({kind:'rename',name:'Q1'}),{kind:'rename',name:'Q1'});assert.deepEqual(parseSheetOp({kind:'move',to:0}),{kind:'move',to:0});
 assert.deepEqual(parseSheetOp({kind:'duplicate'}),{kind:'duplicate'});assert.deepEqual(parseSheetOp({kind:'delete'}),{kind:'delete'});
 for(const bad of [null,[],{kind:'rename'},{kind:'rename',name:'a:b'},{kind:'add',name:5},{kind:'move',to:-1},{kind:'move',to:1.5},{kind:'move',to:255},{kind:'delete',name:'x'},{kind:'drop'}])assert.throws(()=>parseSheetOp(bad),JSON.stringify(bad));
});
