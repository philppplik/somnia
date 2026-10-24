import {test} from 'node:test';import assert from 'node:assert/strict';
import {callAtCaret,functionHint,signatureArgs} from './formulaHint';
const fns=[{name:'SUM',category:'Math',signature:'SUM(number1, [number2], ...)',description:'Adds numbers.'},{name:'IF',category:'Logical',signature:'IF(logical_test, value_if_true, [value_if_false])',description:'Branches.'},{name:'GETPIVOTDATA',category:'Lookup',signature:'GETPIVOTDATA(data_field, pivot_table, [field1, item1], ...)',description:'Pivot.'}];
test('callAtCaret finds the open function and its argument',()=>{
 assert.deepEqual(callAtCaret('=SUM(',5),{name:'SUM',arg:0});
 assert.deepEqual(callAtCaret('=SUM(1,2,',9),{name:'SUM',arg:2});
 assert.deepEqual(callAtCaret('=IF(A1>0,SUM(1,2),',18),{name:'IF',arg:2});
 assert.deepEqual(callAtCaret('=IF(A1>0,SUM(1,2),',15),{name:'SUM',arg:1});
 assert.deepEqual(callAtCaret('=SUM((1+2),',11),{name:'SUM',arg:1});
 assert.deepEqual(callAtCaret('=SUM({1,2,3},',13),{name:'SUM',arg:1});
 assert.deepEqual(callAtCaret('=IF("a,b(",',11),{name:'IF',arg:1});
 {const t="=SUM('My, Sheet'!A1,";assert.deepEqual(callAtCaret(t,t.length),{name:'SUM',arg:1});}
 {const t='=IF("say ""hi,"" ",';assert.deepEqual(callAtCaret(t,t.length),{name:'IF',arg:1});}
});
test('callAtCaret ignores non-formulas, closed calls and bad input',()=>{
 assert.equal(callAtCaret('SUM(1',5),null);assert.equal(callAtCaret('=SUM(1)',7),null);assert.equal(callAtCaret('=(1+2',5),null);assert.equal(callAtCaret('=',1),null);
 assert.equal(callAtCaret('='+'('.repeat(9000),9001),null);assert.equal(callAtCaret('=SUM(1,2',-5),null);assert.deepEqual(callAtCaret('=SUM(1,2',999),{name:'SUM',arg:1});
});
test('signatureArgs keeps bracketed groups together',()=>{
 assert.deepEqual(signatureArgs('SUM(number1, [number2], ...)'),['number1','[number2]','...']);
 assert.deepEqual(signatureArgs('GETPIVOTDATA(data_field, pivot_table, [field1, item1], ...)'),['data_field','pivot_table','[field1, item1]','...']);
 assert.deepEqual(signatureArgs('NOW()'),[]);assert.deepEqual(signatureArgs('nonsense'),[]);
});
test('functionHint marks the active argument and clamps the last one',()=>{
 const h=functionHint(fns,'=if(A1,1,',9);assert.equal(h?.name,'IF');assert.equal(h?.active,2);
 assert.equal(functionHint(fns,'=SUM(1,2,3,4,5,',15)?.active,2);
 assert.equal(functionHint(fns,'=NOPE(',6),null);assert.equal(functionHint(fns,'=A1+1',5),null);
});
