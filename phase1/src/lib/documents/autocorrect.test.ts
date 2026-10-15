import {test} from 'node:test';
import assert from 'node:assert/strict';
import {autoCorrect} from './autocorrect';
const at=(t:string,c:string)=>autoCorrect(t,new TextEncoder().encode(t).length,c);
test('quotes open after a space or at the start and close after text',()=>{
 assert.deepEqual(at('','"'),{start:0,end:0,text:'\u201c'});
 assert.equal(at('say ','"')?.text,'\u201c');assert.equal(at('done','"')?.text,'\u201d');
 assert.equal(at('it','\'')?.text,'\u2019');assert.equal(at('(','\'')?.text,'\u2018');
});
test('symbol shortcuts are replaced when a space or punctuation follows',()=>{
 assert.deepEqual(at('a (c)',' '),{start:2,end:5,text:'\u00a9 '});
 assert.equal(at('x (TM)',' ')?.text,'\u2122 ');assert.equal(at('wait ...',' ')?.text,'\u2026 ');
 assert.equal(at('a -> b ->',' ')?.text,'\u2192 ');assert.equal(at('1/2',',')?.text,'\u00bd,');
});
test('byte offsets are used for non-ASCII text',()=>{
 const t='\u00e4\u00f6 (c)';assert.deepEqual(at(t,' '),{start:5,end:8,text:'\u00a9 '});
});
test('ordinary typing, partial tokens and bad input are left alone',()=>{
 assert.equal(at('hello',' '),null);assert.equal(at('a (c',' '),null);assert.equal(at('(c)','x'),null);assert.equal(at('a..','.'),null);
 assert.equal(autoCorrect('abc',99,' '),null);assert.equal(autoCorrect('abc',-1,' '),null);assert.equal(autoCorrect('abc',1.5,' '),null);
 assert.equal(autoCorrect('\u00e4',1,' '),null,'caret inside a character');
});
