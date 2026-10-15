import {test} from 'node:test';import assert from 'node:assert/strict';
import {buildValidationOp,parseItemList,parseValidationCommand} from './validationOps';
test('parseValidationCommand accepts each shape',()=>{
 for(const ok of [{kind:'list',items:['a','b']},{kind:'listRange',source:'A1:A9'},{kind:'number',whole:true,operator:'between',value:1,value2:10},{kind:'number',whole:false,operator:'greater',value:0},{kind:'length',operator:'lessOrEqual',value:20},{kind:'clear'}])assert.deepEqual(parseValidationCommand(ok),ok);
});
test('parseValidationCommand rejects malformed input',()=>{
 for(const bad of [null,[],{},{kind:'custom',formula:'=1'},{kind:'list',items:[]},{kind:'list',items:['a,b']},{kind:'list',items:['a"b']},{kind:'list',items:[1]},{kind:'list',items:Array(101).fill('x')},{kind:'listRange',source:'Other!A1'},{kind:'listRange',source:'A0'},{kind:'listRange',source:'A1:B2:C3'},{kind:'number',whole:true,operator:'between',value:1},{kind:'number',whole:true,operator:'greater',value:1,value2:2},{kind:'number',whole:'y',operator:'greater',value:1},{kind:'number',whole:true,operator:'greater',value:Infinity},{kind:'number',whole:true,operator:'regex',value:1},{kind:'clear',x:1}])assert.throws(()=>parseValidationCommand(bad),JSON.stringify(bad));
});
test('parseItemList trims, dedupes and refuses unusable lists',()=>{
 assert.deepEqual(parseItemList(' a, b ,a,,c '),['a','b','c']);
 assert.equal(parseItemList(' , '),null);assert.equal(parseItemList('a"b'),null);assert.equal(parseItemList('x'.repeat(65)),null);
});
test('buildValidationOp maps panel input',()=>{
 assert.deepEqual(buildValidationOp('list','greater','Yes, No','',),{kind:'list',items:['Yes','No']});
 assert.deepEqual(buildValidationOp('listRange','greater','$a$1:$a$5',''),{kind:'listRange',source:'A1:A5'});
 assert.deepEqual(buildValidationOp('whole','between','1','10'),{kind:'number',whole:true,operator:'between',value:1,value2:10});
 assert.deepEqual(buildValidationOp('length','lessOrEqual','20',''),{kind:'length',operator:'lessOrEqual',value:20});
 assert.equal(buildValidationOp('decimal','greater','x',''),null);assert.equal(buildValidationOp('whole','between','1',''),null);assert.equal(buildValidationOp('list','greater','',''),null);
});
