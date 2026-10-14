import test from 'node:test';import assert from 'node:assert/strict';
import {advance,clampTime,checkClip,checkSpeed,startTime,formatClock,AnimationError} from './animation';
test('advance moves time by speed and wraps when looping',()=>{
 assert.deepEqual(advance(0.5,0.25,2,true,2),{time:1,ended:false});
 const w=advance(1.8,0.5,2,true,1);assert.ok(Math.abs(w.time-0.3)<1e-9);assert.equal(w.ended,false);
});
test('advance stops at the end without looping and never goes backwards',()=>{
 assert.deepEqual(advance(1.9,0.5,2,false,1),{time:2,ended:true});
 assert.equal(advance(1,-5,2,false,1).time,1);
 assert.deepEqual(advance(0,1,0,true,1),{time:0,ended:true});
});
test('clampTime and startTime',()=>{
 assert.equal(clampTime(-1,3),0);assert.equal(clampTime(9,3),3);assert.equal(clampTime(Number.NaN,3),0);assert.equal(clampTime(1,0),0);
 assert.equal(startTime(3,3,false),0);assert.equal(startTime(3,3,true),3);assert.equal(startTime(1,3,false),1);
});
test('checkClip and checkSpeed validate input',()=>{
 const clips=[{name:'a',duration:1},{name:'b',duration:2}];
 assert.equal(checkClip(1,clips),1);
 assert.throws(()=>checkClip(2,clips),AnimationError);assert.throws(()=>checkClip(0.5,clips),AnimationError);assert.throws(()=>checkClip(0,[]),/no animation/);
 assert.equal(checkSpeed(0.5),0.5);assert.throws(()=>checkSpeed(0),AnimationError);assert.throws(()=>checkSpeed(5),AnimationError);assert.throws(()=>checkSpeed(Number.NaN),AnimationError);
});
test('formatClock shows minutes and hundredths',()=>{assert.equal(formatClock(0),'0:00.00');assert.equal(formatClock(65.5),'1:05.50');assert.equal(formatClock(-3),'0:00.00');});
