import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';

test('stage moveEachTo: every origin lands on the target',()=>{
 const st=new Stage();
 const a=st.addPrimitive('cube');
 const b=st.addPrimitive('cube');
 st.setTransform(b.id,{position:{x:2,y:0.5,z:-1}});
 assert.equal(st.moveEachTo([a.id,b.id],[3,1,2]),2);
 assert.deepEqual([a.position.x,a.position.y,a.position.z],[3,1,2],'a on the target');
 assert.deepEqual([b.position.x,b.position.y,b.position.z],[3,1,2],'b on the same target');
 st.undo();
 assert.deepEqual([a.position.x,a.position.y,a.position.z],[0,0.5,0],'one undo restores a');
 assert.deepEqual([b.position.x,b.position.y,b.position.z],[2,0.5,-1],'one undo restores b');
});

test('stage moveEachTo: target and selection validated',()=>{
 const st=new Stage();
 const a=st.addPrimitive('cube');
 assert.throws(()=>st.moveEachTo([a.id],[0,0,Infinity]),/three numbers/);
 assert.throws(()=>st.moveEachTo([],[0,0,0]),/Select at least 1/);
});
