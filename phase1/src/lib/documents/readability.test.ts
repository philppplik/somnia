import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readability,syllables} from './stats';
test('syllables are counted by vowel groups',()=>{
 for(const [w,n] of [['cat',1],['table',2],['make',1],['reading',2],['banana',3],['the',1],['rhythm',1],['123',1],['',1]] as const)assert.equal(syllables(w),n,w);
});
test('averages and unique words',()=>{
 const r=readability('The cat sat. The cat ran away!')!;
 assert.equal(r.uniqueWords,5);assert.equal(r.wordsPerSentence,3.5);assert.equal(r.charsPerWord,3.1);
});
test('easy text scores higher than hard text and the score stays in range',()=>{
 const easy=readability('I see a cat. The cat is big. It can run.')!.fleschEase;
 const hard=readability('Institutional responsibilities necessitate comprehensive organizational accountability considerations.')!.fleschEase;
 assert.ok(easy>hard);assert.ok(easy<=100&&hard>=0);
});
test('text without words has no readability and non-English letters count as letters',()=>{
 assert.equal(readability(''),null);assert.equal(readability('  \n ... !!'),null);
 assert.equal(readability('\u00fcber \u00fcber.')!.uniqueWords,1);assert.equal(readability("don't stop")!.charsPerWord,4.0);
});
