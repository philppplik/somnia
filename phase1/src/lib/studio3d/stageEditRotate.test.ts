import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';

test('stage editRotate: rotates the selected vertices around their centroid on a world axis, undo restores',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelect('vertex',[8,9,10,11]);
 st.editRotate('y',90);
 let p=o.geometry.getAttribute('position');
 assert.ok(Math.abs(p.getX(8)- -0.5)<1e-5&&Math.abs(p.getY(8)-0.5)<1e-5&&Math.abs(p.getZ(8)-0.5)<1e-5);
 st.undo();
 p=o.geometry.getAttribute('position');
 assert.ok(Math.abs(p.getX(8)- -0.5)<1e-5&&Math.abs(p.getZ(8)- -0.5)<1e-5);
 st.editSelect('vertex',[8,9,10,11]);
 st.editRotate('x',90);
 p=o.geometry.getAttribute('position');
 assert.ok(Math.abs(p.getY(8)-1)<1e-5&&Math.abs(p.getZ(8))<1e-5);
});

test('stage editRotate: validates selection, axis and degrees',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 assert.throws(()=>st.editRotate('y',90),/Select vertices to rotate/);
 st.editSelect('vertex',[0]);
 assert.throws(()=>st.editRotate('q' as 'x',90),/axis must be x, y or z/);
 assert.throws(()=>st.editRotate('y',0),/non-zero/);
 assert.throws(()=>st.editRotate('y',Number.NaN),/non-zero/);
});

test('stage editRotate: position-equal twins rotate together, shells never rip',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelect('face',[4,5]);
 st.editDuplicate();
 st.editSelect('vertex',[8,9,10,11]);
 st.editRotate('y',90);
 const p=o.geometry.getAttribute('position');
 const keys=new Set<string>();
 for(let v=0;v<p.count;v++)keys.add(`${Math.round(p.getX(v)*1e6)},${Math.round(p.getY(v)*1e6)},${Math.round(p.getZ(v)*1e6)}`);
 assert.equal(p.count,28);
 assert.equal(keys.size,8);
});
