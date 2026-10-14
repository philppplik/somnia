import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage,StageError} from './stage';
import {ripSelected,EditError,type MeshData} from './editMesh';

test('stage editRip: a welded corner splits back apart without moving anything, one undo step',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelect('vertex',[0,8]);
 st.editWeld();
 assert.equal(o.geometry.getIndex()!.array.length/3,12);
 st.editSelect('face',[0]);
 st.editRip();
 const idx=[...o.geometry.getIndex()!.array] as number[];
 const pos=[...o.geometry.getAttribute('position').array] as number[];
 assert.equal(idx.length/3,12,'no triangle lost');
 assert.equal(pos.length/3,27,'the welded vertex and both diagonal ends got copies');
 const mine=new Set([idx[0],idx[1],idx[2]]);
 for(let f=1;f<12;f++)for(let e=0;e<3;e++)assert.ok(!mine.has(idx[f*3+e]),'face 0 shares no vertex with the rest any more');
 assert.deepEqual(st.editSelection().faces,[0],'selection kept');
 st.undo();
 assert.equal(o.geometry.getAttribute('position').array.length/3,24,'undo removes the copies');
 st.redo();
 assert.equal(o.geometry.getAttribute('position').array.length/3,27);
});

test('stage editRip: guards refuse empty and unshared selections',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube');
 st.editStart(o.id);
 assert.throws(()=>st.editRip(),/Select faces to rip/);
 st.editSelect('face',[4,5]);
 assert.throws(()=>st.editRip(),/does not share vertices/,'a cube side is already an index island');
 st.editEnd();
 assert.throws(()=>st.editRip(),StageError);
});

test('ripSelected duplicates shared vertices for the unselected side and carries UVs',()=>{
 const m:MeshData={positions:[0,0,0, 1,0,0, 0,1,0, 1,1,0],index:[0,1,2, 1,3,2],uvs:[0,0, 1,0, 0,1, 1,1]};
 const r=ripSelected(m,[0]);
 assert.deepEqual(r.index,[0,1,2, 4,3,5],'unselected triangle moved to the copies');
 assert.equal(r.positions.length/3,6,'two shared vertices duplicated');
 assert.deepEqual(r.positions.slice(12,15),[1,0,0],'copy of vertex 1 at the same position');
 assert.deepEqual(r.positions.slice(15,18),[0,1,0],'copy of vertex 2 at the same position');
 assert.deepEqual(r.uvs!.slice(8,10),[1,0],'uv copy of vertex 1');
 assert.throws(()=>ripSelected(m,[]),EditError);
 assert.throws(()=>ripSelected(m,[9]),/Face 9 does not exist/);
 assert.throws(()=>ripSelected({positions:[0,0,0, 1,0,0, 0,1,0, 2,0,0, 3,0,0, 2,1,0],index:[0,1,2, 3,4,5]},[0]),/does not share vertices/);
});
