import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage,StageError} from './stage';
import {weldSelected,EditError,type MeshData} from './editMesh';

test('stage editWeld: merging one cube side drops its two triangles, undo restores geometry exactly',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 const g=o.geometry;
 st.editStart(o.id);
 st.editSelect('vertex',[0,1,2,3]);
 st.editWeld();
 assert.equal(o.geometry.getIndex()!.count/3,10,'the welded side collapses to a point and its triangles drop');
 assert.notEqual(o.geometry,g,'geometry swapped');
 const p=o.geometry.getAttribute('position');
 assert.deepEqual([p.getX(0),p.getY(0),p.getZ(0)],[0.5,0,0],'surviving vertex sits at the centroid');
 assert.deepEqual(st.editSelection(),{verts:[],edges:[],faces:[]},'selection cleared after weld');
 st.undo();
 assert.equal(o.geometry,g,'undo restores the original geometry object');
 assert.equal(o.geometry.getIndex()!.count/3,12);
 st.redo();
 assert.equal(o.geometry.getIndex()!.count/3,10);
});

test('stage editWeld: guards refuse thin selections, unknown ids and a full collapse',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube');
 st.editStart(o.id);
 assert.throws(()=>st.editWeld(),/Select at least two vertices/);
 st.editSelect('vertex',[0]);
 assert.throws(()=>st.editWeld(),/Select at least two vertices/);
 assert.throws(()=>st.editSelect('vertex',[0,99]),/does not exist/,'selection itself validates ids');
 st.editSelectAll('all','vertex');
 assert.throws(()=>st.editWeld(),/empty mesh/);
 st.editEnd();
 assert.throws(()=>st.editWeld(),StageError);
});

test('weldSelected remaps indices, moves the survivor to the centroid, keeps UVs and drops masks',()=>{
 const m:MeshData={positions:[0,0,0, 2,0,0, 2,2,0, 0,2,0, 5,5,5],index:[0,1,2, 0,2,3, 1,4,2],uvs:[0,0, 1,0, 1,1, 0,1, .5,.5],mask:[1,1,1,1,1]};
 const r=weldSelected(m,[1,2]);
 assert.deepEqual(r.index,[0,1,3],'degenerate triangles drop, others remap to the lowest selected index');
 assert.deepEqual([r.positions[3],r.positions[4],r.positions[5]],[2,1,0],'survivor moved to the centroid');
 assert.equal(r.positions[0],0,'unselected positions untouched');
 assert.equal(r.uvs!.length,10,'uvs stay aligned with untouched positions');
 assert.equal(r.mask,undefined,'mask dropped by topology change');
 assert.throws(()=>weldSelected(m,[]),EditError);
 assert.throws(()=>weldSelected(m,[3]),EditError);
 assert.throws(()=>weldSelected(m,[2,2]),/at least two/);
 assert.throws(()=>weldSelected(m,[0,99]),EditError);
 assert.throws(()=>weldSelected(m,[0,1,2,3,4]),/empty mesh/);
});
