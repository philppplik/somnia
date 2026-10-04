import test from 'node:test';import assert from 'node:assert/strict';
import {planDrop,planIndent,planOutdent,isError} from './layerDrop';
const n=(id:string,tag:string,children:any[]=[])=>({id,tag,children});
const tree=[n('html','html',[n('body','body',[n('a','section',[n('a1','p'),n('a2','p')]),n('b','div'),n('c','h1')])])];
test('before and after resolve the parent and the next sibling',()=>{assert.deepEqual(planDrop(tree,'c','b','before'),{parentId:'body',beforeId:'b'});assert.deepEqual(planDrop(tree,'a','b','after'),{parentId:'body',beforeId:'c'});assert.deepEqual(planDrop(tree,'b','c','after'),{parentId:'body',beforeId:undefined});});
test('dropping after the item that directly follows skips the dragged element',()=>{assert.deepEqual(planDrop(tree,'b','a','after'),{parentId:'body',beforeId:'c'});});
test('inside appends to the target; descendants and roots are refused',()=>{assert.deepEqual(planDrop(tree,'c','a','inside'),{parentId:'a'});assert.ok(isError(planDrop(tree,'a','a1','inside')));assert.ok(isError(planDrop(tree,'body','a','inside')));});
test('indent and outdent',()=>{assert.deepEqual(planIndent(tree,'b'),{parentId:'a'});assert.ok(isError(planIndent(tree,'a')));assert.deepEqual(planOutdent(tree,'a1'),{parentId:'body',beforeId:'b'});assert.ok(isError(planOutdent(tree,'a')));});
