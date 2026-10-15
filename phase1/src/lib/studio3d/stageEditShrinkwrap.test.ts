import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';

const mk=()=>{
 const st=new Stage();
 const a=st.addPrimitive('cube') as import('three').Mesh;
 const b=st.addPrimitive('cube') as import('three').Mesh;
 b.position.set(0,2,0);
 b.scale.set(2,1,2); // wider than A so every corner projects inside the bottom face
 st.editStart(a.id);
 return {st,a,b};
};

test('stage editShrinkwrap: snaps the selected vertices onto the target surface, undo restores',()=>{
 const {st,a,b}=mk();
 st.editSelectAll('all','vertex');
 st.editShrinkwrap(b.id,0);
 const p=a.geometry.getAttribute('position');
 for(let v=0;v<p.count;v++)assert.ok(Math.abs(p.getY(v)-1.0)<1e-4,`v${v} y=${p.getY(v)}`);
 st.undo();
 st.redo();
 const p2=a.geometry.getAttribute('position');
 for(let v=0;v<p2.count;v++)assert.ok(Math.abs(p2.getY(v)-1.0)<1e-4,`v${v} y=${p2.getY(v)}`);
});

test('stage editShrinkwrap: offset follows the target normal',()=>{
 const {st,a,b}=mk();
 st.editSelectAll('all','vertex');
 st.editShrinkwrap(b.id,0.1);
 const p=a.geometry.getAttribute('position');
 for(let v=0;v<p.count;v++)assert.ok(Math.abs(p.getY(v)-0.9)<1e-4,`v${v} y=${p.getY(v)}`);
});

test('stage editShrinkwrap: guards the selection and the target',()=>{
 const {st,a,b}=mk();
 assert.throws(()=>st.editShrinkwrap(a.id,0),/Choose another object as the shrinkwrap target/);
 assert.throws(()=>st.editShrinkwrap(b.id,0),/Select vertices to shrinkwrap/);
});
