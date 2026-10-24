import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage,StageError} from './stage';
import {relaxSelected,EditError,type MeshData} from './editMesh';

test('stage editRelax: one cube side drifts towards its neighbours, undo restores geometry exactly',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 const g=o.geometry;
 st.editStart(o.id);
 st.editSelect('vertex',[0,1,2,3]);
 st.editRelax(1,0.5);
 assert.equal(o.geometry.getIndex()!.count/3,12,'topology untouched');
 const p=o.geometry.getAttribute('position');
 // probed: corner (0.5,0.5,0.5) has four position-keyed neighbours averaging (0,0,0.25), factor 0.5 moves it halfway there
 assert.ok(Math.abs(p.getX(0)-0.25)<1e-5&&Math.abs(p.getY(0)-0.25)<1e-5&&Math.abs(p.getZ(0)-0.375)<1e-5,'corner moved halfway to the neighbour average');
 assert.ok(Math.abs(p.getX(4)+0.5)<1e-5,'unselected corner stays');
 assert.deepEqual(st.editSelection().verts,[0,1,2,3],'selection kept');
 st.undo();
 assert.equal(o.geometry,g,'undo restores the original geometry object');
 st.redo();
 assert.notEqual(o.geometry,g);
});

test('stage editRelax: guards refuse empty selections, bad parameters and unknown ids',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube');
 st.editStart(o.id);
 assert.throws(()=>st.editRelax(1,0.5),/Select vertices to relax/);
 st.editSelect('vertex',[0]);
 assert.throws(()=>st.editRelax(0,0.5),/whole number between 1 and 50/);
 assert.throws(()=>st.editRelax(1,0),/between 0/);
 assert.throws(()=>st.editSelect('vertex',[99]),/does not exist/,'selection itself validates ids');
 st.editEnd();
 assert.throws(()=>st.editRelax(1,0.5),StageError);
});

test('relaxSelected moves only selected groups, pins borders, damps masks and carries UVs',()=>{
 const tet:MeshData={positions:[0,0,0, 1,0,0, 0,1,0, 0,0,1],index:[0,2,1, 0,1,3, 0,3,2, 1,2,3],uvs:[0,0, 1,0, 0,1, .5,.5]};
 const r=relaxSelected(tet,[0],1,0.5);
 const s=1/6;
 assert.ok(Math.abs(r.positions[0]-s)<1e-9&&Math.abs(r.positions[1]-s)<1e-9&&Math.abs(r.positions[2]-s)<1e-9,'selected vertex drifts halfway to the neighbour average');
 assert.deepEqual([r.positions[3],r.positions[4],r.positions[5]],[1,0,0],'unselected stays');
 assert.equal(r.uvs!.length,8,'uvs carried');
 const masked=relaxSelected({...tet,mask:[1,0,0,0]},[0],1,0.5);
 assert.deepEqual([masked.positions[0],masked.positions[1],masked.positions[2]],[0,0,0],'a fully masked group does not move');
 assert.equal(masked.mask!.length,4,'mask carried');
 const quad:MeshData={positions:[0,0,0, 2,0,0, 0,2,0, 2,2,0],index:[0,1,2, 1,3,2]};
 const pinned=relaxSelected(quad,[0,1,2,3],1,0.5);
 assert.deepEqual(pinned.positions,quad.positions,'border groups stay pinned');
 assert.throws(()=>relaxSelected(tet,[],1,0.5),EditError);
 assert.throws(()=>relaxSelected(tet,[99],1,0.5),EditError);
 assert.throws(()=>relaxSelected(tet,[0],51,0.5),EditError);
 assert.throws(()=>relaxSelected(tet,[0],1,1.5),EditError);
});
