import test from 'node:test';import assert from 'node:assert/strict';
import {parseCellInfo} from './cellInfo';
const base={address:'B2',type:'number',display:'10',formula:'=A1*2',numberFormat:'General',locked:true,hiddenFormula:false,sheetProtected:false,merged:null,table:null,validation:null,highlightRules:0,note:null,link:null,spill:null,reads:1,readBy:0};
test('cell info answers are closed and bounded',()=>{
 assert.equal(parseCellInfo(base).formula,'=A1*2');
 assert.equal(parseCellInfo({...base,note:'comment',spill:{anchor:'B2',range:'B2:B4'},validation:'list'}).spill?.range,'B2:B4');
 for(const bad of [null,[],{...base,type:'x'},{...base,locked:'yes'},{...base,reads:-1},{...base,display:'x'.repeat(201)},{...base,note:'bad'},{...base,address:'a\u0000'},{...base,spill:{anchor:1,range:'x'}}])assert.throws(()=>parseCellInfo(bad));
});
