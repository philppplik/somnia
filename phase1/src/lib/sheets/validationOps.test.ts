import {test} from 'node:test';import assert from 'node:assert/strict';
import {DEFAULT_VALIDATION_EXTRAS,buildValidationOp,hhmm,isoDate,parseInvalidCells,parseItemList,parseValidationCommand,parseValidationRule} from './validationOps';
test('parseValidationCommand accepts each shape',()=>{
 for(const ok of [{kind:'list',items:['a','b']},{kind:'listRange',source:'A1:A9'},{kind:'number',whole:true,operator:'between',value:1,value2:10},{kind:'number',whole:false,operator:'greater',value:0},{kind:'length',operator:'lessOrEqual',value:20},{kind:'clear'}])assert.deepEqual(parseValidationCommand(ok),ok);
});
test('parseValidationCommand rejects malformed input',()=>{
 for(const bad of [null,[],{},{kind:'custom',formula:'=1'},{kind:'list',items:[]},{kind:'list',items:['a,b']},{kind:'list',items:['a"b']},{kind:'list',items:[1]},{kind:'list',items:Array(101).fill('x')},{kind:'listRange',source:'Other!A1'},{kind:'listRange',source:'A0'},{kind:'listRange',source:'A1:B2:C3'},{kind:'number',whole:true,operator:'between',value:1},{kind:'number',whole:true,operator:'greater',value:1,value2:2},{kind:'number',whole:'y',operator:'greater',value:1},{kind:'number',whole:true,operator:'greater',value:Infinity},{kind:'number',whole:true,operator:'regex',value:1},{kind:'clear',x:1}])assert.throws(()=>parseValidationCommand(bad),JSON.stringify(bad));
});
test('parseItemList trims, dedupes and refuses unusable lists',()=>{
 assert.deepEqual(parseItemList(' a, b ,a,,c '),['a','b','c']);
 assert.equal(parseItemList(' , '),null);assert.equal(parseItemList('a"b'),null);assert.equal(parseItemList('x'.repeat(65)),null);
});
test('buildValidationOp maps panel input',()=>{
 assert.deepEqual(buildValidationOp('list','greater','Yes, No','',),{kind:'list',items:['Yes','No']});
 assert.deepEqual(buildValidationOp('listRange','greater','$a$1:$a$5',''),{kind:'listRange',source:'A1:A5'});
 assert.deepEqual(buildValidationOp('whole','between','1','10'),{kind:'number',whole:true,operator:'between',value:1,value2:10});
 assert.deepEqual(buildValidationOp('length','lessOrEqual','20',''),{kind:'length',operator:'lessOrEqual',value:20});
 assert.equal(buildValidationOp('decimal','greater','x',''),null);assert.equal(buildValidationOp('whole','between','1',''),null);assert.equal(buildValidationOp('list','greater','',''),null);
});

test('dates, times and alert options are validated',()=>{
 assert.deepEqual(parseValidationCommand({kind:'date',operator:'greater',value:'2024-02-29'}),{kind:'date',operator:'greater',value:'2024-02-29'});
 assert.deepEqual(parseValidationCommand({kind:'time',operator:'between',value:'09:00',value2:'17:30',allowBlank:false,errorStyle:'warning',errorMessage:' Office hours '}),{kind:'time',operator:'between',value:'09:00',value2:'17:30',allowBlank:false,errorStyle:'warning',errorMessage:'Office hours'});
 assert.deepEqual(parseValidationCommand({kind:'list',items:['a'],dropdown:false}),{kind:'list',items:['a'],dropdown:false});
 for(const bad of [{kind:'date',operator:'greater',value:'2023-02-29'},{kind:'date',operator:'greater',value:'2024-13-01'},{kind:'date',operator:'greater',value:'1899-12-31'},{kind:'date',operator:'greater',value:'2024-1-1'},{kind:'date',operator:'between',value:'2024-01-01'},{kind:'date',operator:'greater',value:'2024-01-01',value2:'2024-02-01'},{kind:'time',operator:'less',value:'24:00'},{kind:'time',operator:'less',value:'9:30'},{kind:'number',whole:true,operator:'greater',value:1,dropdown:true},{kind:'list',items:['a'],errorStyle:'information'},{kind:'list',items:['a'],errorMessage:'x'.repeat(256)},{kind:'list',items:['a'],errorMessage:'a\u0007'},{kind:'list',items:['a'],allowBlank:'yes'},{kind:'clear',allowBlank:true}])
  assert.throws(()=>parseValidationCommand(bad),JSON.stringify(bad));
 assert.equal(isoDate('2000-02-29'),'2000-02-29');assert.throws(()=>isoDate('1900-02-29x'));assert.equal(hhmm('23:59'),'23:59');
});
test('panel inputs build date, time and alert rules',()=>{
 const ex={allowBlank:false,dropdown:false,errorStyle:'warning' as const,errorMessage:'Nope'};
 assert.deepEqual(buildValidationOp('date','between','2024-01-01','2024-12-31',ex),{kind:'date',operator:'between',value:'2024-01-01',value2:'2024-12-31',allowBlank:false,errorStyle:'warning',errorMessage:'Nope'});
 assert.equal(buildValidationOp('date','less','tomorrow','',ex),null);assert.equal(buildValidationOp('time','less','25:00','',ex),null);
 assert.deepEqual(buildValidationOp('list','between','a, b','',ex),{kind:'list',items:['a','b'],dropdown:false,allowBlank:false,errorStyle:'warning',errorMessage:'Nope'});
});
test('bridge answers about rules and invalid cells are bounded',()=>{
 assert.equal(parseValidationRule({rule:null}),null);assert.equal(parseValidationRule(null),null);
 assert.deepEqual(parseValidationRule({rule:{kind:'List',operator:'Between',f1:'"a,b"',f2:null,allowBlank:true,dropdown:false,errorStyle:'Stop',errorMessage:'',ranges:['A1:A3',5]}}),{kind:'List',operator:'Between',f1:'"a,b"',f2:null,allowBlank:true,dropdown:false,errorStyle:'Stop',errorMessage:'',inputTitle:'',inputMessage:'',errorTitle:'',ranges:['A1:A3']});
 assert.deepEqual(parseValidationCommand({kind:'list',items:['a'],inputTitle:' Pick ',inputMessage:'Choose one',errorTitle:'Oops'}),{kind:'list',items:['a'],inputTitle:'Pick',inputMessage:'Choose one',errorTitle:'Oops'});
 for(const bad of [{inputTitle:'x'.repeat(33)},{inputMessage:'x'.repeat(256)},{errorTitle:'a\nb'},{inputMessage:5}])assert.throws(()=>parseValidationCommand({kind:'list',items:['a'],...bad}));
 assert.deepEqual(buildValidationOp('list','between','a,b','',{...DEFAULT_VALIDATION_EXTRAS,inputTitle:'Hint',inputMessage:'Pick'}),{kind:'list',items:['a','b'],inputTitle:'Hint',inputMessage:'Pick'});
 assert.deepEqual(parseInvalidCells({invalid:['A1','bad',3,'B22'],truncated:true}),{cells:['A1','B22'],truncated:true});
 assert.deepEqual(parseInvalidCells(null),{cells:[],truncated:false});
 assert.equal(parseInvalidCells({invalid:Array.from({length:900},()=>'A1')}).cells.length,500);
});
