import {test} from 'node:test';import assert from 'node:assert/strict';
import {applySuggestion,suggestNames,wordAtCaret} from './nameComplete';
const f=(name:string)=>({name,category:'x',signature:name+'()',description:''});
const fns=[f('SUM'),f('SUMIF'),f('SUMIFS'),f('SUMPRODUCT'),f('SQRT'),f('SUBTOTAL'),f('VLOOKUP')];
const names=[{name:'Sales_Total',refersTo:'A1',scope:'',comment:''},{name:'SumRange',refersTo:'B1',scope:'',comment:''},{name:'bad name',refersTo:'C1',scope:'',comment:''}];
test('wordAtCaret finds the identifier before the caret',()=>{
 assert.deepEqual(wordAtCaret('=SU',3),{start:1,word:'SU'});
 assert.deepEqual(wordAtCaret('=1+SUM',6),{start:3,word:'SUM'});
 assert.deepEqual(wordAtCaret('=IF(A1,VLO',10),{start:7,word:'VLO'});
 assert.deepEqual(wordAtCaret('=SUM(Sales_T',12),{start:5,word:'Sales_T'});
 for(const [t,c] of [['SUM',3],['=',1],['=1',2],['=2E',3],['="SU',4],["='My Sh",6],['=Sheet1!SU',10],['=$SU',4],['=SUM(',5],['='+'A'.repeat(9000),9001]] as [string,number][])assert.equal(wordAtCaret(t,c),null,t.slice(0,20));
 assert.deepEqual(wordAtCaret('="a"&SU',7),{start:5,word:'SU'});
});
test('suggestNames lists names first, then functions, bounded',()=>{
 const r=suggestNames(fns,names,'su');
 assert.deepEqual(r.map(x=>x.label),['SumRange','SUBTOTAL','SUM','SUMIF','SUMIFS','SUMPRODUCT']);
 assert.equal(r[0].kind,'name');assert.equal(r[2].insert,'SUM(');
 assert.deepEqual(suggestNames(fns,names,'sum').map(x=>x.label),['SumRange','SUMIF','SUMIFS','SUMPRODUCT']);
 assert.deepEqual(suggestNames(fns,names,'s'),[]);assert.deepEqual(suggestNames(fns,names,'A1'),[]);assert.deepEqual(suggestNames(fns,names,'zz'),[]);
 assert.deepEqual(suggestNames(fns,names,'sal').map(x=>x.label),['Sales_Total']);
 const many=Array.from({length:50},(_,i)=>f('SX'+String(i).padStart(2,'0')));assert.equal(suggestNames(many,[],'SX').length,12);
});
test('applySuggestion replaces the word and keeps the rest',()=>{
 assert.deepEqual(applySuggestion('=SU+1',1,3,{label:'SUM',insert:'SUM(',kind:'fn'}),{text:'=SUM(+1',caret:5});
 assert.deepEqual(applySuggestion('=SU(1)',1,3,{label:'SUM',insert:'SUM(',kind:'fn'}),{text:'=SUM(1)',caret:5});
 assert.deepEqual(applySuggestion('=Sal',1,4,{label:'Sales_Total',insert:'Sales_Total',kind:'name'}),{text:'=Sales_Total',caret:12});
 assert.equal(applySuggestion('=SU',0,3,{label:'x',insert:'X',kind:'name'}),null);
 assert.equal(applySuggestion('=SU',1,3,{label:'x',insert:'X Y',kind:'name'}),null);
 assert.equal(applySuggestion('SU',1,2,{label:'x',insert:'X',kind:'name'}),null);
});
