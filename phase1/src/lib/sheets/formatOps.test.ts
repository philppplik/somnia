import test from 'node:test';import assert from 'node:assert/strict';
import {formatRectOk,parseFormatOp,toggleOp} from './formatOps';
import type {CellStyle} from './protocol';
const style=(o:Partial<CellStyle>={}):CellStyle=>({bold:false,italic:false,strike:false,underline:false,color:null,fill:null,h:'general',wrap:false,fmt:'General',font:'Calibri',size:11,borders:{l:null,r:null,t:null,b:null},...o});
test('parseFormatOp accepts exactly the allowlisted operations',()=>{
 assert.deepEqual(parseFormatOp({kind:'bold',on:true}),{kind:'bold',on:true});
 assert.deepEqual(parseFormatOp({kind:'fontName',name:'  Arial '}),{kind:'fontName',name:'Arial'});
 assert.deepEqual(parseFormatOp({kind:'fontSize',size:10.5}),{kind:'fontSize',size:10.5});
 assert.deepEqual(parseFormatOp({kind:'fontColor',color:'auto'}),{kind:'fontColor',color:'auto'});
 assert.deepEqual(parseFormatOp({kind:'fillColor',color:'#aBcDeF'}),{kind:'fillColor',color:'#aBcDeF'});
 assert.deepEqual(parseFormatOp({kind:'fillColor',color:'none'}),{kind:'fillColor',color:'none'});});
test('parseFormatOp rejects malformed, hostile and out-of-range input',()=>{
 for(const bad of [null,undefined,'bold',[],{},{kind:'cell.set',input:'x'},{kind:'home.bold',on:true},{kind:'bold'},{kind:'bold',on:'yes'},{kind:'bold',on:true,extra:1},
  {kind:'fontName',name:''},{kind:'fontName',name:'x'.repeat(65)},{kind:'fontName',name:'a\u0007b'},{kind:'fontName',name:5},
  {kind:'fontSize',size:0},{kind:'fontSize',size:410},{kind:'fontSize',size:NaN},{kind:'fontSize',size:Infinity},{kind:'fontSize',size:'12'},
  {kind:'fontColor',color:'red'},{kind:'fontColor',color:'#FFF'},{kind:'fontColor',color:'none'},{kind:'fillColor',color:'auto'},{kind:'fillColor',color:'#GGGGGG'},{kind:'fillColor',color:{theme:1}},{kind:'fillColor'}])
  assert.throws(()=>parseFormatOp(bad),JSON.stringify(bad));});
test('toggle follows the active cell like a spreadsheet',()=>{
 assert.deepEqual(toggleOp('bold',style()),{kind:'bold',on:true});
 assert.deepEqual(toggleOp('bold',style({bold:true})),{kind:'bold',on:false});
 assert.deepEqual(toggleOp('strike',style({strike:true})),{kind:'strike',on:false});
 assert.deepEqual(toggleOp('underline',undefined),{kind:'underline',on:true});});
test('format selections are bounded',()=>{assert.ok(formatRectOk(1));assert.ok(formatRectOk(1_000_000));assert.ok(!formatRectOk(0));assert.ok(!formatRectOk(1_000_001));assert.ok(!formatRectOk(1.5));});
