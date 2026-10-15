import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseDataToolCommand,parseSourceList,isSourceRange,dataToolProblem} from './dataToolOps';
test('data tool commands are closed shapes',()=>{
 assert.deepEqual(parseDataToolCommand({kind:'flashFill'}),{kind:'flashFill'});
 assert.deepEqual(parseDataToolCommand({kind:'consolidate',function:'sum',sources:[' East!A1:C3 ','B2']}),{kind:'consolidate',function:'sum',sources:['East!A1:C3','B2'],topRow:false,leftColumn:false});
 assert.equal((parseDataToolCommand({kind:'consolidate',function:'max',sources:['A1:B2'],topRow:true,leftColumn:true}) as {topRow:boolean}).topRow,true);
 const bad=[null,[],{},{kind:'flashFill',x:1},{kind:'consolidate'},{kind:'consolidate',function:'median',sources:['A1']},{kind:'consolidate',function:'sum',sources:[]},{kind:'consolidate',function:'sum',sources:[5]},{kind:'consolidate',function:'sum',sources:['A1;B2']},{kind:'consolidate',function:'sum',sources:['=EVIL()']},
  {kind:'consolidate',function:'sum',sources:Array.from({length:21},()=>'A1')},{kind:'consolidate',function:'sum',sources:['A1'],topRow:'y'},{kind:'consolidate',function:'sum',sources:['A1'],extra:1},{kind:'x'}];
 for(const b of bad)assert.throws(()=>parseDataToolCommand(b),JSON.stringify(b));
});
test('source ranges are plain A1 ranges, optionally with a sheet',()=>{
 for(const ok of ['A1','$B$2:$D$9',"'My Sheet'!A1:B2",'West!C3:D4'])assert.ok(isSourceRange(ok),ok);
 for(const bad of ['','A','1','A1:','A1:B','[Book]Sheet!A1','Sheet!','A1:B2:C3','A1\nA2','SUM(A1)','A1'+' '.repeat(300),null,5])assert.ok(!isSourceRange(bad),String(bad));
 assert.deepEqual(parseSourceList('A1:B2; West!C1:D2 ;'),['A1:B2','West!C1:D2']);assert.equal(parseSourceList(''),null);assert.equal(parseSourceList('A1;nope'),null);assert.equal(parseSourceList(Array.from({length:21},()=>'A1').join(';')),null);
});
test('flash fill needs a column to the left',()=>{assert.equal(dataToolProblem({kind:'flashFill'},0),'left');assert.equal(dataToolProblem({kind:'flashFill'},1),null);assert.equal(dataToolProblem({kind:'consolidate',function:'sum',sources:['A1'],topRow:false,leftColumn:false},0),null);});
