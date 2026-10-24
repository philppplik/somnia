import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildLayoutPatch,layoutFromState,type PadForm} from './tableLayout';
import {tableLayoutProblem} from './protocol';
const s=layoutFromState({align:null,widthPct:null,headerRow:false,keepRows:false,cellValign:'top',caption:''});
test('table layout patch carries only changes and bounded values',()=>{
 assert.equal(buildLayoutPatch(s,s),null);
 assert.deepEqual(buildLayoutPatch(s,{...s,align:'center',width:'60',header:true,keep:true,valign:'bottom',caption:'Sales'}),{align:'center',widthPct:60,headerRow:true,keepRows:true,cellValign:'bottom',caption:'Sales'});
 assert.deepEqual(buildLayoutPatch({...s,align:'right',width:'50'},{...s,align:'auto',width:''}),{align:null,widthPct:null});
 for(const w of ['9','101','x','5','1000','50.5'])assert.equal(buildLayoutPatch(s,{...s,width:w}),null,w);
 assert.equal(buildLayoutPatch(s,{...s,caption:'a\nb'}),null);
});
test('tableLayoutProblem mirrors the worker',()=>{
 for(const bad of [null,[],{},{x:1},{align:'justify'},{widthPct:9},{widthPct:'a'},{headerRow:1},{cellValign:'mid'},{caption:5}])assert.ok(tableLayoutProblem(bad),JSON.stringify(bad));
 for(const good of [{align:null},{widthPct:null},{widthPct:100},{caption:''}])assert.equal(tableLayoutProblem(good),null,JSON.stringify(good));
});
import {tableLayoutProblem as problem} from './protocol';
test('row height patches are built and validated',()=>{
 const base={align:null,widthPct:null,headerRow:false,keepRows:false,cellValign:'top',caption:'',rowRule:'auto',rowHeight:null} as never;
 const a=layoutFromState(base);assert.equal(buildLayoutPatch(a,a),null);
 assert.deepEqual(buildLayoutPatch(a,{...a,rowRule:'exact',rowHeight:'40'}),{rowHeight:{rule:'exact',value:40}});
 assert.deepEqual(buildLayoutPatch(a,{...a,rowRule:'atLeast',rowHeight:'20',allRows:true}),{rowHeight:{rule:'atLeast',value:20},allRows:true});
 assert.equal(buildLayoutPatch(a,{...a,rowRule:'exact',rowHeight:''}),null);
 assert.equal(buildLayoutPatch(a,{...a,rowRule:'exact',rowHeight:'0'}),null);
 assert.deepEqual(buildLayoutPatch(a,{...a,allRows:true}),{rowHeight:{rule:'auto'},allRows:true});
 for(const bad of [{rowHeight:{rule:'exact'}},{rowHeight:{rule:'exact',value:2000}},{rowHeight:{rule:'auto',value:3}},{rowHeight:5},{rowHeight:null},{rowHeight:{rule:'x'}},{allRows:true},{rowHeight:{rule:'exact',value:10,z:1}}])assert.ok(problem(bad),JSON.stringify(bad));
 assert.equal(problem({rowHeight:{rule:'exact',value:10},allRows:true}),null);
});
test('cell padding: all four sides or none, bounded, only what changed',()=>{
 const base=layoutFromState({align:null,widthPct:null,headerRow:false,keepRows:false,cellValign:'top',caption:'',cellPadding:null,cellMargins:null});
 assert.deepEqual(buildLayoutPatch(base,{...base,pad:['2','8','2','8']}),{cellPadding:{top:2,left:8,bottom:2,right:8}});
 assert.deepEqual(buildLayoutPatch(base,{...base,cellPad:['0','20.5','0','0']}),{cellMargins:{top:0,left:20.5,bottom:0,right:0}});
 const set=layoutFromState({align:null,widthPct:null,headerRow:false,keepRows:false,cellValign:'top',caption:'',cellPadding:{top:1,left:2,bottom:3,right:4},cellMargins:null});
 assert.deepEqual(set.pad,['1','2','3','4']);
 assert.deepEqual(buildLayoutPatch(set,{...set,pad:['','','','']}),{cellPadding:null});
 for(const bad of [['1','','','']as PadForm,['a','1','1','1']as PadForm,['73','1','1','1']as PadForm,['-1','1','1','1']as PadForm,['1.234','1','1','1']as PadForm])assert.equal(buildLayoutPatch(base,{...base,pad:bad}),null,bad.join());
 for(const bad of [{cellPadding:5},{cellPadding:{top:1}},{cellPadding:{top:1,left:1,bottom:1,right:99}},{cellMargins:{top:1,left:1,bottom:1,right:1,x:1}},{cellMargins:[]}])assert.ok(tableLayoutProblem(bad),JSON.stringify(bad));
 assert.equal(tableLayoutProblem({cellPadding:null,cellMargins:{top:0,left:0,bottom:0,right:72}}),null);
});
import {FILL_SWATCH} from './tableLayout';
test('table fill builds a patch only when the colour or scope changed',()=>{
 const a=layoutFromState({align:null,widthPct:null,headerRow:false,keepRows:false,cellValign:'top',caption:'',cellShading:null});
 assert.equal(a.fill,'none');assert.equal(buildLayoutPatch(a,a),null);
 assert.deepEqual(buildLayoutPatch(a,{...a,fill:FILL_SWATCH}),{shading:{color:FILL_SWATCH,scope:'cell'}});
 assert.deepEqual(buildLayoutPatch(a,{...a,fillScope:'row'}),{shading:{color:'none',scope:'row'}});
 const b=layoutFromState({...{align:null,widthPct:null,headerRow:false,keepRows:false,cellValign:'top' as const,caption:''},cellShading:'FFCC00'});
 assert.equal(b.fill,'ffcc00');assert.deepEqual(buildLayoutPatch(b,{...b,fill:'none',fillScope:'table'}),{shading:{color:'none',scope:'table'}});
 assert.equal(buildLayoutPatch(a,{...a,fill:'red'}),null);assert.equal(buildLayoutPatch(a,{...a,fill:'ff00'}),null);
});
test('the fill patch is checked like the worker checks it',()=>{
 assert.equal(tableLayoutProblem({shading:{color:'none',scope:'table'}}),null);assert.equal(tableLayoutProblem({shading:{color:'AbCdEf',scope:'column'}}),null);
 for(const bad of ['ff0000',null,{color:'ff0000'},{color:'#ff0000',scope:'cell'},{color:'red',scope:'cell'},{color:'ff0000',scope:'page'},{color:'ff0000',scope:'cell',x:1},[1]])assert.ok(tableLayoutProblem({shading:bad}),JSON.stringify(bad));
});
