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
test('line numbers: toggled, changed and cleared through the patch; bad counts refused',()=>{
 const s=formFromState(state);assert.equal(s.lines.on,false);
 assert.deepEqual(buildPageSetupPatch(s,{...s,lines:{on:true,countBy:'5',restart:'continuous'}}),{lineNumbers:{countBy:5,restart:'continuous'}});
 const on=formFromState({...state,lineNumbers:{countBy:2,restart:'section'}});assert.equal(buildPageSetupPatch(on,on),null);
 assert.deepEqual(buildPageSetupPatch(on,{...on,lines:{...on.lines,on:false}}),{lineNumbers:null});
 assert.equal(buildPageSetupPatch(s,{...s,lines:{on:true,countBy:'0x',restart:'page'}}),null);
 assert.equal(buildPageSetupPatch(s,{...s,lines:{on:true,countBy:'101',restart:'page'}}),null);
 for(const ok of [{lineNumbers:null},{lineNumbers:{countBy:100}},{lineNumbers:{restart:'page'}}])assert.equal(pageSetupProblem(ok),null);
 for(const bad of [{lineNumbers:{}},{lineNumbers:3},{lineNumbers:{countBy:0}},{lineNumbers:{countBy:1.5}},{lineNumbers:{restart:'x'}},{lineNumbers:{z:1}}])assert.notEqual(pageSetupProblem(bad),null,JSON.stringify(bad));
});
import {buildLookPatch,lookFromState} from '../../lib/documents/pageLook';
test('page look: only changed parts, bounded values, border off is null',()=>{
 const s=lookFromState({...state,valign:'top',pageNumbers:{start:null,format:'decimal'},pageBorder:null});
 assert.equal(buildLookPatch(s,s),null);
 assert.deepEqual(buildLookPatch(s,{...s,valign:'center'}),{valign:'center'});
 assert.deepEqual(buildLookPatch(s,{...s,start:'5',format:'lowerRoman'}),{pageNumbers:{start:5,format:'lowerRoman'}});
 assert.equal(buildLookPatch(s,{...s,start:'0'}),null);assert.equal(buildLookPatch(s,{...s,start:'12345'}),null);assert.equal(buildLookPatch(s,{...s,start:'x'}),null);
 assert.deepEqual(buildLookPatch(s,{...s,border:true,width:'2,5',style:'double',color:'#336699'}),{pageBorder:{style:'double',width:2.5,color:'#336699'}});
 assert.equal(buildLookPatch(s,{...s,border:true,width:'7'}),null);
 const on=lookFromState({...state,pageBorder:{style:'thick',width:3,color:null}});
 assert.deepEqual(buildLookPatch(on,{...on,border:false}),{pageBorder:null});
 assert.deepEqual(buildLookPatch({...s,start:'5'},{...s,start:''}),{pageNumbers:{start:null}});
});
test('page setup patches validate valign, page numbers and borders',()=>{
 for(const bad of [{valign:'mid'},{pageNumbers:{}},{pageNumbers:{start:0}},{pageNumbers:{format:'x'}},{pageBorder:{style:'none'}},{pageBorder:{width:0.1}},{pageBorder:{color:'red'}},{pageBorder:5}])assert.ok(pageSetupProblem(bad),JSON.stringify(bad));
 for(const good of [{valign:'bottom'},{pageNumbers:{start:null}},{pageBorder:null},{pageBorder:{color:null}}])assert.equal(pageSetupProblem(good),null,JSON.stringify(good));
});
