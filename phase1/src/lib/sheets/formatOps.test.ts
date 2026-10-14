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
import {detectNumFmt,numFmtCode} from './formatOps';
test('number format ops accept presets only and bound decimals',()=>{
 assert.deepEqual(parseFormatOp({kind:'numFmt',preset:'percent'}),{kind:'numFmt',preset:'percent'});
 assert.deepEqual(parseFormatOp({kind:'numFmt',preset:'currency',decimals:0,symbol:'€'}),{kind:'numFmt',preset:'currency',decimals:0,symbol:'€'});
 assert.deepEqual(parseFormatOp({kind:'decimals',delta:-1}),{kind:'decimals',delta:-1});
 for(const bad of [{kind:'numFmt'},{kind:'numFmt',code:'0.00'},{kind:'numFmt',preset:'0.00'},{kind:'numFmt',preset:'number',decimals:11},{kind:'numFmt',preset:'number',decimals:-1},{kind:'numFmt',preset:'number',decimals:1.5},{kind:'numFmt',preset:'number',decimals:'2'},
  {kind:'numFmt',preset:'date',decimals:2},{kind:'numFmt',preset:'number',symbol:'$'},{kind:'numFmt',preset:'currency',symbol:'BTC'},{kind:'numFmt',preset:'currency',symbol:'"0;'},
  {kind:'decimals',delta:2},{kind:'decimals',delta:0},{kind:'decimals'},{kind:'decimals',delta:1,at:{row:0,col:0}}])assert.throws(()=>parseFormatOp(bad),JSON.stringify(bad));});
test('number format codes match what the engine bridge writes and are detected back',()=>{
 assert.equal(numFmtCode('number'),'0.00');assert.equal(numFmtCode('number',0),'0');assert.equal(numFmtCode('comma',1),'#,##0.0');assert.equal(numFmtCode('percent'),'0%');assert.equal(numFmtCode('percent',2),'0.00%');
 assert.equal(numFmtCode('currency'),'"$"#,##0.00');assert.equal(numFmtCode('currency',0,'€'),'"€"#,##0');assert.equal(numFmtCode('scientific',1),'0.0E+00');assert.equal(numFmtCode('date'),'yyyy-mm-dd');assert.equal(numFmtCode('text'),'@');
 for(const [p,d,s] of [['number',0,'$'],['number',3,'$'],['comma',2,'$'],['percent',0,'$'],['percent',2,'$'],['scientific',2,'$'],['currency',2,'£'],['currency',0,'CHF']] as const){const r=detectNumFmt(numFmtCode(p,d,s));assert.equal(r.preset,p);assert.equal(r.decimals,d);if(p==='currency')assert.equal(r.symbol,s);}
 for(const p of ['general','date','time','text'] as const)assert.equal(detectNumFmt(numFmtCode(p)).preset,p);
 for(const own of ['0.00_);[Red](0.00)','m/d/yyyy','[$-F800]dddd, mmmm dd, yyyy','"x"0.00','0.000000000000']) assert.equal(detectNumFmt(own).preset,'custom',own);});
