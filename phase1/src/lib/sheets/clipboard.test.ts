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
import {planPaste} from './clipboard';
test('planPaste validates the whole block before anything is written',()=>{
 const ok=planPaste({row:2,col:1},[['a','b'],['c']],100);
 assert.ok(ok.ok);if(ok.ok){assert.deepEqual(ok.rect,{r0:2,c0:1,r1:3,c1:2});assert.deepEqual(ok.values,[['a','b'],['c','']]);}
 assert.deepEqual(planPaste({row:0,col:0},[['a','x'.repeat(101)]],100),{ok:false,reason:'tooLong'});
 assert.deepEqual(planPaste({row:0,col:0},[['é'.repeat(51)]],100),{ok:false,reason:'tooLong'},'bytes, not characters');
 assert.deepEqual(planPaste({row:0,col:0},[],100),{ok:false,reason:'empty'});
 assert.deepEqual(planPaste({row:0,col:0},[[]],100),{ok:false,reason:'empty'});
 assert.deepEqual(planPaste({row:0,col:0},Array.from({length:101},()=>Array.from({length:100},()=>'1')),100),{ok:false,reason:'tooLarge'});});
test('planPaste clips at the sheet edge instead of failing',()=>{
 const p=planPaste({row:1_048_575,col:0},[['a'],['b']],100);assert.ok(p.ok);if(p.ok){assert.equal(p.rect.r1,1_048_575);assert.deepEqual(p.values,[['a']]);}});
import {pasteFromEngineCopy} from './clipboard';
test('engine copy is used only for an unchanged own copy without collaboration',()=>{
 const base={collab:false,hasCopy:true,copiedText:'1\t2\n3\t4\n',pastedText:'1\t2\n3\t4'};
 assert.equal(pasteFromEngineCopy(base),true);
 assert.equal(pasteFromEngineCopy({...base,pastedText:'1\r\n'.replace('1','1\t2')+'3\t4\r\n'}),true);
 assert.equal(pasteFromEngineCopy({...base,collab:true}),false);
 assert.equal(pasteFromEngineCopy({...base,hasCopy:false}),false);
 assert.equal(pasteFromEngineCopy({...base,copiedText:null}),false);
 assert.equal(pasteFromEngineCopy({...base,pastedText:'1\t2\n3\t5'}),false);
 assert.equal(pasteFromEngineCopy({...base,pastedText:''}),false);
 assert.equal(pasteFromEngineCopy({...base,copiedText:'',pastedText:''}),false);
});
