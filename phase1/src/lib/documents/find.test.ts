import test from 'node:test';
import assert from 'node:assert/strict';
import {findMatches,nextMatchIndex,textStats,validFindQuery,validReplaceText,MAX_FIND_MATCHES} from './find';
const T=(...t:string[])=>t.map((text,index)=>({index,text}));
const o={matchCase:false,wholeWord:false};
test('matches are byte ranges, non-overlapping, case-insensitive by default',()=>{
 const r=findMatches(T('Cat cat CAT','aaaa'),'cat',o);assert.deepEqual(r.matches,[{block:0,start:0,end:3},{block:0,start:4,end:7},{block:0,start:8,end:11}]);
 assert.equal(findMatches(T('Cat cat CAT'),'cat',{...o,matchCase:true}).matches.length,1);
 assert.equal(findMatches(T('aaaa'),'aa',o).matches.length,2);
});
test('offsets are UTF-8 bytes after multi-byte text',()=>{
 const r=findMatches(T('é😀 x'),'x',o);assert.deepEqual(r.matches,[{block:0,start:7,end:8}]);
});
test('whole word ignores matches inside words, including accented letters and underscores',()=>{
 const w={...o,wholeWord:true};
 assert.equal(findMatches(T('cat concat cats cat_x éat cat.'),'cat',w).matches.length,2);
 assert.equal(findMatches(T('écat cat'),'cat',w).matches.length,1);
});
test('regex characters in the query are literal; bad queries find nothing',()=>{
 assert.equal(findMatches(T('a.c abc (x)'),'a.c',o).matches.length,1);assert.equal(findMatches(T('(x) [y] $5'),'(x)',o).matches.length,1);
 for(const bad of ['','a\nb','x'.repeat(201)])assert.deepEqual(findMatches(T('x'),bad,o),{matches:[],capped:false});
 assert.equal(validFindQuery(3),false);assert.equal(validReplaceText('a\nb'),false);assert.equal(validReplaceText('x'.repeat(1001)),false);assert.equal(validReplaceText(''),true);
});
test('the number of matches is capped',()=>{
 const r=findMatches(T('a'.repeat(MAX_FIND_MATCHES+10)),'a',o);assert.equal(r.matches.length,MAX_FIND_MATCHES);assert.equal(r.capped,true);
});
test('next and previous wrap around',()=>{
 const ms=[{block:0,start:2,end:3},{block:1,start:0,end:1},{block:1,start:5,end:6}];
 assert.equal(nextMatchIndex(ms,0,0,1),0);assert.equal(nextMatchIndex(ms,0,3,1),1);assert.equal(nextMatchIndex(ms,1,6,1),0);
 assert.equal(nextMatchIndex(ms,1,5,-1),1);assert.equal(nextMatchIndex(ms,0,2,-1),2);assert.equal(nextMatchIndex([],0,0,1),-1);
});
test('text statistics',()=>{
 assert.deepEqual(textStats('one two\nthree'),{words:3,chars:12,charsNoSpaces:11});assert.deepEqual(textStats(''),{words:0,chars:0,charsNoSpaces:0});
});
