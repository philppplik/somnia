import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';

test('stage editShear: offsets along one axis by the position on another, undo restores',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelectAll('all','vertex');
 st.editShear('x','y',1);
 let p=o.geometry.getAttribute('position');
 assert.ok(Math.abs(p.getX(8)-0)<1e-5&&Math.abs(p.getY(8)-0.5)<1e-5);
 assert.ok(Math.abs(p.getX(0)-1)<1e-5);
 st.undo();
 p=o.geometry.getAttribute('position');
 assert.ok(Math.abs(p.getX(8)- -0.5)<1e-5&&Math.abs(p.getX(0)-0.5)<1e-5);
});

test('stage editShear: validates selection, axes and factor',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 assert.throws(()=>st.editShear('x','y',1),/Select vertices to shear/);
 st.editSelect('vertex',[0]);
 assert.throws(()=>st.editShear('x','x',1),/must differ/);
 assert.throws(()=>st.editShear('x','y',0),/non-zero/);
 assert.throws(()=>st.editShear('q' as 'x','y',1),/must be x, y or z/);
});

test('stage editShear: position-equal twins shear together, shells never rip',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelect('face',[4,5]);
 st.editDuplicate();
 st.editSelectAll('all','vertex');
 st.editShear('x','y',1);
 const p=o.geometry.getAttribute('position');
 const keys=new Set<string>();
 for(let v=0;v<p.count;v++)keys.add(`${Math.round(p.getX(v)*1e6)},${Math.round(p.getY(v)*1e6)},${Math.round(p.getZ(v)*1e6)}`);
 assert.equal(p.count,28);
 assert.equal(keys.size,8);
});
