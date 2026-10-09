import test from 'node:test';import assert from 'node:assert/strict';
import {inRect,parseTsv,pasteRect,rectCells,rectOf,toTsv} from './clipboard';
test('rectOf normalizes any drag direction',()=>{const r=rectOf({row:5,col:4},{row:2,col:7});assert.deepEqual(r,{r0:2,c0:4,r1:5,c1:7});assert.equal(rectCells(r),16);assert.ok(inRect(r,3,5));assert.ok(!inRect(r,6,5));});
test('TSV round trips quotes, tabs and newlines',()=>{const rows=[['a','b\tc','say "hi"'],['x\ny','','z']];assert.deepEqual(parseTsv(toTsv(rows)),rows);});
test('parseTsv accepts LF, CRLF and a trailing newline',()=>{assert.deepEqual(parseTsv('1\t2\n3\t4\n'),[['1','2'],['3','4']]);assert.deepEqual(parseTsv('1\r\n2'),[['1'],['2']]);assert.deepEqual(parseTsv(''),[]);assert.deepEqual(parseTsv('a\t'),[['a','']]);});
test('pasteRect clips to the sheet and refuses oversized blocks',()=>{
 assert.deepEqual(pasteRect({row:1,col:1},[['a','b'],['c']]),{r0:1,c0:1,r1:2,c1:2});
 assert.equal(pasteRect({row:0,col:0},[]),null);
 assert.equal(pasteRect({row:0,col:0},Array.from({length:200},()=>Array(100).fill('x'))),null);
 assert.equal(pasteRect({row:1_048_575,col:0},[['a'],['b']])?.r1,1_048_575);});
