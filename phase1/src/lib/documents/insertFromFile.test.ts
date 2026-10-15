import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decodeTextFile,textFileProblem,MAX_TEXT_FILE_CHARS,MAX_TEXT_FILE_LINES} from './insertFromFile';
import {adjacentChange} from './reviewNav';
import type {ReviewChange} from './protocol';
const buf=(s:string|number[])=>(typeof s==='string'?new TextEncoder().encode(s):new Uint8Array(s)).buffer as ArrayBuffer;
test('textFileProblem checks name and size',()=>{
 for(const n of ['a.txt','B.MD','c.markdown','d.csv','x/y/e.text'])assert.equal(textFileProblem(n,10),null,n);
 for(const n of ['a.exe','a','a.docx','.txt.exe'])assert.ok(textFileProblem(n,10),n);
 assert.ok(textFileProblem('a.txt',0));assert.ok(textFileProblem('a.txt',NaN));assert.ok(textFileProblem('a.txt',MAX_TEXT_FILE_CHARS*4+1));
});
test('decodeTextFile cleans text and refuses bad input',()=>{
 assert.deepEqual(decodeTextFile(buf('\uFEFFone\r\ntwo\rthree\n\n'),'a.txt'),{text:'one\ntwo\nthree'});
 assert.deepEqual(decodeTextFile(buf('a\tb\u0007c'),'a.txt'),{text:'a\tbc'});
 for(const bad of [buf([0xff,0xfe,0x41]),buf('a\u0000b'),buf('\n\n'),buf('x'.repeat(MAX_TEXT_FILE_CHARS+1)),buf('l\n'.repeat(MAX_TEXT_FILE_LINES+1))])assert.ok('error' in decodeTextFile(bad,'a.txt'));
});
const ch=(block:number,start:number):ReviewChange=>({id:1,kind:'insert',author:'A',date:'d',block,start,end:start+1,text:'x'});
test('adjacentChange walks forward and back and wraps',()=>{
 const l=[ch(2,5),ch(0,3),ch(2,1)];
 assert.deepEqual(adjacentChange(l,{block:0,off:0},1),ch(0,3));
 assert.deepEqual(adjacentChange(l,{block:0,off:3},1),ch(2,1));
 assert.deepEqual(adjacentChange(l,{block:2,off:5},1),ch(0,3),'wraps to the first');
 assert.deepEqual(adjacentChange(l,{block:0,off:0},-1),ch(2,5),'wraps to the last');
 assert.deepEqual(adjacentChange(l,{block:2,off:5},-1),ch(2,1));
 assert.equal(adjacentChange([],{block:0,off:0},1),null);assert.deepEqual(adjacentChange(l,null,-1),ch(2,5));
});
