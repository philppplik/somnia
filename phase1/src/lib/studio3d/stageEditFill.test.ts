import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage,StageError} from './stage';
import {fillSelected,EditError,type MeshData} from './editMesh';

test('stage editFill: a deleted quad side gets a centroid fan with outward winding, one undo step',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelect('face',[4,5]);
 st.editDelete('face');
 assert.equal(o.geometry.getIndex()!.array.length/3,10,'the quad side is gone');
 st.editSelect('edge',[[8,10],[8,9],[10,11],[9,11]]);
 st.editFill();
 const idx=[...o.geometry.getIndex()!.array] as number[];
 const pos=[...o.geometry.getAttribute('position').array] as number[];
 assert.equal(idx.length/3,14,'four fan triangles close the hole');
 assert.equal(pos.length/3,25,'one centroid vertex');
 assert.deepEqual(pos.slice(-3),[0,0.5,0],'centroid sits in the middle of the deleted side');
 const a=idx[idx.length-12],b=idx[idx.length-11],c=idx[idx.length-10];
 const ux=pos[b*3]-pos[a*3],uy=pos[b*3+1]-pos[a*3+1],uz=pos[b*3+2]-pos[a*3+2];
 const vx=pos[c*3]-pos[a*3],vy=pos[c*3+1]-pos[a*3+1],vz=pos[c*3+2]-pos[a*3+2];
 const ny=uz*vx-ux*vz;
 assert.ok(ny>0,'the cap winds outwards even though the deleted side shared no vertices with its neighbours');
 assert.equal(st.editSelection().edges.length,4,'selection kept');
 st.undo();
 assert.equal(o.geometry.getIndex()!.array.length/3,10,'undo reopens the hole');
 st.redo();
 assert.equal(o.geometry.getIndex()!.array.length/3,14);
});

test('stage editFill: guards refuse empty, open and multi-loop selections',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube');
 st.editStart(o.id);
 assert.throws(()=>st.editFill(),/Select an edge loop to fill/);
 st.editSelect('edge',[[8,10],[8,9]]);
 assert.throws(()=>st.editFill(),/Select one closed edge loop to fill/);
 st.editSelectAll('none','edge');
 st.editSelect('edge',[[8,10],[10,9],[9,8],[0,1],[1,2],[2,3]]);
 assert.throws(()=>st.editFill(),/Select one closed edge loop to fill/,'two loops at once are refused');
 st.editEnd();
 assert.throws(()=>st.editFill(),StageError);
});

test('fillSelected fans a detached loop and validates edge ids',()=>{
 const m:MeshData={positions:[0,0,0, 1,0,0, 1,1,0, 0,1,0],index:[],uvs:[0,0, 1,0, 1,1, 0,1]};
 const r=fillSelected(m,[[0,1],[1,2],[2,3],[3,0]]);
 assert.deepEqual(r.index,[3,2,4, 2,1,4, 1,0,4, 0,3,4],'no neighbouring faces: default winding');
 assert.deepEqual(r.positions.slice(-3),[0.5,0.5,0],'centroid inserted');
 assert.deepEqual(r.uvs!.slice(-2),[0.5,0.5],'uv centroid interpolated');
 assert.throws(()=>fillSelected(m,[[0,99]]),/Edge 0-99 does not exist/);
 assert.throws(()=>fillSelected(m,[]),EditError);
});
