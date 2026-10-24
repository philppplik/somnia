import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage,StageError} from './stage';
import {toSphereSelected,EditError,type MeshData} from './editMesh';

const C=[-1/6,0.5,-1/6];
const dist=(pos:number[],v:number)=>Math.hypot(pos[v*3]-C[0],pos[v*3+1]-C[1],pos[v*3+2]-C[2]);

test('stage editToSphere: a grown corner selection lands exactly on the mean-radius sphere, one undo step',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 const before=[...o.geometry.getAttribute('position').array] as number[];
 st.editStart(o.id);
 st.editSelect('vertex',[8]);
 st.editSelectGrow(1,false,'vertex');
 assert.deepEqual(st.editSelection().verts,[8,9,10],'one grown ring around the corner');
 st.editToSphere(1);
 const pos=[...o.geometry.getAttribute('position').array] as number[];
 const mean=(Math.hypot(-1/3,0,-1/3)+2*Math.hypot(2/3,0,-1/3))/3;
 for(const v of [8,9,10])assert.ok(Math.abs(dist(pos,v)-mean)<1e-4,`vertex ${v} on the sphere`);
 assert.equal(o.geometry.getIndex()!.array.length/3,12,'topology untouched');
 assert.deepEqual(st.editSelection().verts,[8,9,10],'selection kept');
 st.undo();
 assert.deepEqual([...o.geometry.getAttribute('position').array],before,'undo restores exact positions');
 st.redo();
 const pos2=[...o.geometry.getAttribute('position').array] as number[];
 assert.ok(Math.abs(dist(pos2,8)-mean)<1e-4);
});

test('stage editToSphere: factor 0.5 lerps halfway and guards refuse bad input',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelect('vertex',[8]);
 st.editSelectGrow(1,false,'vertex');
 st.editToSphere(0.5);
 const pos=[...o.geometry.getAttribute('position').array] as number[];
 assert.ok(Math.abs(dist(pos,8)-0.562722)<1e-3,'closest vertex moved halfway out');
 assert.ok(Math.abs(dist(pos,9)-0.699698)<1e-3,'farther vertices moved halfway in');
 assert.throws(()=>st.editToSphere(0),/non-zero number/);
 st.editSelectAll('none','vertex');
 assert.throws(()=>st.editToSphere(1),/Select vertices to pull onto a sphere/);
 st.editEnd();
 assert.throws(()=>st.editToSphere(1),StageError);
});

test('toSphereSelected moves position-equal twins together and needs two distinct positions',()=>{
 // two triangles sharing one position via twins 1 and 2 (a UV seam)
 const m:MeshData={positions:[0,0,0, 2,0,0, 2,0,0, 0,2,0, 4,2,0],index:[0,1,3, 2,4,3],uvs:[0,0, 1,0, 1,0.5, 0,1, 1,1]};
 const r=toSphereSelected(m,[0,1,3],1);
 assert.deepEqual(r.positions[3],r.positions[6],'twin x stays glued');
 assert.deepEqual(r.positions[4],r.positions[7],'twin y stays glued');
 assert.deepEqual(r.positions[5],r.positions[8],'twin z stays glued');
 assert.throws(()=>toSphereSelected(m,[1,2],1),/at least two distinct positions/,'one position is no sphere');
 assert.throws(()=>toSphereSelected(m,[],1),EditError);
 assert.throws(()=>toSphereSelected(m,[99],1),/Vertex 99 does not exist/);
});
