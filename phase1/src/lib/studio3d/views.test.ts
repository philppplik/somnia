import test from 'node:test';import assert from 'node:assert/strict';
import {viewName,nextViewName,updateView,renameView,viewSlotIndex,MAX_VIEW_NAME,ViewError} from './views';
import type {NamedView} from './model';
const cam=(x:number):Omit<NamedView,'name'>=>({position:[x,0,0],quaternion:[0,0,0,1],target:[0,0,0]});
const views:NamedView[]=[{name:'front',...cam(1)},{name:'top',...cam(2)}];
test('viewName normalizes whitespace and refuses empty or long names',()=>{
 assert.equal(viewName('  hero   shot '),'hero shot');
 assert.throws(()=>viewName('   '),ViewError);
 assert.throws(()=>viewName('x'.repeat(MAX_VIEW_NAME+1)),ViewError);
 assert.equal(viewName('x'.repeat(MAX_VIEW_NAME)),'x'.repeat(MAX_VIEW_NAME));
});
test('nextViewName fills the gap left by a removed bookmark',()=>{
 assert.equal(nextViewName([]),'View 1');
 assert.equal(nextViewName([{name:'View 1',...cam(0)},{name:'View 3',...cam(0)}]),'View 2');
 assert.equal(nextViewName(views),'View 1');
});
test('updateView overwrites the camera in place and refuses unknown names',()=>{
 const next=updateView(views,'top',cam(9));
 assert.deepEqual(next.map(v=>v.name),['front','top']);
 assert.deepEqual(next[1]!.position,[9,0,0]);
 assert.deepEqual(next[0]!.position,[1,0,0]);
 assert.throws(()=>updateView(views,'side',cam(0)),/no saved view/);
});
test('renameView renames and refuses duplicates, unknown sources and empties',()=>{
 assert.deepEqual(renameView(views,'top','hero').map(v=>v.name),['front','hero']);
 assert.deepEqual(renameView(views,'top',' top ').map(v=>v.name),['front','top']);
 assert.throws(()=>renameView(views,'top','front'),/already exists/);
 assert.throws(()=>renameView(views,'side','x'),/no saved view/);
 assert.throws(()=>renameView(views,'top','  '),ViewError);
});
test('viewSlotIndex maps digit and numpad codes to zero-based slots only',()=>{
 assert.equal(viewSlotIndex('Digit1'),0);
 assert.equal(viewSlotIndex('Numpad9'),8);
 assert.equal(viewSlotIndex('Digit0'),null);
 assert.equal(viewSlotIndex('KeyA'),null);
 assert.equal(viewSlotIndex(''),null);
});
