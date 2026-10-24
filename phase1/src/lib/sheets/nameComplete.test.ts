import {test} from 'node:test';import assert from 'node:assert/strict';
import {applySuggestion,suggestNames as suggest,wordAtCaret,completionAt,columnAtCaret,sheetRef,type NameSources} from './nameComplete';
const f=(name:string)=>({name,category:'x',signature:name+'()',description:''});
const fns=[f('SUM'),f('SUMIF'),f('SUMIFS'),f('SUMPRODUCT'),f('SQRT'),f('SUBTOTAL'),f('VLOOKUP')];
const tables=[{name:'Sales',range:'A1:C9',header:true,totals:false,banded:true,bandedCols:false,firstCol:false,lastCol:false,style:'x',columns:['Region','Sales Amount','Units','bad[col]']}];
const names=[{name:'Sales_Total',refersTo:'A1',scope:'',comment:''},{name:'SumRange',refersTo:'B1',scope:'',comment:''},{name:'bad name',refersTo:'C1',scope:'',comment:''}];
const suggestNames=(a:typeof fns,b:typeof names,w:string)=>suggest({fns:a,names:b,tables:[],sheets:[]},w);
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

const src=(over:Partial<NameSources>={}):NameSources=>({fns,names,tables,sheets:['Data','Q1 Sales','Sales 2','Summary'],...over});
test('tables and sheets are offered after names, bounded and quoted',()=>{
 const r=suggest(src(),'sa').map(x=>x.kind+':'+x.label+':'+x.insert);
 assert.deepEqual(r,['name:Sales_Total:Sales_Total','table:Sales:Sales',"sheet:Sales 2:'Sales 2'!"]);
 assert.deepEqual(suggest(src(),'su').map(x=>x.kind+':'+x.insert),['name:SumRange','sheet:Summary!','fn:SUBTOTAL(','fn:SUM(','fn:SUMIF(','fn:SUMIFS(','fn:SUMPRODUCT(']);
 assert.deepEqual(suggest(src({sheets:['Quarter Sales',"Obrien's",'A1','B2x']}),'qu').map(x=>x.insert),["'Quarter Sales'!"]);
 assert.deepEqual(suggest(src({sheets:['Quarter Sales',"Obrien's"]}),'ob').map(x=>x.insert),["'Obrien''s'!"]);
 assert.deepEqual(suggest(src({sheets:['Q1 Sales']}),'q1'),[]);
 assert.equal(sheetRef("O'Brien"),"'O''Brien'!");assert.equal(sheetRef('A1'),"'A1'!");assert.equal(sheetRef('Data'),'Data!');assert.equal(sheetRef('a:b'),null);assert.equal(sheetRef(''),null);assert.equal(sheetRef('x'.repeat(32)),null);
});
test('table columns are offered inside brackets and unsafe names are skipped',()=>{
 assert.deepEqual(columnAtCaret('=SUM(Sales[Sa',13),{start:11,table:'Sales',prefix:'Sa'});
 assert.deepEqual(columnAtCaret('=Sales[',7),{start:7,table:'Sales',prefix:''});
 for(const [t,c] of [['Sales[',6],['=Sales[[',8],['="Sales[',8],['=Sales[Sa]',10],['=A[#',4]] as [string,number][])assert.equal(columnAtCaret(t,c),null,t);
 assert.deepEqual(completionAt('=Sales[',7,src())?.suggestions.map(x=>x.label),['Region','Sales Amount','Units']);
 assert.deepEqual(completionAt('=Sales[s',8,src())?.suggestions.map(x=>x.insert),['Sales Amount]']);
 assert.equal(completionAt('=Nope[',6,src()),null);assert.equal(completionAt('=Sales[Zz',9,src()),null);
 assert.deepEqual(completionAt('=SU',3,src())?.start,1);
});
test('applySuggestion handles columns and sheets',()=>{
 assert.deepEqual(applySuggestion('=Sales[Sa',7,9,{label:'Sales Amount',insert:'Sales Amount]',kind:'column'}),{text:'=Sales[Sales Amount]',caret:20});
 assert.deepEqual(applySuggestion('=Sales[Sa]',7,9,{label:'Sales Amount',insert:'Sales Amount]',kind:'column'}),{text:'=Sales[Sales Amount]',caret:20});
 assert.equal(applySuggestion('=Sales[Sa',7,9,{label:'x',insert:'a#b]',kind:'column'}),null);
 assert.deepEqual(applySuggestion('=Q1',1,3,{label:'Q1 Sales',insert:"'Q1 Sales'!",kind:'sheet'}),{text:"='Q1 Sales'!",caret:12});
 assert.equal(applySuggestion('=Q1',1,3,{label:'x',insert:"'x'",kind:'sheet'}),null);
 assert.deepEqual(applySuggestion('=Sa',1,3,{label:'Sales',insert:'Sales',kind:'table'}),{text:'=Sales',caret:6});
});
