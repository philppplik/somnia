import test from 'node:test';
import assert from 'node:assert/strict';
import {cullBatch,cullSetRating,cullSetLabel,cullSetCaption,cullSetFlag,cullSetTags,cullAddTags,undoCull,redoCull,canUndoCull,canRedoCull} from './cullHistory.ts';
import {getRating} from './ratings.ts';
import {getFlag} from './flags.ts';
import {getLabel} from './labels.ts';
import {getTags} from './tags.ts';
import {getCaption} from './captions.ts';
test('cull history: single edits undo and redo',()=>{
 cullSetRating('u1.png',4);
 assert.equal(getRating('u1.png'),4);
 assert.ok(canUndoCull());
 undoCull();
 assert.equal(getRating('u1.png'),0);
 assert.ok(canRedoCull());
 redoCull();
 assert.equal(getRating('u1.png'),4);
 undoCull();
});
test('cull history: a batch is one undo step across targets and fields',()=>{
 cullBatch(()=>{
  for(const n of['u2.png','u3.png']){cullSetRating(n,5);cullSetLabel(n,'red');cullSetFlag(n,'pick');cullSetTags(n,['a']);cullSetCaption(n,'c');}
 });
 undoCull();
 for(const n of['u2.png','u3.png']){assert.equal(getRating(n),0);assert.equal(getLabel(n),null);assert.equal(getFlag(n),null);assert.deepEqual(getTags(n),[]);assert.equal(getCaption(n),'');}
 redoCull();
 for(const n of['u2.png','u3.png']){assert.equal(getRating(n),5);assert.equal(getLabel(n),'red');}
 cullBatch(()=>{for(const n of['u2.png','u3.png']){cullSetRating(n,0);cullSetLabel(n,null);cullSetFlag(n,null);cullSetTags(n,[]);cullSetCaption(n,'');}});
 while(canUndoCull())undoCull(); // drain so later tests start clean
});
test('cull history: caption typing coalesces, addTags records the merge',()=>{
 cullSetCaption('u4.png','La');
 cullSetCaption('u4.png','Lake'); // caption typing inside the window: still one entry
 undoCull();
 assert.equal(getCaption('u4.png'),'');
 cullSetTags('u5.png',['x']);
 cullAddTags('u5.png',['y']);
 assert.deepEqual(getTags('u5.png'),['x','y']);
 undoCull();
 assert.deepEqual(getTags('u5.png'),['x']);
 undoCull();
 assert.deepEqual(getTags('u5.png'),[]);
});
