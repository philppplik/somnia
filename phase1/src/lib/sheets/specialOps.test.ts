import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseShiftCommand,parseSpecialCommand,parseSpecialResult,shiftBlockProblem,SPECIAL_KINDS} from './specialOps';
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
test('shift commands pair insert with down/right and delete with up/left',()=>{
 assert.deepEqual(parseShiftCommand({kind:'insert',shift:'down'}),{kind:'insert',shift:'down'});
 assert.deepEqual(parseShiftCommand({kind:'delete',shift:'left'}),{kind:'delete',shift:'left'});
 for(const bad of [null,[],{},{kind:'insert',shift:'up'},{kind:'delete',shift:'down'},{kind:'insert',shift:'row'},{kind:'insert',shift:'down',x:1},{kind:'move',shift:'down'}])assert.throws(()=>parseShiftCommand(bad),JSON.stringify(bad));
 const r={r0:2,c0:1,r1:4,c1:2};
 assert.equal(shiftBlockProblem({kind:'insert',shift:'down'},r,1000,100),null);
 assert.equal(shiftBlockProblem({kind:'insert',shift:'down'},r,6,100),'edge');assert.equal(shiftBlockProblem({kind:'insert',shift:'right'},r,1000,4),'edge');
 assert.equal(shiftBlockProblem({kind:'delete',shift:'up'},r,6,4),null);assert.equal(shiftBlockProblem({kind:'delete',shift:'up'},{r0:0,c0:0,r1:2000,c1:1000},9999,9999),'large');
});
test('error-check kinds are accepted by the find command',()=>{
 assert.deepEqual(parseSpecialCommand({kind:'numbersAsText'}),{kind:'numbersAsText'});assert.deepEqual(parseSpecialCommand({kind:'paddedText'}),{kind:'paddedText'});
 assert.throws(()=>parseSpecialCommand({kind:'inconsistent'}));
});
