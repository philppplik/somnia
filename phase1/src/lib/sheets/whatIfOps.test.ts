import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseWhatIfCommand,parseScenarios,parseGoalResult} from './whatIfOps';
test('what-if commands accept only closed shapes',()=>{
 assert.deepEqual(parseWhatIfCommand({kind:'goalSeek',set:'b5',to:100,changing:'B2'}),{kind:'goalSeek',set:'B5',to:100,changing:'B2'});
 assert.deepEqual(parseWhatIfCommand({kind:'scenarioAdd',name:' Best ',changing:'b2:b4',values:[1,'x',true,null],replace:true}),{kind:'scenarioAdd',name:'Best',changing:'B2:B4',values:[1,'x',true,null],replace:true});
 assert.deepEqual(parseWhatIfCommand({kind:'scenarioShow',name:'Best'}),{kind:'scenarioShow',name:'Best'});
 assert.deepEqual(parseWhatIfCommand({kind:'scenarioSummary'}),{kind:'scenarioSummary'});
 assert.deepEqual(parseWhatIfCommand({kind:'scenarioSummary',resultCells:'b10,b12:b13'}),{kind:'scenarioSummary',resultCells:'B10,B12:B13'});
 assert.deepEqual(parseWhatIfCommand({kind:'dataTable',range:'d2:f10',columnInput:'b1'}),{kind:'dataTable',range:'D2:F10',columnInput:'B1'});
});
test('what-if commands refuse malformed, cross-sheet and oversized input',()=>{
 for(const bad of [null,[],{},{kind:'x'},{kind:'goalSeek',set:'B5',to:'1',changing:'B2'},{kind:'goalSeek',set:'B5',to:Infinity,changing:'B2'},{kind:'goalSeek',set:'Sheet2!B5',to:1,changing:'B2'},{kind:'goalSeek',set:'B5:B6',to:1,changing:'B2'},{kind:'goalSeek',set:'B5',to:1,changing:'B2',x:1},
  {kind:'scenarioAdd',name:'',changing:'B2'},{kind:'scenarioAdd',name:'a\nb',changing:'B2'},{kind:'scenarioAdd',name:'x'.repeat(256),changing:'B2'},{kind:'scenarioAdd',name:'x',changing:'B2,'},{kind:'scenarioAdd',name:'x',changing:'B2',values:[[1]]},{kind:'scenarioAdd',name:'x',changing:'B2',values:Array(33).fill(1)},{kind:'scenarioAdd',name:'x',changing:'B2',values:[NaN]},{kind:'scenarioAdd',name:'x',changing:'B2',replace:'y'},
  {kind:'scenarioSummary',resultCells:'=A1'},{kind:'dataTable',range:'D2',columnInput:'B1'},{kind:'dataTable',range:'D2:F10'},{kind:'dataTable',range:'D2:F10',rowInput:'B1:B2'},{kind:'dataTable',range:'D2:F10',rowInput:'B0'}])assert.throws(()=>parseWhatIfCommand(bad),JSON.stringify(bad));
});
test('bridge replies are parsed defensively',()=>{
 assert.deepEqual(parseScenarios({scenarios:[{name:'A',changing:'B2',values:[1,'x',{}],comment:5},{name:3},null]}),[{name:'A',changing:'B2',comment:'',values:['1','x','']}]);
 assert.deepEqual(parseScenarios(null),[]);
 assert.deepEqual(parseGoalResult({value:9.5,converged:true}),{value:9.5,converged:true});assert.equal(parseGoalResult({value:'x'}),null);
});
import {buildWhatIfOp,WHATIF_ACTIONS,WHATIF_GROUPS} from './whatIfOps';
test('the panel builds ops only from complete fields',()=>{
 const f={set:'B5',to:'1,5',changing:'B2',name:'Best',pick:'Best',results:'',rowInput:'B1',columnInput:'B2',selection:'D2:F10',selectionCells:27};
 for(const a of WHATIF_ACTIONS)assert.ok(buildWhatIfOp(a,f),a);
 assert.equal((buildWhatIfOp('goalSeek',f) as {to:number}).to,1.5);
 assert.equal(buildWhatIfOp('goalSeek',{...f,to:''}),null);assert.equal(buildWhatIfOp('scenarioAdd',{...f,selectionCells:33}),null);assert.equal(buildWhatIfOp('scenarioAdd',{...f,name:' '}),null);
 assert.equal(buildWhatIfOp('tableBoth',{...f,columnInput:''}),null);assert.deepEqual(buildWhatIfOp('tableRow',f),{kind:'dataTable',range:'D2:F10',rowInput:'B1'});
 assert.equal(WHATIF_GROUPS.flatMap(g=>g[1]).length,WHATIF_ACTIONS.length);
});
