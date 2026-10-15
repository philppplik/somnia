import {test} from 'node:test';import assert from 'node:assert/strict';
import {parsePivotCommand,parsePivotFields,parseTableCommand,parseTables,tableBlockProblem} from './tableOps';
test('parseTableCommand',()=>{
 assert.deepEqual(parseTableCommand({kind:'create'}),{kind:'create'});
 assert.deepEqual(parseTableCommand({kind:'create',name:' Orders ',style:'TableStyleLight3'}),{kind:'create',name:'Orders',style:'TableStyleLight3'});
 assert.deepEqual(parseTableCommand({kind:'totals',table:'T',on:true}),{kind:'totals',table:'T',on:true});
 assert.deepEqual(parseTableCommand({kind:'rename',table:'T',newName:'U'}),{kind:'rename',table:'T',newName:'U'});
 assert.deepEqual(parseTableCommand({kind:'convert',table:'T'}),{kind:'convert',table:'T'});
 for(const bad of [null,[],{},{kind:'x'},{kind:'create',name:'a b'},{kind:'create',style:'Fancy'},{kind:'create',x:1},{kind:'totals',table:'T'},{kind:'totals',on:true},{kind:'banded',table:'T',on:'y'},{kind:'style',table:'T',style:'TableStyleLight3;'},{kind:'rename',table:'T',newName:'A1'},{kind:'rename',table:'T',newName:''},{kind:'convert'},{kind:'convert',table:'x'.repeat(65)}])assert.throws(()=>parseTableCommand(bad),JSON.stringify(bad));
});
test('parsePivotCommand',()=>{
 assert.deepEqual(parsePivotCommand({kind:'refresh'}),{kind:'refresh'});
 assert.deepEqual(parsePivotCommand({kind:'create',rows:'Region',values:'Sales'}),{kind:'create',rows:'Region',values:'Sales'});
 assert.deepEqual(parsePivotCommand({kind:'create',rows:'Region',columns:'Qtr',values:'Sales',func:'average'}),{kind:'create',rows:'Region',columns:'Qtr',values:'Sales',func:'average'});
 for(const bad of [null,{},{kind:'create'},{kind:'create',rows:'a'},{kind:'create',rows:'a',values:' '},{kind:'create',rows:'a',columns:'a',values:'b'},{kind:'create',rows:'a',values:'b',func:'median'},{kind:'create',rows:'a\u0001',values:'b'},{kind:'create',rows:'a',values:'b',x:1},{kind:'refresh',rows:'a'}])assert.throws(()=>parsePivotCommand(bad),JSON.stringify(bad));
});
test('answers are parsed tolerantly',()=>{
 assert.deepEqual(parseTables({tables:[{name:'T',range:'A1:B3',header:true,totals:false,banded:true,style:'TableStyleLight1'},{name:1},null],styles:['TableStyleLight1','x']}),{tables:[{name:'T',range:'A1:B3',header:true,totals:false,banded:true,style:'TableStyleLight1'}],styles:['TableStyleLight1']});
 assert.deepEqual(parseTables({tables:'x',styles:7}),{tables:[],styles:[]});
 assert.deepEqual(parsePivotFields({fields:[{name:'a',numeric:true},{name:2},null]}),[{name:'a',numeric:true}]);assert.deepEqual(parsePivotFields({fields:1}),[]);
 assert.equal(tableBlockProblem(2,1),null);assert.equal(tableBlockProblem(1,3),'small');assert.equal(tableBlockProblem(2_000_000,1),'large');
});
