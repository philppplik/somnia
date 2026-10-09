import test from 'node:test';
import assert from 'node:assert/strict';
import {addressOf,colName,displayValue,editText,parseAddress,visibleWindow,MAX_COLS,MAX_ROWS} from './format';
test('column names and addresses round-trip',()=>{
 assert.equal(colName(0),'A');assert.equal(colName(25),'Z');assert.equal(colName(26),'AA');assert.equal(colName(MAX_COLS-1),'XFD');
 assert.equal(addressOf(1,2),'C2');assert.deepEqual(parseAddress('c2'),{row:1,col:2});assert.deepEqual(parseAddress('XFD1048576'),{row:MAX_ROWS-1,col:MAX_COLS-1});
 for(const bad of ['','A0','XFE1','A1048577','1A','A-1','A1:B2'])assert.equal(parseAddress(bad),null,bad);
});
test('display text for every value kind',()=>{
 assert.equal(displayValue({t:'Empty'}),'');assert.equal(displayValue(undefined),'');
 assert.equal(displayValue({t:'Number',v:0.1+0.2}),'0.3');assert.equal(displayValue({t:'Number',v:85}),'85');assert.equal(displayValue({t:'Number',v:NaN}),'#NUM!');
 assert.equal(displayValue({t:'Text',v:'Grüße ☕'}),'Grüße ☕');assert.equal(displayValue({t:'Bool',v:true}),'TRUE');assert.equal(displayValue({t:'Error',v:'Div0'}),'#DIV/0!');assert.equal(displayValue({t:'Error',v:'NA'}),'#N/A');assert.equal(displayValue({t:'Error',v:{x:1}}),'#ERROR!');
});
test('editor text keeps formulas editable',()=>{
 assert.equal(editText({t:'Number',v:20},'B2*10'),'=B2*10');assert.equal(editText({t:'Number',v:20},'=B2*10'),'=B2*10');assert.equal(editText({t:'Text',v:'x'},null),'x');
});
test('viewport reads stay below the engine cap and inside the sheet',()=>{
 const w=visibleWindow(0,0,4000,3000,24,104,1_048_576,16_384);assert.ok(w.rows*w.cols<=10_000);assert.equal(w.row,0);
 const end=visibleWindow(24*1_048_570,104*16_380,800,400,24,104,1_048_576,16_384);assert.ok(end.row+end.rows<=1_048_576&&end.col+end.cols<=16_384);
 const tiny=visibleWindow(0,0,0,0,24,104,1,1);assert.deepEqual([tiny.rows,tiny.cols],[1,1]);
});
