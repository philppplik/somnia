import test from 'node:test';
import assert from 'node:assert/strict';
import {SAFE_FRAMES,SAFE_FRAME_COLOR} from './safeFrames';

test('safe frames: action safe sits outside title safe, both strictly inside the frame',()=>{
 assert.equal(SAFE_FRAMES.length,2);
 const[action,title]=SAFE_FRAMES;
 assert.ok(action.inset>0&&action.inset<0.5&&title.inset>0&&title.inset<0.5);
 assert.ok(action.inset<title.inset,'title safe is the tighter rectangle');
 assert.equal(action.label,'action');assert.equal(title.label,'title');
});

test('the overlay colour stays a lib-owned hex literal',()=>{
 assert.match(SAFE_FRAME_COLOR,/^#[0-9a-f]{6}$/);
});
