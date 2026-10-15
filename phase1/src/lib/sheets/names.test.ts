import {test} from 'node:test';import assert from 'node:assert/strict';
import {nameSpan,resolveNameJump,constantValue,nameProblem,nameTarget,parseNames,parseNamesCommand} from './names';
import {customNumFmtCode,DATE_PATTERNS,parseFormatOp} from './formatOps';
test('nameProblem',()=>{
 for(const ok of ['Prices','_x','tax.rate','Größe','a1b','x'.repeat(64)])assert.equal(nameProblem(ok),null,ok);
 for(const bad of ['','1abc','A1','$B$2','r1c1','R','C','a b','x;y','a"b','x'.repeat(65)])assert.notEqual(nameProblem(bad),null,bad);
});
test('parseNamesCommand',()=>{
 assert.deepEqual(parseNamesCommand({kind:'define',name:' Prices '}),{kind:'define',name:'Prices',scope:'workbook'});
 assert.deepEqual(parseNamesCommand({kind:'define',name:'P',scope:'sheet',replace:true}),{kind:'define',name:'P',scope:'sheet',replace:true});
 assert.deepEqual(parseNamesCommand({kind:'delete',name:'P'}),{kind:'delete',name:'P',scope:'workbook'});
 for(const bad of [null,[],{},{kind:'x',name:'a'},{kind:'define'},{kind:'define',name:'A1'},{kind:'define',name:'a',scope:'all'},{kind:'define',name:'a',replace:'y'},{kind:'define',name:'a',x:1},{kind:'delete',name:''},{kind:'delete',name:'a',replace:true}])assert.throws(()=>parseNamesCommand(bad),JSON.stringify(bad));
});
test('parseNames and nameTarget',()=>{
 assert.deepEqual(parseNames({names:[{name:'a',refersTo:'=S!$A$1',scope:'Workbook',comment:''},{name:1},null]}),[{name:'a',refersTo:'=S!$A$1',scope:'Workbook',comment:''}]);
 assert.deepEqual(parseNames({names:'x'}),[]);
 assert.deepEqual(nameTarget("='My Sheet'!$B$2:$C$3"),{sheet:'My Sheet',address:'B2'});assert.deepEqual(nameTarget('=Sheet1!$A$1'),{sheet:'Sheet1',address:'A1'});
 assert.equal(nameTarget('=SUM(A1:A2)'),null);assert.equal(nameTarget('=Sheet1!A:A'),null);
});
test('custom number and date formats match the Rust bridge',()=>{
 assert.equal(customNumFmtCode({grouping:true,decimals:1}),'#,##0.0');
 assert.equal(customNumFmtCode({grouping:true,decimals:0,prefix:'EUR ',negative:'paren'}),'"EUR "#,##0;("EUR "#,##0)');
 assert.equal(customNumFmtCode({decimals:2,suffix:' kg',zero:'dash'}),'0.00" kg";-0.00" kg";"-"');
 assert.equal(customNumFmtCode({percent:true,decimals:0,negative:'redParen'}),'0%;[Red](0%)');
 assert.deepEqual(parseFormatOp({kind:'numFmtCustom',grouping:true,decimals:0,prefix:'EUR '}),{kind:'numFmtCustom',grouping:true,decimals:0,prefix:'EUR '});
 for(const bad of [{kind:'numFmtCustom',prefix:'a"b'},{kind:'numFmtCustom',prefix:'a;b'},{kind:'numFmtCustom',suffix:'[Red]'},{kind:'numFmtCustom',suffix:'0123456789abc'},{kind:'numFmtCustom',decimals:11},{kind:'numFmtCustom',negative:'blue'},{kind:'numFmtCustom',zero:'x'},{kind:'numFmtCustom',grouping:'yes'},{kind:'numFmtCustom',code:'0'},{kind:'dateFmt',pattern:'yyyy'},{kind:'dateFmt'}])assert.throws(()=>parseFormatOp(bad),JSON.stringify(bad));
 assert.deepEqual(parseFormatOp({kind:'dateFmt',pattern:'dmyDot'}),{kind:'dateFmt',pattern:'dmyDot'});assert.equal(DATE_PATTERNS.length,11);
});
test('name comments and constants are bounded',()=>{
 assert.deepEqual(parseNamesCommand({kind:'comment',name:'P',text:'Tax rate'}),{kind:'comment',name:'P',scope:'workbook',text:'Tax rate'});
 assert.deepEqual(parseNamesCommand({kind:'comment',name:'P',scope:'sheet',text:''}),{kind:'comment',name:'P',scope:'sheet',text:''});
 assert.deepEqual(parseNamesCommand({kind:'constant',name:'Rate',value:0.07}),{kind:'constant',name:'Rate',scope:'workbook',value:0.07});
 assert.deepEqual(parseNamesCommand({kind:'constant',name:'Who',value:'Ann',replace:true}),{kind:'constant',name:'Who',scope:'workbook',value:'Ann',replace:true});
 for(const bad of [{kind:'comment',name:'P'},{kind:'comment',name:'P',text:'x'.repeat(256)},{kind:'comment',name:'P',text:'a\nb'},{kind:'comment',name:'P',text:'x',value:1},{kind:'constant',name:'A1',value:1},{kind:'constant',name:'R',value:''},{kind:'constant',name:'R',value:Infinity},{kind:'constant',name:'R',value:NaN},{kind:'constant',name:'R',value:true},{kind:'constant',name:'R',value:'x'.repeat(256)},{kind:'constant',name:'R',value:1,replace:'y'},{kind:'constant',name:'R',value:1,text:'x'}])assert.throws(()=>parseNamesCommand(bad),JSON.stringify(bad));
 assert.equal(constantValue(' 0.07 '),0.07);assert.equal(constantValue('abc'),'abc');assert.equal(constantValue(''),'');assert.equal(constantValue('1e999'),'1e999');
});
test('names from the selection need a side and take only flags',()=>{
 assert.deepEqual(parseNamesCommand({kind:'fromSelection',top:true}),{kind:'fromSelection',top:true});
 assert.deepEqual(parseNamesCommand({kind:'fromSelection',top:true,left:true,replace:true}),{kind:'fromSelection',top:true,left:true,replace:true});
 for(const bad of [{kind:'fromSelection'},{kind:'fromSelection',top:false},{kind:'fromSelection',top:'y'},{kind:'fromSelection',top:true,name:'x'},{kind:'fromSelection',left:true,replace:1}])assert.throws(()=>parseNamesCommand(bad),JSON.stringify(bad));
});
test('a typed name jumps to the first cell of its place',()=>{
 const names=[{name:'Prices',refersTo:'=Data!$B$2:$B$9',scope:'Workbook',comment:''},{name:'prices',refersTo:"='My Sheet'!$C$3",scope:'My Sheet',comment:''},{name:'Rate',refersTo:'=0.07',scope:'Workbook',comment:''},{name:'Gone',refersTo:'=Hidden!$A$1',scope:'Workbook',comment:''},{name:'Other',refersTo:'=Data!$A$1',scope:'Data',comment:''}];
 const sheets=[{name:'Data',index:0,visibility:'Visible'},{name:'My Sheet',index:1,visibility:'Visible'},{name:'Hidden',index:2,visibility:'Hidden'}];
 assert.deepEqual(resolveNameJump(' PRICES ',names,sheets,'Data'),{sheet:0,address:'B2:B9'});
 assert.deepEqual(resolveNameJump('prices',names,sheets,'My Sheet'),{sheet:1,address:'C3'});
 for(const bad of ['','Rate','Gone','Nope','x'.repeat(65)])assert.equal(resolveNameJump(bad,names,sheets,'Data'),null,bad);
 assert.deepEqual(resolveNameJump('other',names,sheets,'Data'),{sheet:0,address:'A1'});
});
test('nameSpan keeps the whole place',()=>{
 assert.equal(nameSpan('=Data!$B$2:$C$9'),'B2:C9');assert.equal(nameSpan("='My Sheet'!$c$3"),'C3');assert.equal(nameSpan('=0.07'),null);assert.equal(nameSpan('=SUM(A1)'),null);
});
test('parseSpan reads a cell or a range in any corner order',async()=>{
 const {parseSpan}=await import('./format');
 assert.deepEqual(parseSpan('B2'),{from:{row:1,col:1},to:null});
 assert.deepEqual(parseSpan('C9:b2'),{from:{row:1,col:1},to:{row:8,col:2}});
 assert.deepEqual(parseSpan('B2:B2'),{from:{row:1,col:1},to:null});
 for(const bad of ['','A','A1:','A1:B2:C3','A0','ZZZZ1','1:2'])assert.equal(parseSpan(bad),null,bad);
});
