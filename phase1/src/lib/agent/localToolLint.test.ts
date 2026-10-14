import test from 'node:test';import assert from 'node:assert/strict';
import {lintToolForLocal,selectLocalTools} from './localToolLint';
import type {AgentToolDefinition} from './types';
const tool=(parameters:Record<string,unknown>,name='echo'):AgentToolDefinition=>({name,description:'Read one value',parameters});
test('flat primitives are simple and primitive arrays are ok',()=>{
 assert.equal(lintToolForLocal(tool({type:'object',properties:{text:{type:'string'}},required:['text'],additionalProperties:false})).tier,'simple');
 assert.equal(lintToolForLocal(tool({type:'object',properties:{items:{type:'array',items:{type:'string'}}}})).tier,'ok');
});
test('schema lint marks composition, references, object arrays and size/depth complexity',()=>{
 for(const schema of [{$ref:'#/defs/x'},{oneOf:[]},{type:'array',items:{type:'object'}},{type:'object',properties:Object.fromEntries(Array.from({length:9},(_,i)=>['p'+i,{type:'string'}]))}])assert.equal(lintToolForLocal(tool(schema)).tier,'complex');
 const long=tool({});long.description='x'.repeat(401);assert.equal(lintToolForLocal(long).tier,'complex');
});
test('selection never mutates schemas or reorder grants, caps at eight',()=>{
 const input=Array.from({length:12},(_,i)=>tool({type:'object',properties:{text:{type:'string'}}},'t'+i));const before=JSON.stringify(input);
 const selected=selectLocalTools(input);assert.equal(selected.length,8);assert.equal(selected[0],input[0]);assert.equal(JSON.stringify(input),before);
 assert.deepEqual(selectLocalTools([tool({$ref:'x'})]),[]);
});
test('one nested object is ok, deep nesting is complex',()=>{
 assert.equal(lintToolForLocal(tool({type:'object',properties:{config:{type:'object',properties:{name:{type:'string'}}}}})).tier,'ok');
 assert.equal(lintToolForLocal(tool({type:'object',properties:{a:{type:'object',properties:{b:{type:'object',properties:{c:{type:'string'}}}}}}})).tier,'complex');
});
