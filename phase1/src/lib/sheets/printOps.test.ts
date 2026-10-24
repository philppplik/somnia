import test from 'node:test';import assert from 'node:assert/strict';
import {appendHeaderCode,previewHeaderFooter,headerProblem,parseExportCommand,parseExportResult,parsePageInfo,parsePageSetupCommand} from './printOps';
import {decodeBase64,exportName} from './exportFile';
test('page setup accepts the closed allowlist',()=>{
 assert.deepEqual(parsePageSetupCommand({orientation:'landscape',paper:'A4',margins:'narrow',scale:80,gridlines:true,header:'&C&P',footer:'Page &P of &N',printArea:' A1:F40 ',titleRows:'1:2',titleCols:'a:b'}),{orientation:'landscape',paper:'A4',margins:'narrow',scale:80,gridlines:true,header:'&C&P',footer:'Page &P of &N',printArea:'A1:F40',titleRows:'1:2',titleCols:'A:B'});
 assert.deepEqual(parsePageSetupCommand({printArea:null,titleRows:null,titleCols:null}),{printArea:null,titleRows:null,titleCols:null});
 assert.deepEqual(parsePageSetupCommand({fitWidth:1,fitHeight:0}),{fitWidth:1,fitHeight:0});
});
test('page setup refuses malformed, unknown and conflicting input',()=>{
 for(const bad of [null,[],'x',{},{surprise:1},{orientation:'sideways'},{paper:'Bogus'},{margins:'huge'},{scale:9},{scale:401},{scale:99.5},{scale:'100'},{scale:100,fitWidth:1},{fitWidth:21},{fitHeight:-1},{gridlines:'yes'},{header:'&X'},{header:'a&'},{footer:'x'.repeat(101)},{footer:'a\nb'},{header:5},{printArea:'nope'},{printArea:'A1:'},{printArea:'Sheet1!A1'},{titleRows:'A:B'},{titleRows:'1'},{titleCols:'1:2'},{titleCols:'AAAA:B'}])
  assert.throws(()=>parsePageSetupCommand(bad),JSON.stringify(bad));
});
test('header codes',()=>{
 assert.equal(headerProblem('&L&D&C&A&R&P/&N &T &F && done'),false);assert.equal(headerProblem(''),false);
 for(const bad of ['&Z','a&','&&&','x'.repeat(101),'\u0007',7,null])assert.equal(headerProblem(bad),true,String(bad));
});
test('export command',()=>{
 assert.deepEqual(parseExportCommand({format:'pdf'}),{format:'pdf',scope:'sheet'});
 assert.deepEqual(parseExportCommand({format:'pdf',scope:'all',fit:true}),{format:'pdf',scope:'all',fit:true});
 assert.deepEqual(parseExportCommand({format:'csv'}),{format:'csv',scope:'sheet'});
 for(const bad of [null,{},{format:'xlsx'},{format:'csv',scope:'all'},{format:'html',scope:'selection'},{format:'tsv',fit:true},{format:'pdf',scope:'page'},{format:'pdf',fit:'y'},{format:'pdf',x:1}])assert.throws(()=>parseExportCommand(bad),JSON.stringify(bad));
});
test('bridge answers are bounded',()=>{
 assert.equal(parsePageInfo(null),null);
 const info=parsePageInfo({orientation:'landscape',paper:'A4',margins:[1,1,1,1,1,1,9],scale:'x',printArea:'A1:B2',titleRows:null});
 assert.equal(info?.orientation,'landscape');assert.equal(info?.margins.length,6);assert.equal(info?.scale,100);assert.equal(info?.printArea,'A1:B2');assert.equal(info?.titleRows,null);
 assert.throws(()=>parseExportResult({format:'pdf',base64:''}));assert.throws(()=>parseExportResult({format:'pdf',base64:'QQ==',bytes:41*1024*1024}));assert.throws(()=>parseExportResult(null));
 assert.deepEqual(parseExportResult({format:'csv',base64:'QQ==',bytes:1}),{format:'csv',base64:'QQ==',bytes:1,pages:null});
});
test('download names and decoding',()=>{
 assert.equal(exportName('Budget.xlsx','pdf'),'Budget.pdf');assert.equal(exportName('../a/b:c.xlsx','csv','Q1/Q2'),'.._a_b_c-Q1_Q2.csv');assert.equal(exportName('','html'),'workbook.html');
 assert.deepEqual([...decodeBase64('QUJD')],[65,66,67]);
});
test('page break ops are bounded and stand alone',()=>{
 assert.deepEqual(parsePageSetupCommand({addRowBreak:5}),{addRowBreak:5});
 assert.deepEqual(parsePageSetupCommand({removeColBreak:3}),{removeColBreak:3});
 assert.deepEqual(parsePageSetupCommand({clearBreaks:true}),{clearBreaks:true});
 for(const bad of [{addRowBreak:1},{addRowBreak:1048577},{addColBreak:16385},{addColBreak:2.5},{addRowBreak:'3'},{clearBreaks:false},{addRowBreak:3,scale:50},{addRowBreak:3,addColBreak:3}])assert.throws(()=>parsePageSetupCommand(bad),String(JSON.stringify(bad)));
 const info=parsePageInfo({rowBreaks:[5,1,'x',9],colBreaks:[3]});
 assert.deepEqual(info?.rowBreaks,[5,9]);assert.deepEqual(info?.colBreaks,[3]);assert.deepEqual(parsePageInfo({})?.rowBreaks,[]);
});
test('header and footer preview expands the printer codes',()=>{
 const cx={page:1,pages:3,sheet:'Q1',file:'Budget.xlsx',date:'2026-10-15',time:'04:50'};
 assert.deepEqual(previewHeaderFooter('&LBudget&CPage &P of &N&R&D',cx),['Budget','Page 1 of 3','2026-10-15']);
 assert.deepEqual(previewHeaderFooter('&A - &F && more',cx),['','Q1 - Budget.xlsx & more','']);
 assert.deepEqual(previewHeaderFooter('',cx),['','','']);
 assert.equal(previewHeaderFooter('50% &X',cx),null);assert.equal(previewHeaderFooter('a&',cx),null);assert.equal(previewHeaderFooter('x'.repeat(101),cx),null);
});
test('header codes are appended within the limit',()=>{
 assert.equal(appendHeaderCode('','C'),'&C');assert.equal(appendHeaderCode('Page ','P'),'Page &P');assert.equal(appendHeaderCode('a','&'),'a&&');
 assert.equal(appendHeaderCode('x'.repeat(99),'P'),null);assert.equal(appendHeaderCode('bad&','P'),null);assert.equal(appendHeaderCode('','Z' as never),null);
});
