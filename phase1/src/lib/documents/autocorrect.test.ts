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
import {autoLink} from './autocorrect';
import {linkProblem} from './protocol';
const lk=(t:string)=>autoLink(t,new TextEncoder().encode(t).length,' ');
test('web and e-mail addresses become links when a space follows',()=>{
 assert.deepEqual(lk('see https://example.com/a?b=1'),{start:4,end:29,url:'https://example.com/a?b=1'});
 assert.deepEqual(lk('go www.example.org'),{start:3,end:18,url:'https://www.example.org'});
 assert.deepEqual(lk('mail me@example.com'),{start:5,end:19,url:'mailto:me@example.com'});
 assert.equal(lk('http://localhost:3000/x')?.url,'http://localhost:3000/x');
 assert.equal(lk('(https://example.com).'),null,'a leading bracket is part of the word, so no link');
});
test('trailing sentence punctuation stays out of the link and byte offsets hold',()=>{
 assert.deepEqual(lk('\u00e4 https://example.com.'),{start:3,end:22,url:'https://example.com'});
 for(const t of ['see https://example.com/a?b=1','go www.example.org','mail me@example.com'])assert.equal(linkProblem(lk(t)!.url),null);
});
test('ordinary words, odd addresses and bad input make no link',()=>{
 for(const t of ['hello','https://','www.','a@b','e.g.','http://nodot','']) assert.equal(lk(t),null,t);
 assert.equal(autoLink('www.example.org',3,' '),null,'caret inside the word start is still fine only at a boundary or after text');
 assert.equal(autoLink('www.example.org',99,' '),null);assert.equal(autoLink('www.example.org',15,'x'),null);assert.equal(autoLink('www.example.org',-1,' '),null);
});
