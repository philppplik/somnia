import test from 'node:test';import assert from 'node:assert/strict';
import {describeCfRule,parseCfManageCommand,parseCfRules} from './cfManageOps';
test('rule management commands accept the closed allowlist',()=>{
 for(const kind of ['delete','moveUp','moveDown','moveTop','moveBottom'])assert.deepEqual(parseCfManageCommand({kind,index:3}),{kind,index:3});
});
test('rule management commands refuse malformed input',()=>{
 for(const bad of [null,[],'x',{},{kind:'delete'},{kind:'delete',index:-1},{kind:'delete',index:1.5},{kind:'delete',index:200},{kind:'delete',index:'1'},{kind:'burn',index:0},{kind:'delete',index:0,extra:1}])
  assert.throws(()=>parseCfManageCommand(bad),JSON.stringify(bad));
});
test('rule lists are bounded and cleaned',()=>{
 assert.deepEqual(parseCfRules(null),[]);assert.deepEqual(parseCfRules({rules:'x'}),[]);
 const rules=parseCfRules({rules:[{index:0,ranges:['A1:B2',3],kind:'CellIs',detail:{op:'Greater',a:'4',nested:{x:1},rank:2},stop:true},{index:'x',kind:'Blanks'},null,{index:1,kind:'Blanks'}]});
 assert.equal(rules.length,2);assert.deepEqual(rules[0],{index:0,ranges:['A1:B2'],kind:'CellIs',detail:{op:'Greater',a:'4',rank:2},stop:true});
 assert.deepEqual(rules[1],{index:1,ranges:[],kind:'Blanks',detail:{},stop:false});
 assert.equal(parseCfRules({rules:Array.from({length:300},(_,i)=>({index:i,kind:'Blanks'}))}).length,200);
});
test('rule descriptions use the translated kind and the range',()=>{
 assert.equal(describeCfRule({index:0,ranges:['A1:A9'],kind:'CellIs',detail:{op:'Greater',a:'4'},stop:false},k=>'K:'+k),'K:CellIs Greater 4 · A1:A9');
 assert.equal(describeCfRule({index:0,ranges:[],kind:'Blanks',detail:{},stop:false},k=>k),'Blanks · -');
});
