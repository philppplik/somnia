import test from 'node:test';import assert from 'node:assert/strict';
import {parsePagesCommand,parsePageList,pageStart} from './pageBreaks';
test('pages commands are closed shapes',()=>{
 assert.deepEqual(parsePagesCommand({kind:'show'}),{kind:'show'});assert.deepEqual(parsePagesCommand({kind:'clear'}),{kind:'clear'});
 for(const bad of [null,[],{},{kind:'x'},{kind:'show',y:1}])assert.throws(()=>parsePagesCommand(bad));
});
test('bridge answers are bounded',()=>{
 const p={page:1,range:'A1:H40',rows:'1:40',columns:'A:H',scale:85,paper:'A4',orientation:'portrait'};
 assert.equal(parsePageList({pages:[p],total:3}).total,3);assert.equal(pageStart('B7:H40'),'B7');
 assert.throws(()=>parsePageList(null));assert.throws(()=>parsePageList({pages:Array(501).fill(p),total:501}));
 assert.throws(()=>parsePageList({pages:[{...p,scale:-1}],total:1}));assert.throws(()=>parsePageList({pages:[{...p,range:'A\u0000'}],total:1}));assert.throws(()=>parsePageList({pages:[],total:-1}));
});
