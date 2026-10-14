import test from 'node:test';import assert from 'node:assert/strict';
import {tweenPose,CAMERA_FLY_MS} from './cameraTween';
const a={position:[0,0,10] as [number,number,number],target:[0,0,0] as [number,number,number]};
const b={position:[4,6,0] as [number,number,number],target:[1,2,3] as [number,number,number]};
test('tweenPose hits both endpoints exactly',()=>{
 assert.deepEqual(tweenPose(a,b,0),a);
 assert.deepEqual(tweenPose(a,b,1),b);
});
test('tweenPose interpolates position and target linearly',()=>{
 const mid=tweenPose(a,b,0.5);
 assert.deepEqual(mid.position,[2,3,5]);
 assert.deepEqual(mid.target,[0.5,1,1.5]);
});
test('tweenPose clamps out-of-range progress',()=>{
 assert.deepEqual(tweenPose(a,b,-1),a);
 assert.deepEqual(tweenPose(a,b,2),b);
});
test('the flight duration is short enough to feel instant but visible',()=>{
 assert.ok(CAMERA_FLY_MS>=150&&CAMERA_FLY_MS<=600);
});
