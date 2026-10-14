import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage,StageError} from './stage';
import {flipFaces,EditError,type MeshData} from './editMesh';

test('stage editFlip: only the selected triangles reverse, undo restores geometry exactly',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 const g=o.geometry;
 const before=[...o.geometry.getIndex()!.array];
 st.editStart(o.id);
 st.editSelect('face',[4]);
 st.editFlip();
 const idx=[...o.geometry.getIndex()!.array];
 assert.equal(idx.length/3,12,'topology untouched');
 assert.deepEqual([idx[12],idx[13],idx[14]],[before[12],before[14],before[13]],'triangle 4 reversed');
 assert.deepEqual([idx[15],idx[16],idx[17]],[before[15],before[16],before[17]],'triangle 5 untouched');
 assert.deepEqual(st.editSelection().faces,[4],'selection kept');
 st.undo();
 assert.equal(o.geometry,g,'undo restores the original geometry object');
 st.redo();
 assert.deepEqual([...o.geometry.getIndex()!.array].slice(12,15),[before[12],before[14],before[13]]);
});

test('stage editFlip: guards refuse empty selections and unknown ids',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube');
 st.editStart(o.id);
 assert.throws(()=>st.editFlip(),/Select faces to flip/);
 assert.throws(()=>st.editSelect('face',[99]),/does not exist/,'selection itself validates ids');
 st.editEnd();
 assert.throws(()=>st.editFlip(),StageError);
});

test('flipFaces reverses winding in place and carries positions, UVs and masks',()=>{
 const m:MeshData={positions:[0,0,0, 2,0,0, 0,2,0, 2,2,0],index:[0,1,2, 1,3,2],uvs:[0,0, 1,0, 0,1, 1,1],mask:[1,0,0,0]};
 const r=flipFaces(m,[1]);
 assert.deepEqual(r.index,[0,1,2, 1,2,3],'second triangle reversed');
 assert.deepEqual(r.positions,m.positions,'positions untouched');
 assert.equal(r.uvs!.length,8,'uvs carried');
 assert.equal(r.mask!.length,4,'mask carried');
 const twice=flipFaces(flipFaces(m,[0,1]),[0,1]);
 assert.deepEqual(twice.index,m.index,'flipping twice restores the winding');
 assert.throws(()=>flipFaces(m,[]),EditError);
 assert.throws(()=>flipFaces(m,[2]),EditError);
 assert.throws(()=>flipFaces(m,[-1]),EditError);
});
