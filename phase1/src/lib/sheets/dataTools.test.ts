import {test} from 'node:test';import assert from 'node:assert/strict';
import {dedupeBlockProblem,parseDedupeCommand,parseSplitCommand,parseWidths,splitBlockProblem} from './dataTools';
test('parseDedupeCommand',()=>{
 assert.deepEqual(parseDedupeCommand({header:true,columns:[0,2]},3),{header:true,columns:[0,2]});
 for(const bad of [null,[],{},{header:true,columns:[]},{header:'y',columns:[0]},{header:true,columns:[0,0]},{header:true,columns:[-1]},{header:true,columns:[1.5]},{header:true,columns:[3]},{header:true,columns:[0],x:1}])assert.throws(()=>parseDedupeCommand(bad,3),JSON.stringify(bad));
});
test('parseSplitCommand',()=>{
 for(const ok of [{kind:'delimited',delimiters:[',','\t'],treatConsecutive:false},{kind:'fixed',widths:[3,8]}])assert.deepEqual(parseSplitCommand(ok),ok);
 for(const bad of [null,{},{kind:'regex'},{kind:'delimited',delimiters:[],treatConsecutive:false},{kind:'delimited',delimiters:['x'],treatConsecutive:false},{kind:'delimited',delimiters:[',',','],treatConsecutive:false},{kind:'delimited',delimiters:[',']},{kind:'fixed',widths:[]},{kind:'fixed',widths:[3,3]},{kind:'fixed',widths:[0]},{kind:'fixed',widths:[256]},{kind:'fixed',widths:Array.from({length:20},(_,i)=>i+1)}])assert.throws(()=>parseSplitCommand(bad),JSON.stringify(bad));
});
test('parseWidths and block checks',()=>{
 assert.deepEqual(parseWidths('3, 8,12'),[3,8,12]);assert.equal(parseWidths(''),null);assert.equal(parseWidths('3,3'),null);assert.equal(parseWidths('a'),null);assert.equal(parseWidths('300'),null);
 assert.equal(dedupeBlockProblem(5,2,true),null);assert.equal(dedupeBlockProblem(1,2,false),'small');assert.equal(dedupeBlockProblem(2,2,true),'header');assert.equal(dedupeBlockProblem(2_000_000,1,false),'large');
 assert.equal(splitBlockProblem(3,1),null);assert.equal(splitBlockProblem(3,2),'columns');assert.equal(splitBlockProblem(10_001,1),'large');
});
