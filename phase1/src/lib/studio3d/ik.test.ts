import test from 'node:test';import assert from 'node:assert/strict';
import {solveTwoBone,rotateAxis,clampEuler,checkLimits,hasLimits,IkError,UNLIMITED} from './ik';
const near=(a:readonly[number,number,number],b:readonly[number,number,number],eps=1e-6)=>{for(let i=0;i<3;i++)assert.ok(Math.abs(a[i]-b[i])<eps,`[${a}] vs [${b}]`);};
const dist=(a:readonly[number,number,number],b:readonly[number,number,number])=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
test('a reachable target is hit and both segment lengths are kept',()=>{
 const s=solveTwoBone([0,0,0],1,1,[1.2,0.8,0],[0,0,1]);
 near(s.end,[1.2,0.8,0],1e-4);
 assert.ok(Math.abs(dist([0,0,0],s.mid)-1)<1e-6);
 assert.ok(Math.abs(dist(s.mid,s.end)-1)<1e-6);
});
test('the pole picks the bend side',()=>{
 const up=solveTwoBone([0,0,0],1,1,[1.5,0,0],[0,1,0]);
 const down=solveTwoBone([0,0,0],1,1,[1.5,0,0],[0,-1,0]);
 assert.ok(up.mid[1]>0,'elbow up');assert.ok(down.mid[1]<0,'elbow down');
});
test('targets beyond reach and inside the fold clamp to the annulus',()=>{
 const far=solveTwoBone([0,0,0],1,1,[5,0,0],[0,0,1]);
 assert.ok(dist([0,0,0],far.end)<2&&dist([0,0,0],far.end)>1.9);
 assert.ok(Math.abs(dist([0,0,0],far.mid)-1)<1e-4);
 const close=solveTwoBone([0,0,0],1,0.5,[0.1,0,0],[0,0,1]);
 assert.ok(dist([0,0,0],close.end)>=0.5);
});
test('a target on the root and zero lengths refuse',()=>{
 assert.throws(()=>solveTwoBone([0,0,0],1,1,[0,0,0],[0,0,1]),IkError);
 assert.throws(()=>solveTwoBone([0,0,0],0,1,[1,0,0],[0,0,1]),IkError);
});
test('rotateAxis: 90 degrees around Y maps +X to -Z',()=>{
 const r=rotateAxis([1,0,0],[0,1,0],Math.PI/2);
 near(r,[0,0,-1],1e-9);
});
test('limits: NaN sides are open, min above max refuses, clamp honours both sides',()=>{
 assert.deepEqual(checkLimits([Number.NaN,0,0],[Number.NaN,1,1]).max,[Number.NaN,1,1]);
 assert.throws(()=>checkLimits([2,0,0],[1,1,1]),IkError);
 assert.throws(()=>checkLimits([8,0,0],[9,1,1]),IkError);
 assert.deepEqual(clampEuler([5,-5,0.2],{min:[-1,-1,Number.NaN],max:[1,1,Number.NaN]}),[1,-1,0.2]);
 assert.deepEqual(clampEuler([5,5,5],UNLIMITED),[5,5,5]);
 assert.equal(hasLimits(UNLIMITED),false);
 assert.equal(hasLimits({min:[0,Number.NaN,Number.NaN],max:UNLIMITED.max}),true);
});
