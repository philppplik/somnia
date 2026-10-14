import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage,StageError} from './stage';
import {moveSelected,EditError,type MeshData} from './editMesh';

test('stage editMove: the selection translates by the offset, twins glued, one undo step',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 const before=[...o.geometry.getAttribute('position').array] as number[];
 st.editStart(o.id);
 st.editSelect('vertex',[0,1,2,3]);
 st.editMove([0.25,-0.5,1]);
 const pos=[...o.geometry.getAttribute('position').array] as number[];
 for(const v of [0,1,2,3]){
  assert.ok(Math.abs(pos[v*3]-before[v*3]-0.25)<1e-6,`vertex ${v} x`);
  assert.ok(Math.abs(pos[v*3+1]-before[v*3+1]+0.5)<1e-6,`vertex ${v} y`);
  assert.ok(Math.abs(pos[v*3+2]-before[v*3+2]-1)<1e-6,`vertex ${v} z`);
 }
 for(let v=0;v<24;v++){
  if(before[v*3]===0.5)assert.ok(Math.abs(pos[v*3]-before[v*3]-0.25)<1e-6,`position twin ${v} glued and moved`);
  else assert.equal(pos[v*3],before[v*3],`vertex ${v} at another position untouched`);
 }
 assert.equal(o.geometry.getIndex()!.array.length/3,12,'topology untouched');
 assert.deepEqual(st.editSelection().verts,[0,1,2,3],'selection kept');
 st.undo();
 assert.deepEqual([...o.geometry.getAttribute('position').array],before,'undo restores exact positions');
 st.redo();
 assert.ok(Math.abs(o.geometry.getAttribute('position').array[0]-before[0]-0.25)<1e-6);
});

test('stage editMove: guards refuse empty selections and zero offsets',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube');
 st.editStart(o.id);
 assert.throws(()=>st.editMove([1,0,0]),/Select vertices to move/);
 st.editSelect('vertex',[0]);
 assert.throws(()=>st.editMove([0,0,0]),/non-zero vector/);
 st.editEnd();
 assert.throws(()=>st.editMove([1,0,0]),StageError);
});

test('moveSelected keeps seams glued under mixed masks and validates ids',()=>{
 const m:MeshData={positions:[0,0,0, 2,0,0, 2,0,0, 0,2,0],index:[0,1,3, 1,2,3],uvs:[0,0, 1,0, 1,0.5, 0,1],mask:[0,0,0.5,1]};
 const r=moveSelected(m,[0,1,2],[1,1,0]);
 assert.deepEqual(r.positions.slice(3,6),[3,1,0],'unmasked twin moved fully');
 assert.deepEqual(r.positions.slice(6,9),[3,1,0],'masked twin glued to its unmasked counterpart');
 const r2=moveSelected({...m,mask:[0.5,0.5,0.5,1]},[0],[1,1,0]);
 assert.deepEqual(r2.positions.slice(0,3),[0.5,0.5,0],'mask 0.5 everywhere damps to half');
 assert.deepEqual(r.positions.slice(9,12),[0,2,0],'fully masked vertex does not move');
 assert.throws(()=>moveSelected(m,[9],[1,0,0]),/Vertex 9 does not exist/);
 assert.throws(()=>moveSelected(m,[],[1,0,0]),EditError);
 assert.throws(()=>moveSelected(m,[0],[Number.NaN,0,0]),/non-zero vector/);
});
