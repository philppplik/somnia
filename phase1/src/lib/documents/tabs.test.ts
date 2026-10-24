import test from 'node:test';
import assert from 'node:assert/strict';
import {checkParaPatch,tabsProblem} from './protocol';
import {buildTabs,parseTabPos} from '../../components/documents/InfoDialogs';
const ok={pos:72,align:'left',leader:'none'};
test('tab stop validation',()=>{
 assert.equal(tabsProblem([]),null);assert.equal(tabsProblem([ok,{pos:200,align:'right',leader:'dot'}]),null);
 for(const bad of ['x',[{...ok,pos:-1}],[{...ok,pos:1441}],[{...ok,pos:NaN}],[{...ok,align:'clear'}],[{...ok,leader:'wavy'}],[{...ok,extra:1}],[ok,{...ok,pos:72.2}],[null],Array.from({length:21},(_,i)=>({...ok,pos:i*10}))])assert.notEqual(tabsProblem(bad),null,JSON.stringify(bad));
 assert.doesNotThrow(()=>checkParaPatch({tabs:[ok]}));assert.throws(()=>checkParaPatch({tabs:[{pos:-5,align:'left',leader:'none'}]}));
});
test('tab dialog rows',()=>{
 assert.equal(parseTabPos('72,5'),72.5);assert.equal(parseTabPos(''),null);assert.equal(parseTabPos('1441'),null);
 assert.deepEqual(buildTabs([{pos:'72',align:'left',leader:'none'}]),[ok]);
 assert.equal(buildTabs([{pos:'',align:'left',leader:'none'}]),null);
 assert.equal(buildTabs([{pos:'72',align:'left',leader:'none'},{pos:'72',align:'right',leader:'dot'}]),null);
});
