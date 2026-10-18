import test from 'node:test';
import assert from 'node:assert/strict';
import {distinctValues,filterValueProblem,groupDisplayLabels,parseFilterCommand,plainRows} from './filterOps';
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
 assert.deepEqual(parseFilterCommand({kind:'range',column:1,from:45000.5,to:45200}),{kind:'range',column:1,from:45000.5,to:45200});
 for(const bad of [{kind:'range',column:1,from:5,to:5},{kind:'range',column:1,from:5,to:2},{kind:'range',column:1,from:2},{kind:'range',column:1,from:'2',to:5},{kind:'range',column:1,from:Number.NaN,to:5},{kind:'range',column:1,from:2,to:Number.POSITIVE_INFINITY},{kind:'range',column:1,from:2,to:5,extra:1}])assert.throws(()=>parseFilterCommand(bad),JSON.stringify(bad));
 for(const bad of [{kind:'values',column:1,values:[],blanks:false},{kind:'values',column:1,values:[''],blanks:false},{kind:'values',column:1,values:['a']},{kind:'values',column:1,values:Array.from({length:201},(_,i)=>'v'+i),blanks:false},{kind:'top',column:0,count:0,bottom:false,percent:false},{kind:'top',column:0,count:101,bottom:false,percent:true},{kind:'top',column:0,count:1001,bottom:false,percent:false},{kind:'top',column:0,count:2},{kind:'aboveAverage',column:0},{kind:'aboveAverage',column:0,above:true,x:1}])assert.throws(()=>parseFilterCommand(bad),JSON.stringify(bad));
 const cells=[{address:'A2',value:{t:'Text',v:'x'}},{address:'A3',value:{t:'Number',v:2}},{address:'A4',value:{t:'Text',v:'x'}},{address:'A5',value:{t:'Empty'}},{address:'A6',value:{t:'Bool',v:true}},{address:'A7',value:{t:'Error',v:'#N/A'}}].map(c=>({...c,formula:null})) as any;
 assert.deepEqual(distinctValues(cells,6),{values:[{text:'x',count:2},{text:'2',count:1},{text:'TRUE',count:1}],blanks:1,truncated:false});
 const many=Array.from({length:250},(_,i)=>({address:'A'+(i+2),value:{t:'Number',v:i},formula:null})) as any;
 const d=distinctValues(many,250);assert.equal(d.values.length,200);assert.equal(d.truncated,true);
});

test('groupDisplayLabels merges identities sharing a display text and sums counts',()=>{
 const data={values:[{text:'45700.5',count:2},{text:'45700.8',count:3},{text:'45710',count:1}],blanks:0,truncated:false};
 const textByValue=new Map([['45700.5','15.01.2025'],['45700.8','15.01.2025'],['45710','25.01.2025']]);
 const rows=groupDisplayLabels(data,textByValue);
 assert.ok(rows);assert.equal(rows.length,2);
 assert.deepEqual(rows[0],{key:'15.01.2025',label:'15.01.2025',count:5,values:['45700.5','45700.8']},'times of one day merge, counts sum, commonest first');
 assert.deepEqual(rows[1].values,['45710']);
});

test('groupDisplayLabels refuses a mixed column instead of guessing labels',()=>{
 const data={values:[{text:'45700',count:2},{text:'hello',count:1}],blanks:0,truncated:false};
 assert.equal(groupDisplayLabels(data,new Map([['45700','15.01.2025']])),null,'a text value has no display label');
 assert.equal(groupDisplayLabels(data,new Map()),null);
});

test('plainRows pass identity through as label and single-value payload',()=>{
 const data={values:[{text:'abc',count:4},{text:'7',count:2}],blanks:1,truncated:false};
 assert.deepEqual(plainRows(data),[{key:'abc',label:'abc',count:4,values:['abc']},{key:'7',label:'7',count:2,values:['7']}]);
});
