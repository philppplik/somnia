import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';

test('stage snapToGround: drops floating objects until their bounds rest on y=0, undo restores',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.setTransform(o.id,{position:{x:2,y:3,z:-1}});
 assert.equal(st.snapToGround([o.id]),1);
 assert.ok(Math.abs(o.position.y-0.5)<1e-9,'the cube drops by its bounds bottom, not its centre');
 st.undo();
 assert.ok(Math.abs(o.position.y-3)<1e-9);
});

test('stage snapToGround: objects already resting do not move and objects below ground rise',()=>{
 const st=new Stage();
 const a=st.addPrimitive('cube') as import('three').Mesh; // rests at y=0.5 by default
 const b=st.addPrimitive('cube') as import('three').Mesh;
 st.setTransform(b.id,{position:{x:3,y:-2,z:0}});
 const ay=a.position.y;
 assert.equal(st.snapToGround([a.id,b.id]),2);
 assert.equal(a.position.y,ay);
 assert.ok(Math.abs(b.position.y-0.5)<1e-9);
});

test('stage snapToGround: needs existing objects',()=>{
 const st=new Stage();
 st.addPrimitive('cube');
 assert.throws(()=>st.snapToGround([999]),/No object with id 999/);
});
