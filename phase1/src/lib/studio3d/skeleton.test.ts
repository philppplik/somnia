import test from 'node:test';import assert from 'node:assert/strict';
import {checkSkins,MAX_SKINS,MAX_BONES,MAX_BONES_PER_SKIN} from './skeleton';
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
