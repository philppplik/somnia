import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseSheetOp,safeTabColor,TAB_COLORS} from './sheetOps';
import {parseViewCommand} from './viewOps';
test('hide, unhide and tab color commands are closed shapes',()=>{
 assert.deepEqual(parseSheetOp({kind:'hide'}),{kind:'hide'});
 assert.deepEqual(parseSheetOp({kind:'unhide',index:2}),{kind:'unhide',index:2});
 assert.deepEqual(parseSheetOp({kind:'tabColor',color:'#2e7d32'}),{kind:'tabColor',color:'#2E7D32'});
 assert.deepEqual(parseSheetOp({kind:'tabColor',color:'none'}),{kind:'tabColor',color:'none'});
 for(const bad of [{kind:'hide',x:1},{kind:'unhide'},{kind:'unhide',index:-1},{kind:'unhide',index:255},{kind:'unhide',index:1.5},{kind:'tabColor'},{kind:'tabColor',color:'red'},{kind:'tabColor',color:'#12345'},{kind:'tabColor',color:'#GGGGGG'},{kind:'tabColor',color:'none',extra:1}])assert.throws(()=>parseSheetOp(bad),JSON.stringify(bad));
 assert.ok(TAB_COLORS.every(([,hex])=>safeTabColor(hex)===hex));
 assert.equal(safeTabColor('url(x)'),null);assert.equal(safeTabColor(null),null);
});
test('formulas is a single boolean view setting',()=>{
 assert.deepEqual(parseViewCommand({formulas:true}),{formulas:true});
 for(const bad of [{formulas:'on'},{formulas:1},{formulas:true,zeros:true}])assert.throws(()=>parseViewCommand(bad),JSON.stringify(bad));
});
test('headings and zeros are single booleans',()=>{
 assert.deepEqual(parseViewCommand({headings:false}),{headings:false});assert.deepEqual(parseViewCommand({zeros:true}),{zeros:true});
 for(const bad of [{headings:'no'},{zeros:1},{headings:true,zeros:true},{}])assert.throws(()=>parseViewCommand(bad),JSON.stringify(bad));
});
