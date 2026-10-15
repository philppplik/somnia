import test from 'node:test';
import assert from 'node:assert/strict';
import {distinctValues,filterValueProblem,parseFilterCommand} from './filterOps';
test('filter command accepts only a closed, bounded shape',()=>{
 assert.deepEqual(parseFilterCommand({kind:'custom',column:2,op:'contains',value:'ab'}),{kind:'custom',column:2,op:'contains',value:'ab'});
 assert.deepEqual(parseFilterCommand({kind:'clear',column:0}),{kind:'clear',column:0});
 assert.deepEqual(parseFilterCommand({kind:'off'}),{kind:'off'});assert.deepEqual(parseFilterCommand({kind:'clearAll'}),{kind:'clearAll'});
 for(const bad of [null,[],{},{kind:'fly'},{kind:'off',column:1},{kind:'custom',column:1,op:'regex',value:'a'},{kind:'custom',column:1,op:'=',value:''},{kind:'custom',column:1,op:'=',value:'a\nb'},{kind:'custom',column:1,op:'=',value:'x'.repeat(256)},{kind:'custom',column:-1,op:'=',value:'a'},{kind:'custom',column:16384,op:'=',value:'a'},{kind:'custom',column:1.5,op:'=',value:'a'},{kind:'custom',column:1,op:'=',value:5},{kind:'clear'},{kind:'custom',column:1,op:'=',value:'a',extra:1}])assert.throws(()=>parseFilterCommand(bad),JSON.stringify(bad));
});
test('filter values are bounded text',()=>{assert.equal(filterValueProblem(''),'blank');assert.equal(filterValueProblem('x'.repeat(256)),'long');assert.equal(filterValueProblem('a\u0007'),'chars');assert.equal(filterValueProblem('>=5 *'),null);});
test('value, rank and average filters are validated; distinct values are bounded',()=>{
 assert.deepEqual(parseFilterCommand({kind:'values',column:1,values:['a','a','b'],blanks:false}),{kind:'values',column:1,values:['a','b'],blanks:false});
 assert.deepEqual(parseFilterCommand({kind:'values',column:1,values:[],blanks:true}),{kind:'values',column:1,values:[],blanks:true});
 assert.deepEqual(parseFilterCommand({kind:'top',column:0,count:5,bottom:true,percent:false}),{kind:'top',column:0,count:5,bottom:true,percent:false});
 assert.deepEqual(parseFilterCommand({kind:'aboveAverage',column:0,above:false}),{kind:'aboveAverage',column:0,above:false});
 assert.deepEqual(parseFilterCommand({kind:'color',column:2,row:5,by:'fill'}),{kind:'color',column:2,row:5,by:'fill'});
 for(const bad of [{kind:'color',column:2,row:-1,by:'fill'},{kind:'color',column:2,row:1048576,by:'fill'},{kind:'color',column:2,row:1.5,by:'font'},{kind:'color',column:2,row:1,by:'border'},{kind:'color',column:2,row:1},{kind:'color',column:2,row:1,by:'fill',extra:1}])assert.throws(()=>parseFilterCommand(bad));
 for(const bad of [{kind:'values',column:1,values:[],blanks:false},{kind:'values',column:1,values:[''],blanks:false},{kind:'values',column:1,values:['a']},{kind:'values',column:1,values:Array.from({length:201},(_,i)=>'v'+i),blanks:false},{kind:'top',column:0,count:0,bottom:false,percent:false},{kind:'top',column:0,count:101,bottom:false,percent:true},{kind:'top',column:0,count:1001,bottom:false,percent:false},{kind:'top',column:0,count:2},{kind:'aboveAverage',column:0},{kind:'aboveAverage',column:0,above:true,x:1}])assert.throws(()=>parseFilterCommand(bad),JSON.stringify(bad));
 const cells=[{address:'A2',value:{t:'Text',v:'x'}},{address:'A3',value:{t:'Number',v:2}},{address:'A4',value:{t:'Text',v:'x'}},{address:'A5',value:{t:'Empty'}},{address:'A6',value:{t:'Bool',v:true}},{address:'A7',value:{t:'Error',v:'#N/A'}}].map(c=>({...c,formula:null})) as any;
 assert.deepEqual(distinctValues(cells,6),{values:[{text:'x',count:2},{text:'2',count:1},{text:'TRUE',count:1}],blanks:1,truncated:false});
 const many=Array.from({length:250},(_,i)=>({address:'A'+(i+2),value:{t:'Number',v:i},formula:null})) as any;
 const d=distinctValues(many,250);assert.equal(d.values.length,200);assert.equal(d.truncated,true);
});
