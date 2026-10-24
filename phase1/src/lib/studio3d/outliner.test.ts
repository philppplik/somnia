import test from 'node:test';
import assert from 'node:assert/strict';
import {outlineVisible,type OutlineEntry} from './model';

const row=(id:number,depth:number,kind:OutlineEntry['kind']='mesh'):OutlineEntry=>({id,name:'n'+id,depth,kind,hidden:false,locked:false});
// group 1 with children 2,3 (one nested group 4 with child 5), then sibling 6.
const tree:OutlineEntry[]=[row(1,0,'group'),row(2,1),row(3,1),row(4,1,'group'),row(5,2),row(6,0)];

test('nothing collapsed shows every row',()=>{
 assert.deepEqual(outlineVisible(tree,[]),[true,true,true,true,true,true]);
});
test('a collapsed group hides exactly its subtree',()=>{
 assert.deepEqual(outlineVisible(tree,[1]),[true,false,false,false,false,true]);
});
test('a collapsed nested group hides only its own children',()=>{
 assert.deepEqual(outlineVisible(tree,[4]),[true,true,true,true,false,true]);
 assert.deepEqual(outlineVisible(tree,[1,4]),[true,false,false,false,false,true]);
});
test('unknown and non-group ids in the collapsed list are harmless',()=>{
 assert.deepEqual(outlineVisible(tree,[999,2]),[true,true,true,true,true,true]);
});
