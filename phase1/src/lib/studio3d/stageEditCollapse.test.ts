import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage,StageError} from './stage';
import {collapseSelected,EditError,type MeshData} from './editMesh';

test('stage editCollapse: a selected edge merges at its midpoint, one undo step',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelect('edge',[[8,10]]);
 st.editCollapse();
 const idx=[...o.geometry.getIndex()!.array] as number[];
 const pos=[...o.geometry.getAttribute('position').array] as number[];
 assert.equal(idx.length/3,11,'the triangle on the collapsed edge degenerated away');
 assert.equal(pos.length/3,24,'vertex objects stay, the kept one moved');
 assert.deepEqual([pos[24],pos[25],pos[26]],[-0.5,0.5,0],'vertex 8 sits at the edge midpoint');
 assert.deepEqual(st.editSelection(),{verts:[],edges:[],faces:[]},'selection cleared after the rebuild');
 st.undo();
 assert.equal(o.geometry.getIndex()!.array.length/3,12);
 st.redo();
 assert.equal(o.geometry.getIndex()!.array.length/3,11);
});

test('stage editCollapse: separate islands collapse to separate points, guards refuse bad input',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelect('edge',[[8,10],[0,1]]);
 st.editCollapse();
 const idx=[...o.geometry.getIndex()!.array] as number[];
 const pos=[...o.geometry.getAttribute('position').array] as number[];
 assert.equal(idx.length/3,10,'both edges lost their triangle');
 assert.deepEqual([pos[24],pos[25],pos[26]],[-0.5,0.5,0],'first island midpoint');
 assert.deepEqual([pos[0],pos[1],pos[2]],[0.5,0.5,0],'second island midpoint, not merged with the first');
 assert.throws(()=>st.editCollapse(),/Select something to collapse/);
 const st2=new Stage();
 const o2=st2.addPrimitive('cube');
 st2.editStart(o2.id);
 st2.editSelect('vertex',[5]);
 assert.throws(()=>st2.editCollapse(),/Select at least two connected elements to collapse/);
 st2.editEnd();
 assert.throws(()=>st2.editCollapse(),StageError);
});

test('collapseSelected collapses a face to its centroid and validates ids',()=>{
 const m:MeshData={positions:[0,0,0, 2,0,0, 0,2,0, 4,0,0, 4,2,0],index:[0,1,2, 1,3,4],uvs:[0,0, 1,0, 0,1, 1,0, 1,1]};
 const r=collapseSelected(m,{verts:[],edges:[],faces:[0]});
 assert.deepEqual(r.index,[0,3,4],'the collapsed triangle is gone, the other survives, remapped to the kept vertex');
 assert.deepEqual(r.positions.slice(0,3),[2/3,2/3,0],'kept vertex moved to the face centroid');
 assert.equal(r.uvs,m.uvs,'uvs stay with the kept vertices');
 assert.throws(()=>collapseSelected(m,{verts:[9],edges:[],faces:[]}),/Vertex 9 does not exist/);
 assert.throws(()=>collapseSelected(m,{verts:[],edges:[],faces:[7]}),/Face 7 does not exist/);
 assert.throws(()=>collapseSelected(m,{verts:[],edges:[[0,2]],faces:[1]}),/Collapsing the selection would leave an empty mesh/);
 assert.throws(()=>collapseSelected(m,{verts:[],edges:[],faces:[]}),EditError);
});
