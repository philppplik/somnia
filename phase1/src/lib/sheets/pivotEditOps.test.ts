import {test} from 'node:test';import assert from 'node:assert/strict';
import {parsePivotEditCommand,parsePivotReports,pivotSourceProblem} from './pivotEditOps';
test('pivot edit commands are closed shapes',()=>{
 assert.deepEqual(parsePivotEditCommand({kind:'addField',pivot:'P1',field:'Region',area:'rows'}),{kind:'addField',pivot:'P1',field:'Region',area:'rows'});
 assert.deepEqual(parsePivotEditCommand({kind:'addField',pivot:'P1',field:'Units',area:'values',func:'average'}),{kind:'addField',pivot:'P1',field:'Units',area:'values',func:'average'});
 assert.deepEqual(parsePivotEditCommand({kind:'moveField',pivot:'P1',field:'A',from:'rows',to:'columns'}),{kind:'moveField',pivot:'P1',field:'A',from:'rows',to:'columns'});
 assert.deepEqual(parsePivotEditCommand({kind:'valueSettings',pivot:'P1',index:0,numberFormat:null}),{kind:'valueSettings',pivot:'P1',index:0,numberFormat:null});
 assert.deepEqual(parsePivotEditCommand({kind:'filter',pivot:'P1',field:'A',selected:null}),{kind:'filter',pivot:'P1',field:'A',selected:null});
 assert.deepEqual(parsePivotEditCommand({kind:'filter',pivot:'P1',field:'A',selected:['East']}),{kind:'filter',pivot:'P1',field:'A',selected:['East']});
 assert.deepEqual(parsePivotEditCommand({kind:'layout',pivot:'P1',layout:'tabular',grandTotalsRows:false,style:'PivotStyleMedium9'}),{kind:'layout',pivot:'P1',layout:'tabular',grandTotalsRows:false,style:'PivotStyleMedium9'});
 for(const k of ['changeSource','refresh','delete'])assert.deepEqual(parsePivotEditCommand({kind:k,pivot:'P1'}),{kind:k,pivot:'P1'});
 const p='P1';
 const badOps:unknown[]=[null,[],{},{kind:'refresh'},{kind:'refresh',pivot:''},{kind:'refresh',pivot:'a\nb'},{kind:'refresh',pivot:p,x:1},{kind:'x',pivot:p},{kind:'addField',pivot:p,field:'A',area:'sideways'},{kind:'addField',pivot:p,field:'A',area:'rows',func:'evil'},
  {kind:'valueSettings',pivot:p,index:-1,func:'sum'},{kind:'valueSettings',pivot:p,index:64,func:'sum'},{kind:'valueSettings',pivot:p,index:0},{kind:'valueSettings',pivot:p,index:0,numberFormat:'[Red]0'},{kind:'valueSettings',pivot:p,index:1.5,func:'sum'},
  {kind:'filter',pivot:p,field:'A',selected:[]},{kind:'filter',pivot:p,field:'A',selected:[5]},{kind:'filter',pivot:p,field:'A',selected:Array.from({length:201},()=>'x')},{kind:'filter',pivot:p,field:'A'},
  {kind:'sort',pivot:p,field:'A',order:'random'},{kind:'group',pivot:p,field:'A',by:'decades'},{kind:'collapse',pivot:p,field:'A'},{kind:'layout',pivot:p},{kind:'layout',pivot:p,style:'PivotStyleEvil1'},{kind:'layout',pivot:p,grandTotalsRows:'no'},{kind:'layout',pivot:p,subtotals:'middle'}];
 for(const b of badOps)assert.throws(()=>parsePivotEditCommand(b),JSON.stringify(b));
});
test('the bridge answer is parsed into a bounded closed shape',()=>{
 const r=parsePivotReports({pivots:[{name:'PivotTable1',source:'Data!$A$1:$C$5',range:'A3:C6',rows:[{field:'Region',sort:'asc',group:'none',collapsed:[]}],columns:[],values:[{field:'Units',func:'sum',name:'Sum of Units',showAs:'normal',numberFormat:null}],filters:[],layout:'compact',grandTotalsRows:true,grandTotalsCols:false,subtotals:'bottom',style:'PivotStyleLight16',showHeaders:true,fields:[{name:'Region',numeric:false,date:false,areas:['rows']},{name:'',numeric:true}],records:4},{name:''},null]});
 assert.equal(r.length,1);assert.equal(r[0].rows[0].field,'Region');assert.equal(r[0].values[0].func,'sum');assert.equal(r[0].grandTotalsCols,false);assert.equal(r[0].fields.length,1);assert.equal(r[0].records,4);
 for(const bad of [null,{},{pivots:'x'}])assert.throws(()=>parsePivotReports(bad));
 assert.deepEqual(parsePivotReports({pivots:[]}),[]);
});
test('source block needs a header and a data row',()=>{assert.equal(pivotSourceProblem(1,3),'small');assert.equal(pivotSourceProblem(2,3),null);assert.equal(pivotSourceProblem(2000,1000),'large');});
