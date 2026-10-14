import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage,StageError} from './stage';
import {fattenSelected,EditError,type MeshData} from './editMesh';

test('stage editFatten: one cube side pushes out along the averaged corner normals, undo restores geometry exactly',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 const g=o.geometry;
 st.editStart(o.id);
 st.editSelect('vertex',[0,1,2,3]);
 st.editFatten(0.25);
 assert.equal(o.geometry.getIndex()!.count/3,12,'topology untouched');
 const d=0.25/Math.sqrt(3);
 const p=o.geometry.getAttribute('position');
 assert.ok(Math.abs(p.getX(0)-(0.5+d))<1e-5&&Math.abs(p.getY(0)-(0.5+d))<1e-5&&Math.abs(p.getZ(0)-(0.5+d))<1e-5,'corner moves along the twin-averaged diagonal normal');
 assert.deepEqual(st.editSelection().verts,[0,1,2,3],'selection kept');
 st.undo();
 assert.equal(o.geometry,g,'undo restores the original geometry object');
 st.redo();
 assert.notEqual(o.geometry,g);
});

test('stage editFatten: guards refuse empty selections, zero amounts and unknown ids',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube');
 st.editStart(o.id);
 assert.throws(()=>st.editFatten(0.25),/Select vertices to shrink or fatten/);
 st.editSelect('vertex',[0]);
 assert.throws(()=>st.editFatten(0),/non-zero/);
 assert.throws(()=>st.editSelect('vertex',[99]),/does not exist/,'selection itself validates ids');
 st.editEnd();
 assert.throws(()=>st.editFatten(0.25),StageError);
});

test('fattenSelected moves only the selected positions, damped by masks, carrying UVs and masks',()=>{
 const m:MeshData={positions:[0,0,0, 2,0,0, 0,2,0, 2,2,0],index:[0,1,2, 1,3,2],uvs:[0,0, 1,0, 0,1, 1,1]};
 const r=fattenSelected(m,[0],0.5);
 assert.deepEqual([r.positions[0],r.positions[1],r.positions[2]],[0,0,0.5],'planar corner pushes along +Z');
 assert.deepEqual([r.positions[3],r.positions[4],r.positions[5]],[2,0,0],'unselected stays');
 assert.equal(r.index.length,6,'topology untouched');
 assert.equal(r.uvs!.length,8,'uvs carried');
 const masked=fattenSelected({...m,mask:[1,0,0,0]},[0],0.5);
 assert.deepEqual([masked.positions[0],masked.positions[1],masked.positions[2]],[0,0,0],'a fully masked vertex does not move');
 assert.equal(masked.mask!.length,4,'mask carried');
 const twins=fattenSelected({positions:[0,0,0, 0,0,0, 2,0,0, 0,2,0],index:[0,2,3, 1,2,3]},[0],1);
 assert.equal(twins.positions[2],1,'twin one moves');
 assert.equal(twins.positions[5],1,'its position-equal twin moves with it');
 assert.throws(()=>fattenSelected(m,[],0.5),EditError);
 assert.throws(()=>fattenSelected(m,[0],0),EditError);
 assert.throws(()=>fattenSelected(m,[99],0.5),EditError);
});
