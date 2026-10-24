import test from 'node:test';
import assert from 'node:assert/strict';
import {guessHeader,parseSortCommand,sortBlockProblem,parseListText,presetList} from './sortOps';
test('sort command accepts only a closed, bounded shape',()=>{
 assert.deepEqual(parseSortCommand({column:1,order:'desc',header:true}),{header:true,keys:[{column:1,order:'desc'}]});
 for(const bad of [null,[],{},{column:-1,order:'asc',header:false},{column:1.5,order:'asc',header:false},{column:16384,order:'asc',header:false},{column:0,order:'up',header:false},{column:0,order:'asc'},{column:0,order:'asc',header:false,x:1},{column:'A',order:'asc',header:false}])assert.throws(()=>parseSortCommand(bad),JSON.stringify(bad));
 assert.throws(()=>parseSortCommand({column:3,order:'asc',header:false},3));
});
test('sort block problems are explained before sending',()=>{
 assert.equal(sortBlockProblem(1,3,false),'small');assert.equal(sortBlockProblem(2,3,true),'header');assert.equal(sortBlockProblem(2000,1000,false),'large');assert.equal(sortBlockProblem(3,2,true),null);assert.equal(sortBlockProblem(2,0,false),'small');
});
test('header guess needs text over numbers and stays a default',()=>{
 assert.equal(guessHeader(['name','qty'],['a','3']),true);assert.equal(guessHeader(['1','2'],['3','4']),false);assert.equal(guessHeader(['a','b'],['c','d']),false);assert.equal(guessHeader(['',''],['1','2']),false);
});

test('several sort levels and custom orders are closed and bounded',()=>{
 assert.deepEqual(parseSortCommand({header:true,keys:[{column:1,order:'asc',list:['Low','High']},{column:0,order:'desc'}],matchCase:true}),{header:true,keys:[{column:1,order:'asc',list:['Low','High']},{column:0,order:'desc'}],matchCase:true});
 assert.deepEqual(parseSortCommand({header:false,keys:[{column:0,order:'asc'}],matchCase:false}),{header:false,keys:[{column:0,order:'asc'}]});
 const k=(column:number)=>({column,order:'asc'});
 for(const bad of [{header:true,keys:[]},{header:true,keys:[k(0),k(1),k(2),k(3)]},{header:true,keys:[k(0),k(0)]},{header:true,keys:[k(0)],column:1},{header:true,keys:[k(0)],extra:1},{header:true,keys:[{...k(0),list:[]}]},{header:true,keys:[{...k(0),list:['a','A']}]},{header:true,keys:[{...k(0),list:['a,b']}]},{header:true,keys:[{...k(0),list:[1]}]},{header:true,keys:[{...k(0),list:['x'.repeat(65)]}]},{header:true,keys:[{...k(0),list:Array.from({length:51},(_,i)=>'v'+i)}]},{header:true,keys:[{...k(0),order:'up'}]},{header:true,keys:[k(0)],matchCase:'yes'},{header:true,keys:'x'},{keys:[k(0)]}])assert.throws(()=>parseSortCommand(bad),JSON.stringify(bad).slice(0,60));
 assert.throws(()=>parseSortCommand({header:true,keys:[k(0),k(3)]},3));
 assert.deepEqual(parseListText(' Low, Medium ,High,'),['Low','Medium','High']);assert.equal(parseListText(''),null);assert.equal(parseListText('a,A'),null);assert.equal(parseListText('a\u0001b'),null);
});

test('left to right is a closed option',()=>{
 assert.deepEqual(parseSortCommand({header:true,orientation:'columns',keys:[{column:0,order:'asc'}]}),{header:true,keys:[{column:0,order:'asc'}],orientation:'columns'});
 assert.deepEqual(parseSortCommand({header:true,orientation:'rows',keys:[{column:0,order:'asc'}]}),{header:true,keys:[{column:0,order:'asc'}]});
 assert.throws(()=>parseSortCommand({header:true,orientation:'diagonal',keys:[{column:0,order:'asc'}]}));
 assert.throws(()=>parseSortCommand({header:true,orientation:'columns',column:0,order:'asc'}));
 assert.equal(sortBlockProblem(3,2,true),null);assert.equal(sortBlockProblem(1,5,false),'small');
});

test('day and month presets follow the language, Monday first',()=>{
 assert.deepEqual(presetList('weekdays','en'),['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']);
 assert.deepEqual(presetList('weekdaysShort','en')?.slice(0,2),['Mon','Tue']);
 assert.equal(presetList('months','en')?.length,12);assert.equal(presetList('months','en')?.[0],'January');assert.equal(presetList('months','en')?.[11],'December');
 assert.equal(presetList('weekdays','de')?.[0],'Montag');assert.equal(presetList('months','de')?.[2],'März');assert.equal(presetList('monthsShort','es')?.length,12);
 assert.equal(presetList('weekdays','not a locale!'),null);
 for(const l of ['en','de','es','fr','pt-BR'])for(const k of ['weekdays','weekdaysShort','months','monthsShort'] as const)assert.ok(presetList(k,l),l+k);
});
