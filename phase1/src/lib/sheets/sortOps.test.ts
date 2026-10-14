import test from 'node:test';
import assert from 'node:assert/strict';
import {guessHeader,parseSortCommand,sortBlockProblem} from './sortOps';
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
