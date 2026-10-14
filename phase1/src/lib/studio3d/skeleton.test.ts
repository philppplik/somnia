import test from 'node:test';import assert from 'node:assert/strict';
import {checkSkins,bonePickRadius,pickBone,MAX_SKINS,MAX_BONES,MAX_BONES_PER_SKIN} from './skeleton';
test('a file without skins passes with zero counts',()=>{
 assert.deepEqual(checkSkins('a.glb',{}),{skins:0,bones:0});
 assert.deepEqual(checkSkins('a.glb',{skins:[]}),{skins:0,bones:0});
});
test('skins and bones are counted across skins',()=>{
 const j={skins:[{joints:[0,1,2]},{joints:[3,4]}]};
 assert.deepEqual(checkSkins('a.glb',j),{skins:2,bones:5});
});
test('damaged skins are refused',()=>{
 assert.throws(()=>checkSkins('a.glb',{skins:{}}),/damaged skins/);
 assert.throws(()=>checkSkins('a.glb',{skins:[{}]}),/without joints/);
 assert.throws(()=>checkSkins('a.glb',{skins:[{joints:[]}]}),/without joints/);
 assert.throws(()=>checkSkins('a.glb',{skins:[{joints:[0,-1]}]}),/damaged joints/);
});
test('the skin and bone limits hold',()=>{
 assert.throws(()=>checkSkins('a.glb',{skins:Array.from({length:MAX_SKINS+1},()=>({joints:[0]}))}),new RegExp(`at most ${MAX_SKINS}`));
 assert.throws(()=>checkSkins('a.glb',{skins:[{joints:Array.from({length:MAX_BONES_PER_SKIN+1},(_,i)=>i)}]}),new RegExp(`at most ${MAX_BONES_PER_SKIN} per skin`));
 assert.throws(()=>checkSkins('a.glb',{skins:[{joints:Array.from({length:MAX_BONES_PER_SKIN},(_,i)=>i)},{joints:Array.from({length:MAX_BONES_PER_SKIN},(_,i)=>i)},{joints:[0]}]}),new RegExp(`at most ${MAX_BONES} are supported`));
 assert.deepEqual(checkSkins('a.glb',{skins:[{joints:Array.from({length:MAX_BONES_PER_SKIN},(_,i)=>i)}]}).bones,MAX_BONES_PER_SKIN);
});
test('the bone pick radius scales with the model and never vanishes',()=>{
 assert.equal(bonePickRadius(0),0.03);
 assert.equal(bonePickRadius(10),0.4);
});
test('pickBone finds the joint nearest the ray and respects the tolerance',()=>{
 const bones=[{id:1,at:[0,0,-5] as const},{id:2,at:[0,0.05,-5] as const},{id:3,at:[3,0,-5] as const}];
 // Ray along -z passes right through joint 1; joint 2 is closer to the ray origin but 0.05 off axis, so 1 wins.
 assert.equal(pickBone([0,0,0],[0,0,-1],bones,0.2),1);
 // A ray 0.1 to the side still catches joint 1 within tolerance, but not at half the tolerance.
 assert.equal(pickBone([0.1,0,0],[0,0,-1],bones,0.2),1);
 assert.equal(pickBone([0.1,0,0],[0,0,-1],bones,0.05),null);
 // Joints behind the camera never count.
 assert.equal(pickBone([0,0,0],[0,0,1],bones,1),null);
});
test('pickBone prefers the joint under the cursor, then the closer one on a tie',()=>{
 // Distance to the ray decides: joint 1 sits exactly under the cursor, so it beats the nearer joint 2.
 assert.equal(pickBone([0,0,0],[0,0,-1],[{id:1,at:[0,0,-8] as const},{id:2,at:[0,0.05,-2] as const}],0.2),1);
 // Equal distance to the ray: the closer joint along the ray wins.
 assert.equal(pickBone([0,0,0],[0,0,-1],[{id:1,at:[0,0.05,-8] as const},{id:2,at:[0,0.05,-2] as const}],0.2),2);
});
