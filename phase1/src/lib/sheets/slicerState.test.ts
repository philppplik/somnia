import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getSlicerFilter,MAX_SLICER_RECORDS,noteFilterApplied,noteFilterHistory,pickedFromMirror,resetSlicerFilter,slicerFilterAllowed,subscribeSlicer} from './slicerState';
import type {FilterOp} from './protocol';

const range={r0:0,c0:0,r1:9,c1:2};
const values:FilterOp={kind:'values',column:1,values:['a','b'],blanks:false};

test('records an applied values filter per file, sheet and column',()=>{
 resetSlicerFilter('t.xlsx');
 assert.equal(getSlicerFilter('t.xlsx',0,1),null,'no record means unknown, not "no filter"');
 noteFilterApplied('t.xlsx',0,range,values);
 assert.deepEqual(getSlicerFilter('t.xlsx',0,1),{op:values,range,stale:false});
 assert.equal(getSlicerFilter('t.xlsx',0,0),null,'another column of the same sheet stays unknown');
 assert.equal(getSlicerFilter('t.xlsx',1,1),null,'other sheet of the same file stays unknown');
 assert.equal(getSlicerFilter('other.xlsx',0,1),null,'other file stays unknown');
});

test('columns keep their own criteria: replacing or clearing one column leaves the others',()=>{
 resetSlicerFilter('t.xlsx');
 const custom:FilterOp={kind:'custom',column:0,op:'contains',value:'x'};
 noteFilterApplied('t.xlsx',0,range,values);
 noteFilterApplied('t.xlsx',0,range,custom);
 assert.deepEqual(getSlicerFilter('t.xlsx',0,0)?.op,custom,'column 0 keeps its own criterion');
 assert.deepEqual(getSlicerFilter('t.xlsx',0,1)?.op,values,'column 1 is untouched by column 0');
 noteFilterApplied('t.xlsx',0,range,{kind:'clear',column:1});
 assert.equal(getSlicerFilter('t.xlsx',0,1)?.op,null,'clearing the filtered column resolves to no filter');
 assert.deepEqual(getSlicerFilter('t.xlsx',0,0)?.op,custom,'clearing column 1 keeps column 0');
});

test('clear only resolves a record for the same column; clearAll and off clear every column',()=>{
 resetSlicerFilter('t.xlsx');
 noteFilterApplied('t.xlsx',0,range,{kind:'clear',column:3});
 assert.equal(getSlicerFilter('t.xlsx',0,3),null,'clearing without a record teaches nothing');
 noteFilterApplied('t.xlsx',0,range,values);
 noteFilterApplied('t.xlsx',0,range,{kind:'clear',column:0});
 assert.deepEqual(getSlicerFilter('t.xlsx',0,1)?.op,values,'clearing another column keeps the known filter');
 noteFilterApplied('t.xlsx',0,range,{kind:'clear',column:1});
 assert.equal(getSlicerFilter('t.xlsx',0,1)?.op,null,'clearing the filtered column resolves to no filter');
 noteFilterApplied('t.xlsx',0,range,values);
 noteFilterApplied('t.xlsx',0,range,{kind:'clearAll'});
 assert.equal(getSlicerFilter('t.xlsx',0,1)?.op,null);
 assert.equal(getSlicerFilter('t.xlsx',0,7)?.op,null,'clearAll also resolves columns without a record');
 noteFilterApplied('t.xlsx',0,range,values);
 noteFilterApplied('t.xlsx',0,range,{kind:'off'});
 assert.equal(getSlicerFilter('t.xlsx',0,1)?.op,null);
 assert.equal(getSlicerFilter('t.xlsx',0,7)?.op,null,'off also resolves columns without a record');
});

test('history jumps mark records stale; the next applied op is fresh again',()=>{
 resetSlicerFilter('t.xlsx');
 noteFilterApplied('t.xlsx',0,range,values);
 noteFilterHistory('t.xlsx');
 assert.equal(getSlicerFilter('t.xlsx',0,1)?.stale,true,'undo/redo demotes to last-known');
 noteFilterHistory('other.xlsx');
 assert.equal(getSlicerFilter('t.xlsx',0,1)?.stale,true,'other files are untouched');
 const custom:FilterOp={kind:'custom',column:0,op:'contains',value:'x'};
 noteFilterApplied('t.xlsx',0,range,custom);
 assert.deepEqual(getSlicerFilter('t.xlsx',0,0),{op:custom,range,stale:false});
 noteFilterApplied('t.xlsx',0,range,{kind:'clearAll'});
 noteFilterHistory('t.xlsx');
 assert.equal(getSlicerFilter('t.xlsx',0,5)?.stale,true,'the cleared sheet state goes stale too');
});

test('subscribers are notified on record, history and reset',()=>{
 resetSlicerFilter('t.xlsx');
 let calls=0;const off=subscribeSlicer(()=>calls++);
 noteFilterApplied('t.xlsx',0,range,values);
 noteFilterHistory('t.xlsx');
 noteFilterHistory('quiet.xlsx');
 resetSlicerFilter('t.xlsx');
 off();
 noteFilterApplied('t.xlsx',0,range,values);
 assert.equal(calls,3,'no event for an untouched file or after unsubscribe');
});

test('records are bounded and evict the oldest',()=>{
 for(let i=0;i<MAX_SLICER_RECORDS+10;i++)noteFilterApplied('f'+i+'.xlsx',0,range,values);
 let size=0;for(let i=0;i<MAX_SLICER_RECORDS+10;i++)if(getSlicerFilter('f'+i+'.xlsx',0,1))size++;
 assert.equal(size,MAX_SLICER_RECORDS);
 assert.equal(getSlicerFilter('f0.xlsx',0,1),null,'oldest evicted');
 assert.ok(getSlicerFilter('f'+(MAX_SLICER_RECORDS+9)+'.xlsx',0,1),'newest kept');
});

test('slicerFilterAllowed honours the autofilter permission',()=>{
 assert.equal(slicerFilterAllowed(null),true);
 assert.equal(slicerFilterAllowed(undefined),true);
 assert.equal(slicerFilterAllowed({password:false,allow:['autofilter']}),true);
 assert.equal(slicerFilterAllowed({password:false,allow:['sort']}),false);
 assert.equal(slicerFilterAllowed({password:true,allow:[]}),false);
});

test('pickedFromMirror only initializes from a fresh values filter on the same column',()=>{
 const data={values:[{text:'a',count:3},{text:'b',count:2},{text:'c',count:1}],blanks:2,truncated:false};
 const mirror={op:{kind:'values',column:1,values:['a','c'],blanks:true} as FilterOp,range,stale:false};
 const init=pickedFromMirror(data,mirror,1);
 assert.ok(init);assert.equal(init.blanksOn,true);assert.deepEqual([...init.off],['b'],'only the hidden value is unticked');
 assert.equal(pickedFromMirror(data,{...mirror,stale:true},1),null,'stale mirror offers nothing');
 assert.equal(pickedFromMirror(data,mirror,0),null,'another column');
 assert.equal(pickedFromMirror(data,{op:{kind:'custom',column:1,op:'contains',value:'a'},range,stale:false},1),null,'non-values op');
 assert.equal(pickedFromMirror(data,{op:null,range:null,stale:false},1),null,'cleared filter starts all-ticked');
});
