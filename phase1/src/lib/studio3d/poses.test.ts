import test from 'node:test';import assert from 'node:assert/strict';
import {checkPoseName,mirrorBoneName,mirrorPose,blendPoses,slerpQ,PoseError,MAX_POSE_NAME} from './poses';import type {Pose,PoseBone} from './poses';
const B=(p:[number,number,number],q:[number,number,number,number]=[0,0,0,1],s:[number,number,number]=[1,1,1]):PoseBone=>({p,q,s});
test('pose names: trimmed, required, bounded, unique',()=>{
 assert.equal(checkPoseName('  Wave  ',[]),'Wave');
 assert.throws(()=>checkPoseName('   ',[]),PoseError);
 assert.throws(()=>checkPoseName('x'.repeat(MAX_POSE_NAME+1),[]),PoseError);
 assert.throws(()=>checkPoseName('Wave',['Wave']),/already is a pose/);
});
test('mirror pairing by name across the common conventions',()=>{
 assert.equal(mirrorBoneName('UpperArm.L'),'UpperArm.R');
 assert.equal(mirrorBoneName('UpperArm.R'),'UpperArm.L');
 assert.equal(mirrorBoneName('hand_l'),'hand_r');
 assert.equal(mirrorBoneName('mixamorig:LeftArm'),'mixamorig:RightArm');
 assert.equal(mirrorBoneName('right hand'),'left hand');
 assert.equal(mirrorBoneName('RIGHTLEG'),'LEFTLEG');
 assert.equal(mirrorBoneName('Spine'),null);
 assert.equal(mirrorBoneName('Head'),null);
});
test('mirrorPose swaps L/R pairs and keeps unpaired bones',()=>{
 const pose:Pose={name:'a',bones:{'Arm.L':B([1,0,0]),'Arm.R':B([2,0,0]),Spine:B([9,9,9])}};
 const m=mirrorPose(pose);
 assert.equal(m.bones['Arm.L'].p[0],2);
 assert.equal(m.bones['Arm.R'].p[0],1);
 assert.deepEqual(m.bones['Spine'].p,[9,9,9]);
});
test('slerp: halfway between identity and a 90-degree turn is 45 degrees',()=>{
 const half=slerpQ([0,0,0,1],[0,0,Math.SQRT1_2,Math.SQRT1_2],0.5);
 const angle=2*Math.acos(half[3]);
 assert.ok(Math.abs(angle-Math.PI/4)<1e-6,`angle ${angle}`);
 // Opposite hemisphere still takes the short way.
 const neg=slerpQ([0,0,0,1],[0,0,-Math.SQRT1_2,-Math.SQRT1_2],0.5);
 assert.ok(Math.abs(2*Math.acos(Math.abs(neg[3]))-Math.PI/4)<1e-6);
});
test('blendPoses: t clamps, endpoints are the inputs, unpaired bones pass through',()=>{
 const a:Pose={name:'a',bones:{X:B([0,0,0]),Only:B([1,1,1])}};
 const b:Pose={name:'b',bones:{X:B([10,0,0],[0,0,Math.SQRT1_2,Math.SQRT1_2])}};
 assert.deepEqual(blendPoses(a,b,-1).bones['X'].p,[0,0,0]);
 assert.deepEqual(blendPoses(a,b,2).bones['X'].p,[10,0,0]);
 const mid=blendPoses(a,b,0.5);
 assert.equal(mid.bones['X'].p[0],5);
 assert.deepEqual(mid.bones['Only'].p,[1,1,1]);
 assert.equal(blendPoses(a,b,Number.NaN).bones['X'].p[0],0);
});
