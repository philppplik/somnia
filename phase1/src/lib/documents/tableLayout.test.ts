import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildLayoutPatch,layoutFromState} from './tableLayout';
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
