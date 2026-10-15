import {test} from 'node:test';import assert from 'node:assert/strict';
import {buildCfOp,parseCfCommand,CF_CHOICES} from './cfOps';
test('parseCfCommand accepts each allowlisted shape',()=>{
 for(const ok of [{kind:'cell',operator:'greater',value:5,style:'yellow'},{kind:'cell',operator:'between',value:1,value2:'z',style:'green'},{kind:'text',mode:'contains',text:'a',style:'redText'},{kind:'flag',flag:'duplicate',style:'lightRed'},{kind:'top',rank:10,bottom:false,percent:true,style:'green'},{kind:'scale',scale:'whiteBlue'},{kind:'clear'},{kind:'clearAll'}])assert.deepEqual(parseCfCommand(ok),ok);
});
test('parseCfCommand rejects malformed, formula-like and oversized input',()=>{
 for(const bad of [null,[],{},{kind:'expression',formula:'=1'},{kind:'cell',operator:'regex',value:1,style:'green'},{kind:'cell',operator:'greater',value:NaN,style:'green'},{kind:'cell',operator:'greater',value:1,value2:2,style:'green'},{kind:'cell',operator:'between',value:1,style:'green'},{kind:'cell',operator:'greater',value:1,style:'neon'},{kind:'text',mode:'contains',text:'',style:'green'},{kind:'text',mode:'contains',text:'a\u0000',style:'green'},{kind:'text',mode:'contains',text:'x'.repeat(256),style:'green'},{kind:'top',rank:0,bottom:false,percent:false,style:'green'},{kind:'top',rank:101,bottom:false,percent:true,style:'green'},{kind:'top',rank:1.5,bottom:false,percent:false,style:'green'},{kind:'scale',scale:'x'},{kind:'clear',style:'green'}])assert.throws(()=>parseCfCommand(bad),JSON.stringify(bad));
});
test('buildCfOp turns panel input into ops and nulls incomplete input',()=>{
 assert.deepEqual(buildCfOp('greater','1,500','','yellow',4),{kind:'cell',operator:'greater',value:1500,style:'yellow'});
 assert.deepEqual(buildCfOp('equal','abc','','green',4),{kind:'cell',operator:'equal',value:'abc',style:'green'});
 assert.deepEqual(buildCfOp('between','1','9','green',4),{kind:'cell',operator:'between',value:1,value2:9,style:'green'});
 assert.equal(buildCfOp('between','1','','green',4),null);
 assert.equal(buildCfOp('contains','','','green',4),null);
 assert.deepEqual(buildCfOp('bottom','3','','lightRed',4),{kind:'top',rank:3,bottom:true,percent:false,style:'lightRed'});
 assert.equal(buildCfOp('top','x','','lightRed',4),null);
 assert.deepEqual(buildCfOp('scaleBlue','','','green',4),{kind:'scale',scale:'whiteBlue'});
 assert.equal(buildCfOp('duplicate','','','green',2_000_000),null);
 for(const c of CF_CHOICES)assert.ok(buildCfOp(c,'5','9','green',4),c);
});
