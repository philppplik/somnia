import test from 'node:test';
import assert from 'node:assert/strict';
import {aggregateFormula,parsePanelRange,rangeAddress,summarizeCells} from './panelModel';
import {CommandDispatcher} from '../commandDispatcher';
import {getSheetsPanelController,registerSheetsPanelController,sheetsPanelCommandSpecs,type SheetsPanelController} from './panelController';
import {SHEETS_PANEL_CATALOGUES} from './panelI18n';
import {sheetsPanelDefs} from './panels';
test('ranges normalize, enforce worksheet limits and the engine cap',()=>{
 assert.equal(rangeAddress(parsePanelRange('b3:A1')!),'A1:B3');assert.equal(rangeAddress(parsePanelRange('XFD1048576')!),'XFD1048576:XFD1048576');
 for(const input of ['A0','XFE1','A1048577','A1:C1:D1','A1:A10001','<script>'])assert.equal(parsePanelRange(input),null,input);
 assert.ok(parsePanelRange('A1:A10000'));
});
test('statistics use raw numbers, not formatted strings or booleans',()=>{
 const s=summarizeCells([{address:'A1',value:{t:'Number',v:4},formula:null},{address:'A2',value:{t:'Number',v:8},formula:'SUM(B1:B2)'},{address:'A3',value:{t:'Text',v:'12'},formula:null},{address:'A4',value:{t:'Bool',v:true},formula:null},{address:'A5',value:{t:'Error',v:'Div0'},formula:null}],7);
 assert.deepEqual(s,{total:7,filled:5,empty:2,numbers:2,errors:1,formulas:1,sum:12,average:6,min:4,max:8});
 assert.equal(summarizeCells([],3).average,null);assert.equal(summarizeCells([],3).min,null);
});
test('formula builder allowlists functions and normalizes references',()=>{
 assert.equal(aggregateFormula('SUM','B3:A1'),'=SUM(A1:B3)');assert.throws(()=>aggregateFormula('WEBSERVICE','A1'));assert.throws(()=>aggregateFormula('SUM','A1);HYPERLINK("x")'));
});
test('panel commands validate payloads, reject agent execution and honor controller lifecycle',async()=>{
 const dispatcher=new CommandDispatcher();for(const spec of sheetsPanelCommandSpecs())dispatcher.register(spec);
 const calls:unknown[]=[];const controller:SheetsPanelController={ready:()=>true,navigate:(sheet,address)=>{calls.push([sheet,address]);},setCell:input=>{calls.push(input);},readRange:async()=>[],formatCells:op=>{calls.push(op);},resizeLines:(axis,op)=>{calls.push([axis,op]);},freezePanes:(rows,cols)=>{calls.push(['freeze',rows,cols]);},editLines:(axis,kind)=>{calls.push(['edit',axis,kind]);},editSheet:op=>{calls.push(['sheet',op]);},sortRange:op=>{calls.push(['sort',op]);},filterRows:op=>{calls.push(['filter',op]);},fillRange:dir=>{calls.push(['fill',dir]);},highlightRules:op=>{calls.push(['cf',op]);},setValidation:op=>{calls.push(['validation',op]);},replaceText:op=>{calls.push(['replace',op]);return 3;},removeDuplicates:op=>{calls.push(['dedupe',op]);return 1;},annotateCell:op=>{calls.push(['annotate',op]);},nameOperation:op=>{calls.push(['name',op]);},splitColumn:op=>{calls.push(['split',op]);},countMatches:()=>0};
 const off=registerSheetsPanelController(controller);
 try{
  await dispatcher.runCommand('sheets.navigate',{sheet:1,address:'B4'},{origin:'ui'});
  await dispatcher.runCommand('sheets.setCell',{input:'=SUM(A1:A3)'},{origin:'ui'});
  assert.deepEqual(calls,[[1,'B4'],'=SUM(A1:A3)']);
  await dispatcher.runCommand('sheets.format',{kind:'bold',on:true},{origin:'ui'});
  await dispatcher.runCommand('sheets.format',{kind:'fillColor',color:'#FFF2CC'},{origin:'ui'});
  const mark=calls.length;
  await dispatcher.runCommand('sheets.sheet',{kind:'rename',name:'Q1'},{origin:'ui'});
  await dispatcher.runCommand('sheets.sheet',{kind:'delete'},{origin:'ui'});
  assert.deepEqual(calls.slice(mark),[['sheet',{kind:'rename',name:'Q1'}],['sheet',{kind:'delete'}]]);calls.splice(mark);
  await dispatcher.runCommand('sheets.sort',{column:2,order:'desc',header:true},{origin:'ui'});
  assert.deepEqual(calls.slice(mark),[['sort',{header:true,keys:[{column:2,order:'desc'}]}]]);calls.splice(mark);
  await dispatcher.runCommand('sheets.fill',{dir:'down'},{origin:'ui'});assert.deepEqual(calls.splice(mark),[['fill','down']]);
  for(const bad of [{},{dir:'x'},{dir:'down',y:1}])await assert.rejects(()=>dispatcher.runCommand('sheets.fill',bad,{origin:'ui'}),JSON.stringify(bad));
  await dispatcher.runCommand('sheets.highlight',{kind:'flag',flag:'duplicate',style:'yellow'},{origin:'ui'});assert.deepEqual(calls.splice(mark),[['cf',{kind:'flag',flag:'duplicate',style:'yellow'}]]);
  for(const bad of [{},{kind:'expression'},{kind:'flag',flag:'duplicate'},{kind:'clear',x:1}])await assert.rejects(()=>dispatcher.runCommand('sheets.highlight',bad,{origin:'ui'}),JSON.stringify(bad));
  await dispatcher.runCommand('sheets.validation',{kind:'list',items:['a','b']},{origin:'ui'});assert.deepEqual(calls.splice(mark),[['validation',{kind:'list',items:['a','b']}]]);
  for(const bad of [{},{kind:'custom'},{kind:'list',items:[]},{kind:'clear',x:1}])await assert.rejects(()=>dispatcher.runCommand('sheets.validation',bad,{origin:'ui'}),JSON.stringify(bad));
  await dispatcher.runCommand('sheets.replace',{what:'a',with:'b',matchCase:false,wholeCell:false,inFormulas:false},{origin:'ui'});assert.deepEqual(calls.splice(mark),[['replace',{what:'a',with:'b',matchCase:false,wholeCell:false,inFormulas:false}]]);
  for(const bad of [{},{what:'',with:'b',matchCase:false,wholeCell:false,inFormulas:false},{what:'a',with:'b'}])await assert.rejects(()=>dispatcher.runCommand('sheets.replace',bad,{origin:'ui'}),JSON.stringify(bad));
  await dispatcher.runCommand('sheets.dedupe',{header:true,columns:[0]},{origin:'ui'});await dispatcher.runCommand('sheets.split',{kind:'fixed',widths:[3]},{origin:'ui'});assert.deepEqual(calls.splice(mark),[['dedupe',{header:true,columns:[0]}],['split',{kind:'fixed',widths:[3]}]]);
  await dispatcher.runCommand('sheets.annotate',{kind:'note',text:' hi '},{origin:'ui'});assert.deepEqual(calls.splice(mark),[['annotate',{kind:'note',text:'hi'}]]);
  await dispatcher.runCommand('sheets.names',{kind:'define',name:' Prices '},{origin:'ui'});assert.deepEqual(calls.splice(mark),[['name',{kind:'define',name:'Prices',scope:'workbook'}]]);
  for(const bad of [{},{kind:'define',name:'A1'},{kind:'delete'}])await assert.rejects(()=>dispatcher.runCommand('sheets.names',bad,{origin:'ui'}),JSON.stringify(bad));
  await dispatcher.runCommand('sheets.format',{kind:'dateFmt',pattern:'ymd'},{origin:'ui'});calls.splice(mark);
  await assert.rejects(()=>dispatcher.runCommand('sheets.format',{kind:'numFmtCustom',prefix:'a"b'},{origin:'ui'}));
  for(const bad of [{},{kind:'link',target:'javascript:1'},{kind:'note',text:''}])await assert.rejects(()=>dispatcher.runCommand('sheets.annotate',bad,{origin:'ui'}),JSON.stringify(bad));
  for(const bad of [{},{header:true,columns:[]}])await assert.rejects(()=>dispatcher.runCommand('sheets.dedupe',bad,{origin:'ui'}),JSON.stringify(bad));
  for(const bad of [{},{kind:'regex'},{kind:'fixed',widths:[]}])await assert.rejects(()=>dispatcher.runCommand('sheets.split',bad,{origin:'ui'}),JSON.stringify(bad));
  await dispatcher.runCommand('sheets.filter',{kind:'custom',column:1,op:'>=',value:'5'},{origin:'ui'});await dispatcher.runCommand('sheets.filter',{kind:'off'},{origin:'ui'});
  assert.deepEqual(calls.slice(mark),[['filter',{kind:'custom',column:1,op:'>=',value:'5'}],['filter',{kind:'off'}]]);calls.splice(mark);
  for(const bad of [{kind:'custom',column:1,op:'regex',value:'a'},{kind:'custom',column:1,op:'=',value:''},{kind:'off',column:1},{kind:'clear'},{}])await assert.rejects(()=>dispatcher.runCommand('sheets.filter',bad,{origin:'ui'}),JSON.stringify(bad));
  for(const bad of [{column:-1,order:'asc',header:false},{column:0,order:'up',header:false},{column:0,order:'asc'},{order:'asc',header:true},{column:0,order:'asc',header:false,x:1}])await assert.rejects(()=>dispatcher.runCommand('sheets.sort',bad,{origin:'ui'}),JSON.stringify(bad));
  for(const bad of [{kind:'rename',name:'a/b'},{kind:'rename'},{kind:'fly'},{kind:'move',to:300}])await assert.rejects(()=>dispatcher.runCommand('sheets.sheet',bad,{origin:'ui'}),JSON.stringify(bad));
  await dispatcher.runCommand('sheets.resize',{axis:'cols',kind:'size',px:120.4},{origin:'ui'});
  await dispatcher.runCommand('sheets.resize',{axis:'rows',kind:'autofit'},{origin:'ui'});
  await dispatcher.runCommand('sheets.freeze',{rows:1,cols:0},{origin:'ui'});
  assert.deepEqual(calls.slice(4),[['cols',{kind:'size',px:120}],['rows',{kind:'autofit'}],['freeze',1,0]]);calls.splice(4);
  await dispatcher.runCommand('sheets.editLines',{axis:'rows',kind:'insertAfter'},{origin:'ui'});
  await dispatcher.runCommand('sheets.editLines',{axis:'cols',kind:'delete'},{origin:'ui'});
  assert.deepEqual(calls.slice(4),[['edit','rows','insertAfter'],['edit','cols','delete']]);calls.splice(4);
  for(const bad of [{axis:'cells',kind:'delete'},{axis:'rows',kind:'drop'},{axis:'rows'},{kind:'delete'},{axis:'rows',kind:'delete',count:5}])await assert.rejects(()=>dispatcher.runCommand('sheets.editLines',bad,{origin:'ui'}),JSON.stringify(bad));
  for(const bad of [{axis:'cols',kind:'size',px:-1},{axis:'cols',kind:'size',px:2401},{axis:'rows',kind:'size',px:546},{axis:'rows',kind:'size'},{axis:'cells',kind:'hide'},{axis:'rows',kind:'delete'},{axis:'rows',kind:'hide',px:3}])await assert.rejects(()=>dispatcher.runCommand('sheets.resize',bad,{origin:'ui'}),JSON.stringify(bad));
  for(const bad of [{rows:21,cols:0},{rows:-1,cols:0},{rows:1.5,cols:0},{rows:1},{rows:1,cols:0,x:1}])await assert.rejects(()=>dispatcher.runCommand('sheets.freeze',bad,{origin:'ui'}),JSON.stringify(bad));
  assert.deepEqual(calls.slice(2),[{kind:'bold',on:true},{kind:'fillColor',color:'#FFF2CC'}]);
  await assert.rejects(dispatcher.runCommand('sheets.format',{kind:'bold',on:true},{origin:'agent'}),{code:'forbidden-origin'});
  await assert.rejects(dispatcher.runCommand('sheets.format',{kind:'cell.set'},{origin:'ui'}));
  await assert.rejects(dispatcher.runCommand('sheets.format',{kind:'bold'},{origin:'ui'}));
  await assert.rejects(dispatcher.runCommand('sheets.format',{kind:'fontSize',size:9999},{origin:'ui'}));
  await assert.rejects(dispatcher.runCommand('sheets.format',{kind:'fontColor',color:'red'},{origin:'ui'}));
  await dispatcher.runCommand('sheets.format',{kind:'numFmt',preset:'currency',decimals:2,symbol:'€'},{origin:'ui'});
  await dispatcher.runCommand('sheets.format',{kind:'decimals',delta:1},{origin:'ui'});
  await assert.rejects(dispatcher.runCommand('sheets.format',{kind:'numFmt',preset:'0.00'},{origin:'ui'}));
  await assert.rejects(dispatcher.runCommand('sheets.format',{kind:'numFmt',preset:'number',decimals:99},{origin:'ui'}));
  await assert.rejects(dispatcher.runCommand('sheets.format',{kind:'decimals',delta:5},{origin:'ui'}));
  assert.equal(calls.length,6,'rejected payloads never reach the controller');
  await assert.rejects(dispatcher.runCommand('sheets.setCell',{input:'=1'},{origin:'agent'}),{code:'forbidden-origin'});
  await assert.rejects(dispatcher.runCommand('sheets.navigate',{sheet:-1,address:'A1'},{origin:'ui'}),{code:'invalid-params'});
  await assert.rejects(dispatcher.runCommand('sheets.navigate',{sheet:0,address:'A0'},{origin:'ui'}));
  await assert.rejects(dispatcher.runCommand('sheets.analyzeRange',{range:'A1:A10001'},{origin:'ui'}));
  await assert.rejects(dispatcher.runCommand('sheets.setCell',{input:'😀'.repeat(10000)},{origin:'ui'}));
 }finally{off();}
 assert.equal(getSheetsPanelController(),null);await assert.rejects(dispatcher.runCommand('sheets.setCell',{input:'x'},{origin:'ui'}),{code:'disabled'});
 const offA=registerSheetsPanelController(controller),offB=registerSheetsPanelController({...controller});offA();assert.ok(getSheetsPanelController());offB();
});
test('all panel strings and commands have five-locale parity',()=>{
 const en=SHEETS_PANEL_CATALOGUES.en;for(const [locale,strings] of Object.entries(SHEETS_PANEL_CATALOGUES)){assert.deepEqual(Object.keys(strings),Object.keys(en),locale);for(const value of Object.values(strings))assert.ok(value.trim(),locale);}
 for(const panel of sheetsPanelDefs){assert.ok(en[panel.titleKey!]);for(const command of panel.commands??[])if(command.startsWith('sheets.')&&!['sheets.undo','sheets.redo','sheets.saveCopy'].includes(command))assert.ok(en['cmd.'+command]);}
});
