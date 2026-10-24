import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';

test('stage editScale: scales the selected vertices toward their centroid, undo restores',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelect('vertex',[8,9,10,11]);
 st.editScale([0.5,1,0.5]);
 let p=o.geometry.getAttribute('position');
 assert.ok(Math.abs(p.getX(8)- -0.25)<1e-5&&Math.abs(p.getY(8)-0.5)<1e-5&&Math.abs(p.getZ(8)- -0.25)<1e-5);
 st.undo();
 p=o.geometry.getAttribute('position');
 assert.ok(Math.abs(p.getX(8)- -0.5)<1e-5&&Math.abs(p.getZ(8)- -0.5)<1e-5);
});

test('stage editScale: validates selection and factors',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 assert.throws(()=>st.editScale([2,2,2]),/Select vertices to scale/);
 st.editSelect('vertex',[0]);
 assert.throws(()=>st.editScale([1,1,1]),/differ from 1/);
 assert.throws(()=>st.editScale([Number.NaN,1,1]),/finite/);
});

test('stage editScale: position-equal twins scale together, shells never rip',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelect('face',[4,5]);
 st.editDuplicate();
 st.editSelect('vertex',[8,9,10,11]);
 st.editScale([2,1,2]);
 const p=o.geometry.getAttribute('position');
 const keys=new Set<string>();
 for(let v=0;v<p.count;v++)keys.add(`${Math.round(p.getX(v)*1e6)},${Math.round(p.getY(v)*1e6)},${Math.round(p.getZ(v)*1e6)}`);
 assert.equal(p.count,28);
 assert.equal(keys.size,8);
 assert.ok(Math.abs(p.getX(8)- -1)<1e-5&&Math.abs(p.getZ(8)- -1)<1e-5);
});
