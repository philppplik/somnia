import test from 'node:test';
import assert from 'node:assert/strict';
import {isContextMenuKey,rovingNextIndex} from './rovingKeys';

test('horizontal arrows move and wrap, Home/End jump',()=>{
 assert.equal(rovingNextIndex('ArrowRight',0,3,'horizontal'),1);
 assert.equal(rovingNextIndex('ArrowRight',2,3,'horizontal'),0);
 assert.equal(rovingNextIndex('ArrowLeft',0,3,'horizontal'),2);
 assert.equal(rovingNextIndex('Home',2,3,'horizontal'),0);
 assert.equal(rovingNextIndex('End',0,3,'horizontal'),2);
});
test('vertical widgets ignore horizontal arrows and vice versa',()=>{
 assert.equal(rovingNextIndex('ArrowDown',0,3,'vertical'),1);
 assert.equal(rovingNextIndex('ArrowUp',0,3,'vertical'),2);
 assert.equal(rovingNextIndex('ArrowRight',0,3,'vertical'),null);
 assert.equal(rovingNextIndex('ArrowDown',0,3,'horizontal'),null);
});
test('nothing focused yet: forward starts at the first item, backward at the last',()=>{
 assert.equal(rovingNextIndex('ArrowDown',-1,3,'vertical'),0);
 assert.equal(rovingNextIndex('ArrowUp',-1,3,'vertical'),2);
});
test('empty widget and unrelated keys',()=>{
 assert.equal(rovingNextIndex('ArrowDown',0,0,'vertical'),null);
 assert.equal(rovingNextIndex('a',0,3,'vertical'),null);
});
test('keyboard context menu keys',()=>{
 assert.equal(isContextMenuKey({key:'ContextMenu',shiftKey:false}),true);
 assert.equal(isContextMenuKey({key:'F10',shiftKey:true}),true);
 assert.equal(isContextMenuKey({key:'F10',shiftKey:false}),false);
});
