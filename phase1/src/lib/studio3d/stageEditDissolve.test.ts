import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage,StageError} from './stage';
import {dissolveFaces,EditError,type MeshData} from './editMesh';

const canon=(idx:readonly number[])=>{const out:string[]=[];for(let i=0;i<idx.length;i+=3){const t=[idx[i],idx[i+1],idx[i+2]];let best='';for(let k=0;k<3;k++){const s=[t[k],t[(k+1)%3],t[(k+2)%3]].join(',');if(!best||s<best)best=s;}out.push(best);}return out.sort();};

test('stage editDissolve: dissolving poked triangles restores the original face, one undo step',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 const m0={positions:[...o.geometry.getAttribute('position').array] as number[],index:[...o.geometry.getIndex()!.array] as number[]};
 st.editStart(o.id);
 st.editSelect('face',[4]);
 st.editPoke();
 assert.equal(o.geometry.getIndex()!.array.length/3,14,'poke added a centroid triangle fan');
 st.editSelectAll('none','face');
 st.editSelect('face',[4,5,6]);
 st.editDissolve();
 const idx=[...o.geometry.getIndex()!.array] as number[];
 const pos=[...o.geometry.getAttribute('position').array] as number[];
 assert.equal(idx.length/3,12,'centroid fan merged back into one face');
 assert.equal(pos.length/3,24,'the interior centroid vertex is gone');
 assert.deepEqual(canon(idx),canon(m0.index),'the triangle set is the original cube again');
 for(let i=0;i<m0.positions.length;i++)assert.ok(Math.abs(pos[i]-m0.positions[i])<1e-5,'positions untouched');
 assert.deepEqual(st.editSelection(),{verts:[],edges:[],faces:[]},'selection cleared after the rebuild');
 st.undo();
 assert.equal(o.geometry.getIndex()!.array.length/3,14,'undo restores the poked mesh');
 st.redo();
 assert.equal(o.geometry.getIndex()!.array.length/3,12);
});

test('stage editDissolve: a quad side becomes a fan and guards refuse bad input',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelect('face',[4,5]);
 st.editDissolve();
 const idx=[...o.geometry.getIndex()!.array] as number[];
 assert.equal(idx.length/3,12,'still twelve triangles');
 assert.deepEqual(idx.slice(-6),[8,10,11,8,11,9],'the quad side is a fan with the other diagonal');
 assert.throws(()=>st.editDissolve(),/Select faces to dissolve/);
 const st2=new Stage();
 const o2=st2.addPrimitive('cube');
 st2.editStart(o2.id);
 st2.editSelectAll('all','face');
 assert.throws(()=>st2.editDissolve(),/Dissolve needs a single simple face region/);
 st2.editEnd();
 assert.throws(()=>st2.editDissolve(),StageError);
});

test('dissolveFaces keeps boundary UVs and vertices shared with unselected faces',()=>{
 // two quads sharing edge 1-2; dissolve the first quad: vertex 2 stays because the second quad uses it
 const m:MeshData={positions:[0,0,0, 1,0,0, 1,1,0, 0,1,0, 2,0,0, 2,1,0],index:[0,1,2, 0,2,3, 1,4,5, 1,5,2],uvs:[0,0, 1,0, 1,1, 0,1, 2,0, 2,1]};
 const r=dissolveFaces(m,[0,1]);
 assert.deepEqual(r.index,[1,4,5, 1,5,2, 0,1,2, 0,2,3],'second quad kept, first rebuilt as a fan');
 assert.equal(r.positions.length/3,6,'no vertex is dropped: every boundary vertex is shared');
 assert.equal(r.uvs!.length,12,'uvs travel with the kept vertices');
 assert.throws(()=>dissolveFaces(m,[]),EditError);
 assert.throws(()=>dissolveFaces(m,[9]),/Face 9 does not exist/);
});
