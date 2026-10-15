import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseLayoutCommand,layoutBlockProblem} from './layoutOps';
test('layout commands are closed shapes',()=>{
 assert.deepEqual(parseLayoutCommand({kind:'merge',how:'center'}),{kind:'merge',how:'center'});
 assert.deepEqual(parseLayoutCommand({kind:'rotate',mode:'stacked'}),{kind:'rotate',mode:'stacked'});
 assert.deepEqual(parseLayoutCommand({kind:'justify'}),{kind:'justify'});assert.deepEqual(parseLayoutCommand({kind:'clearFormats'}),{kind:'clearFormats'});
 assert.deepEqual(parseLayoutCommand({kind:'doubleUnderline',on:false}),{kind:'doubleUnderline',on:false});
 for(const bad of [null,[],{},{kind:'merge'},{kind:'merge',how:'all'},{kind:'rotate',mode:'45'},{kind:'rotate'},{kind:'doubleUnderline'},{kind:'doubleUnderline',on:'y'},{kind:'justify',x:1},{kind:'shrink'}])assert.throws(()=>parseLayoutCommand(bad),JSON.stringify(bad));
});
test('block checks explain what is missing',()=>{
 assert.equal(layoutBlockProblem({kind:'merge',how:'cells'},1,1),'two');assert.equal(layoutBlockProblem({kind:'merge',how:'across'},3,1),'two');assert.equal(layoutBlockProblem({kind:'merge',how:'cells'},2,1),null);
 assert.equal(layoutBlockProblem({kind:'merge',how:'unmerge'},1,1),null);assert.equal(layoutBlockProblem({kind:'justify'},2000,1000),'cells');assert.equal(layoutBlockProblem({kind:'justify'},0,1),'cells');
});
