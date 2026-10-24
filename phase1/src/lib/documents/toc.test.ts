import test from 'node:test';
import assert from 'node:assert/strict';
import {DocumentsCore,type DocSessionLike} from './core';
import {tocProblem} from './protocol';
import {buildTocOptions} from '../../components/documents/InfoDialogs';
test('contents options are checked before the engine',()=>{
 const calls:string[]=[];
 const S=class{constructor(_b?:Uint8Array){}free(){}blocks(){return '[]';}insert_toc(...a:[number,number,string,boolean]){calls.push('i'+a.join('|'));}update_toc(b:number){calls.push('u'+b);}remove_toc(b:number){calls.push('r'+b);}paginate(){return {};}} as unknown as new(b:Uint8Array)=>DocSessionLike;
 const k=new DocumentsCore(S);k.handle({id:1,kind:'open',bytes:new Uint8Array(4)} as never);
 const go=(r:object)=>k.handle({id:2,...r} as never).res.ok;
 for(const bad of [{kind:'insertToc',block:0,levels:0,title:'',pages:true},{kind:'insertToc',block:0,levels:10,title:'',pages:true},{kind:'insertToc',block:0,levels:1.5,title:'',pages:true},{kind:'insertToc',block:0,levels:3,title:'a\nb',pages:true},{kind:'insertToc',block:0,levels:3,title:'x'.repeat(101),pages:true},{kind:'insertToc',block:0,levels:3,title:'',pages:'yes'},{kind:'insertToc',block:-1,levels:3,title:'',pages:true},{kind:'insertToc',block:0.5,levels:3,title:'',pages:true},{kind:'updateToc',block:-1},{kind:'removeToc',block:2**31},{kind:'updateToc'}])go(bad);
 assert.equal(calls.length,0);
 go({kind:'insertToc',block:2,levels:3,title:'Contents',pages:true});go({kind:'updateToc',block:4});go({kind:'removeToc',block:5});
 assert.deepEqual(calls,['i2|3|Contents|true','u4','r5']);
});
test('the contents dialog only offers acceptable options',()=>{
 assert.deepEqual(buildTocOptions('3',' Contents ',true),{levels:3,title:'Contents',pages:true});
 assert.deepEqual(buildTocOptions('9','',false),{levels:9,title:'',pages:false});
 for(const l of ['','0','10','a','1.5','-1'])assert.equal(buildTocOptions(l,'x',true),null,l);
 assert.equal(buildTocOptions('3','x'.repeat(101),true),null);
 assert.notEqual(tocProblem({levels:3,title:'',pages:true,extra:1}),null);
 assert.notEqual(tocProblem(null),null);
});
