import test from 'node:test';import assert from 'node:assert/strict';
import {parseAuditCommand,parseAuditAnswer} from './audit';
test('audit commands are closed shapes',()=>{
 for(const k of ['trace','errors','watchAdd','clear'])assert.deepEqual(parseAuditCommand({kind:k}),{kind:k});
 assert.deepEqual(parseAuditCommand({kind:'watchRemove',ref:"'S'!B5"}),{kind:'watchRemove',ref:"'S'!B5"});
 for(const bad of [null,[],{},{kind:'x'},{kind:'trace',ref:'A1'},{kind:'watchRemove'},{kind:'watchRemove',ref:''},{kind:'watchRemove',ref:'a\nb'},{kind:'watchRemove',ref:'x'.repeat(101)},{kind:'watchRemove',ref:'A1',x:1}])assert.throws(()=>parseAuditCommand(bad),JSON.stringify(bad));
});
test('bridge answers are bounded',()=>{
 const a=parseAuditAnswer({trace:{cell:'B2',formula:'=A1',precedents:[{sheet:'S',range:'A1'}],dependents:[],precedentsTotal:1,dependentsTotal:0},errors:{errors:[{sheet:0,sheetName:'S',cell:'C1',error:'#DIV/0!',formula:null}],total:1,circular:[]},watch:[{ref:"'S'!B2",value:'8',formula:'=A1*2'}]});
 assert.equal(a.trace?.precedents[0].range,'A1');assert.equal(a.errors?.total,1);assert.equal(a.watch?.[0].value,'8');
 assert.throws(()=>parseAuditAnswer(null));assert.throws(()=>parseAuditAnswer({watch:Array(51).fill({ref:'a',value:'',formula:null})}));
 assert.throws(()=>parseAuditAnswer({trace:{cell:'B2',formula:null,precedents:Array(101).fill({sheet:'S',range:'A1'}),dependents:[],precedentsTotal:1,dependentsTotal:0}}));
 assert.throws(()=>parseAuditAnswer({errors:{errors:[],total:-1,circular:[]}}));
 assert.throws(()=>parseAuditAnswer({watch:[{ref:'a\u0000',value:'',formula:null}]}));
});
