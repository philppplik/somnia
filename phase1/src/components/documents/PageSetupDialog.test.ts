import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPageSetupPatch,cmToPt,formFromState,ptToCm,spaceToPt} from './PageSetupDialog';
import {parsePage} from './GoToPageDialog';
import {pageSetupProblem} from '../../lib/documents/protocol';
const state={size:'letter' as const,landscape:false,width:612,height:792,margins:{top:72,bottom:72,left:72,right:72},columns:{count:1,space:36,separator:false,uneven:false}};
test('centimetres convert to points inside the bounds and nothing else is accepted',()=>{
 assert.equal(ptToCm(72),'2.54');assert.equal(cmToPt('2.54'),72);assert.equal(cmToPt('2,5'),70.9);assert.equal(cmToPt('0'),0);assert.equal(cmToPt('10.16'),288);
 for(const bad of ['','-1','10.17','11','abc','1.234','1e1',' 2','2 ','.5'])assert.equal(cmToPt(bad),null,bad);
});
test('only changed settings go into the patch; untouched margins keep their exact points',()=>{
 const s=formFromState(state);
 assert.equal(buildPageSetupPatch(s,s),null);
 assert.deepEqual(buildPageSetupPatch(s,{...s,size:'a4'}),{size:'a4'});
 assert.deepEqual(buildPageSetupPatch(s,{...s,landscape:true,margins:{...s.margins,left:'3.00'}}),{landscape:true,margins:{left:85}});
 assert.equal(buildPageSetupPatch(s,{...s,margins:{...s.margins,top:'x'}}),null);
 assert.equal(buildPageSetupPatch(formFromState({...state,size:'custom'}),formFromState({...state,size:'custom'})),null);
});
test('columns go into the patch only when changed and stay inside their bounds',()=>{
 const s=formFromState(state);
 assert.deepEqual(buildPageSetupPatch(s,{...s,columns:{...s.columns,count:3}}),{columns:{count:3}});
 assert.deepEqual(buildPageSetupPatch(s,{...s,columns:{count:2,space:'1,5',separator:true}}),{columns:{count:2,space:42.5,separator:true}});
 assert.equal(buildPageSetupPatch(s,{...s,columns:{...s.columns,space:'5.09'}}),null);
 assert.equal(buildPageSetupPatch(s,{...s,columns:{...s.columns,space:'x'}}),null);
 assert.equal(spaceToPt('5.08'),144);
});
test('page numbers are whole numbers inside the page count',()=>{
 assert.equal(parsePage('3',5),3);assert.equal(parsePage('5',5),5);
 for(const bad of ['','0','6','1.5','-1','abc','1234567'])assert.equal(parsePage(bad,5),null,bad);
});
test('page setup checker refuses malformed changes',()=>{
 for(const bad of [null,[],{},'x',{size:'b7'},{size:3},{landscape:'y'},{margins:{}},{margins:{top:-1}},{margins:{top:289}},{margins:{up:1}},{margins:{top:Number.NaN}},{margins:5},{nope:1}])assert.notEqual(pageSetupProblem(bad),null,JSON.stringify(bad));
 for(const bad of [{columns:{}},{columns:3},{columns:[]},{columns:{count:0}},{columns:{count:5}},{columns:{count:1.5}},{columns:{count:'2'}},{columns:{space:-1}},{columns:{space:145}},{columns:{space:Number.NaN}},{columns:{separator:1}},{columns:{width:5}}])assert.notEqual(pageSetupProblem(bad),null,JSON.stringify(bad));
 for(const ok of [{columns:{count:4,space:144,separator:true}},{columns:{count:1}},{columns:{separator:false}},{size:'a4'},{landscape:false},{margins:{top:0}},{margins:{top:288,left:10}},{size:'legal',landscape:true,margins:{bottom:1}}])assert.equal(pageSetupProblem(ok),null,JSON.stringify(ok));
});
