import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';

test('stage moveCenterTo: combined centre lands on the target, relative offsets kept',()=>{
 const st=new Stage();
 const a=st.addPrimitive('cube');
 const b=st.addPrimitive('cube');
 st.setTransform(b.id,{position:{x:2,y:0.5,z:0}});
 assert.equal(st.moveCenterTo([a.id,b.id],[4,2,-2]),2);
 const pa=a.getWorldPosition(a.position.clone().set(0,0,0));
 assert.deepEqual([a.position.x,a.position.y,a.position.z],[3,2,-2],'a moved by the same delta');
 assert.deepEqual([b.position.x,b.position.y,b.position.z],[5,2,-2],'b kept its +2 x offset');
 void pa;
 st.undo();
 assert.deepEqual([a.position.x,a.position.y,a.position.z],[0,0.5,0],'one undo restores a');
 assert.deepEqual([b.position.x,b.position.y,b.position.z],[2,0.5,0],'one undo restores b');
});

test('stage moveCenterTo: no-op at the current centre, target validated',()=>{
 const st=new Stage();
 const a=st.addPrimitive('cube');
 assert.equal(st.moveCenterTo([a.id],[0,0.5,0]),0,'already centred');
 assert.throws(()=>st.moveCenterTo([a.id],[0,Number.NaN,0]),/three numbers/);
});

test('stage moveCenterTo: skips the centre computation cost when nothing selected',()=>{
 const st=new Stage();
 st.addPrimitive('cube');
 assert.throws(()=>st.moveCenterTo([],[0,0,0]),/Select at least 1/);
});
