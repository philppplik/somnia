import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyCase,wordAround,CASE_MODES} from './textCase';
test('upper, lower and toggle',()=>{
 assert.equal(applyCase('Hello World 12','upper'),'HELLO WORLD 12');
 assert.equal(applyCase('Hello World 12','lower'),'hello world 12');
 assert.equal(applyCase('Hello World','toggle'),'hELLO wORLD');
});
test('title case capitalises each word and keeps apostrophes inside words',()=>{
 assert.equal(applyCase("the quick BROWN fox's tail",'title'),"The Quick Brown Fox's Tail");
 assert.equal(applyCase('ärger über 3rd place','title'),'Ärger Über 3rd Place');
});
test('sentence case uses the sentence start context',()=>{
 assert.equal(applyCase('HELLO there. HOW are you? fine!','sentence'),'Hello there. How are you? Fine!');
 assert.equal(applyCase('MIDDLE of a sentence.','sentence',false),'middle of a sentence.');
});
test('only letters change and the input is never mutated; odd input is safe',()=>{
 for(const m of CASE_MODES){assert.equal(applyCase('',m),'');assert.equal(applyCase('123 ---',m),'123 ---');}
 assert.equal(applyCase('😀 émoji','upper'),'😀 ÉMOJI');
 assert.throws(()=>applyCase('x','nope' as never));
});
test('word around a caret',()=>{
 assert.deepEqual(wordAround('one two',5),{start:4,end:7});assert.deepEqual(wordAround('one two',3),{start:0,end:3});
 assert.equal(wordAround('a  b',2),null);assert.equal(wordAround('',0),null);
});
