import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseSpecialCommand,parseSpecialResult,SPECIAL_KINDS} from './specialOps';
test('find commands accept only the closed kinds',()=>{
 for(const k of SPECIAL_KINDS)assert.deepEqual(parseSpecialCommand({kind:k}),{kind:k});
 for(const bad of [null,[],{},{kind:'visible'},{kind:'lastCell'},{kind:'blanks',x:1},{kind:5}])assert.throws(()=>parseSpecialCommand(bad),JSON.stringify(bad));
});
test('the bridge answer is cleaned and bounded',()=>{
 assert.deepEqual(parseSpecialResult({count:3,ranges:['A1:A2','C5'],truncated:false}),{count:3,ranges:['A1:A2','C5'],truncated:false});
 assert.deepEqual(parseSpecialResult({count:2,ranges:['A1','bad','Z9:Z8; drop',7,'AA10:AB11']}).ranges,['A1','AA10:AB11']);
 assert.deepEqual(parseSpecialResult(null),{count:0,ranges:[],truncated:false});assert.equal(parseSpecialResult({count:-1}).count,0);assert.equal(parseSpecialResult({count:1.5}).count,0);
 assert.equal(parseSpecialResult({count:9,ranges:Array.from({length:900},()=>'A1')}).ranges.length,500);assert.equal(parseSpecialResult({count:0,truncated:true}).truncated,false);
});
