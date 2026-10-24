import test from 'node:test';import assert from 'node:assert/strict';
import {solveTwoBone,rotateAxis,clampEuler,checkLimits,hasLimits,IkError,UNLIMITED,fabrikSolve,aimBasis} from './ik';
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

test('FABRIK: reachable target is hit and every segment length is kept',()=>{
 const joints:[number,number,number][]=[[0,0,0],[0,1,0],[0,2,0],[0,3,0],[0,4,0]];
 const out=fabrikSolve(joints,[1,1,1,1],[1.5,2.5,0.5]);
 const end=out[out.length-1];
 assert.ok(Math.hypot(end[0]-1.5,end[1]-2.5,end[2]-0.5)<1e-3,'end reached');
 for(let i=0;i<4;i++)assert.ok(Math.abs(Math.hypot(out[i+1][0]-out[i][0],out[i+1][1]-out[i][1],out[i+1][2]-out[i][2])-1)<1e-6,`segment ${i} length`);
 assert.deepEqual(out[0],[0,0,0],'root pinned');
});
test('FABRIK: unreachable target stretches the chain straight at it',()=>{
 const out=fabrikSolve([[0,0,0],[0,1,0],[0,2,0],[0,3,0]],[1,1,1],[10,0,0]);
 assert.ok(Math.abs(out[3][0]-3)<1e-9&&Math.abs(out[3][1])<1e-9,'full reach toward the target');
});
test('FABRIK: bounds and degenerate input refuse',()=>{
 assert.throws(()=>fabrikSolve([[0,0,0]],[1],[1,0,0]),IkError);
 assert.throws(()=>fabrikSolve([[0,0,0],[1,0,0]],[1,1],[1,0,0]),IkError);
 assert.throws(()=>fabrikSolve([[0,0,0],[1,0,0]],[0],[1,0,0]),IkError);
});
test('aimBasis: +Y aims at the direction, up resolves roll, degenerate up gets a fallback',()=>{
 const[x,y,z]=aimBasis([1,0,0],[0,0,1]);
 assert.ok(Math.abs(y[0]-1)<1e-9,'y is the aim');
 assert.ok(Math.abs(z[0]*0+z[1]*0+z[2]+1)<1e-9,'up resolves the roll on the -Z side');
 assert.ok(Math.abs(x[1]-1)<1e-9,'x is perpendicular to both');
 // Right-handed: x = y cross z.
 const det=[y[1]*z[2]-y[2]*z[1],y[2]*z[0]-y[0]*z[2],y[0]*z[1]-y[1]*z[0]];
 assert.ok(Math.abs(det[0]-x[0])<1e-9&&Math.abs(det[1]-x[1])<1e-9&&Math.abs(det[2]-x[2])<1e-9,'right-handed');
 const[d]=aimBasis([0,1,0],[0,1,0]);
 assert.ok(Math.hypot(d[0],d[1],d[2])>0.9,'fallback axis picked');
 assert.throws(()=>aimBasis([0,0,0],[0,0,1]),IkError);
});
