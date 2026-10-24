import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nextMenuItemIndex,nextTabIndex} from './tabNav';

test('nextTabIndex: arrows wrap, home/end clamp, others null',()=>{
 assert.equal(nextTabIndex('ArrowRight',1,3),2);
 assert.equal(nextTabIndex('ArrowRight',2,3),0,'wraps past the end');
 assert.equal(nextTabIndex('ArrowLeft',0,3),2,'wraps past the start');
 assert.equal(nextTabIndex('ArrowLeft',2,3),1);
 assert.equal(nextTabIndex('Home',2,3),0);
 assert.equal(nextTabIndex('End',0,3),2);
 assert.equal(nextTabIndex('Enter',1,3),null);
 assert.equal(nextTabIndex('ArrowRight',-1,3),null,'focus outside the tablist');
 assert.equal(nextTabIndex('ArrowRight',0,0),null,'empty tablist');
});
test('nextMenuItemIndex wraps up/down and jumps home/end',()=>{
 assert.equal(nextMenuItemIndex('ArrowDown',0,3),1);
 assert.equal(nextMenuItemIndex('ArrowDown',2,3),0);
 assert.equal(nextMenuItemIndex('ArrowUp',0,3),2);
 assert.equal(nextMenuItemIndex('ArrowUp',2,3),1);
 assert.equal(nextMenuItemIndex('Home',2,3),0);
 assert.equal(nextMenuItemIndex('End',0,3),2);
 assert.equal(nextMenuItemIndex('ArrowLeft',1,3),null);
 assert.equal(nextMenuItemIndex('ArrowDown',-1,3),null);
 assert.equal(nextMenuItemIndex('ArrowDown',0,0),null);
});
