import assert from 'node:assert/strict';
import {test} from 'node:test';
import {EditorState} from '@codemirror/state';
import {applyLineOp,opRange} from './codeLineOps';

test('sort is natural and case-insensitive, descending reverses, trailing newline and CRLF are kept', () => {
 assert.equal(applyLineOp('b\na10\na2\nA1\n','sortAsc'),'A1\na2\na10\nb\n');
 assert.equal(applyLineOp('a\r\nc\r\nb','sortDesc'),'c\r\nb\r\na');
});
test('unique keeps the first occurrence in order', () => {
 assert.equal(applyLineOp('x\ny\nx\nz\ny','unique'),'x\ny\nz');
});
test('trim removes trailing blanks only', () => {
 assert.equal(applyLineOp('  a \t\nb   \n','trim'),'  a\nb\n');
});
test('join folds lines into one with single spaces and drops empty lines', () => {
 assert.equal(applyLineOp('a  \n  b\n\n  c\n','join'),'a b c\n');
});
test('case operations change letters only', () => {
 assert.equal(applyLineOp('<Div id="x">','upper'),'<DIV ID="X">');
 assert.equal(applyLineOp('Straße','lower'),'straße');
});
test('range covers whole touched lines, or the file when empty; a selection ending at a line start excludes that line', () => {
 const mk=(doc:string,anchor:number,head:number)=>({state:EditorState.create({doc,selection:{anchor,head}})}) as never;
 assert.deepEqual(opRange(mk('aa\nbb\ncc',0,0),'sortAsc'),{from:0,to:8});
 assert.deepEqual(opRange(mk('aa\nbb\ncc',1,4),'sortAsc'),{from:0,to:6});
 assert.deepEqual(opRange(mk('aa\nbb\ncc',0,3),'sortAsc'),{from:0,to:3});
 assert.deepEqual(opRange(mk('aa\nbb\ncc',1,2),'upper'),{from:1,to:2});
 assert.deepEqual(opRange(mk('aa\nbb\ncc',1,1),'upper'),{from:0,to:0});
});
