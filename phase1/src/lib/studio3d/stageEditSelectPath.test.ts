import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';
import {shortestPath} from './editMesh';

test('stage editSelectPath: selects every UV-seam twin along the shortest path and replaces the selection',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelectAll('all','vertex');
 st.editSelectPath(0,10,'vertex');
 assert.deepEqual(st.editSelection().verts,[0,5,10,11,16,17]);
});

test('stage editSelectPath: weights the path by edge length, so a face diagonal beats two border edges',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelectPath(0,23,'vertex');
 const pos=o.geometry.getAttribute('position');
 const spots=[...new Set(st.editSelection().verts.map(v=>[pos.getX(v),pos.getY(v),pos.getZ(v)].map(n=>Math.round(n*100)/100).join(',')))];
 assert.deepEqual(spots,['0.5,0.5,0.5','0.5,-0.5,0.5','-0.5,-0.5,-0.5']);
});

test('stage editSelectPath: edge kind selects the path edges',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelectPath(0,10,'edge');
 assert.deepEqual(st.editSelection().edges,[[10,11],[16,17]]);
});

test('stage editSelectPath: validates equal and missing vertices',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 assert.throws(()=>st.editSelectPath(5,5,'vertex'),/Pick two different vertices/);
 assert.throws(()=>st.editSelectPath(0,999,'vertex'),/does not exist/);
});

test('shortestPath: separate shells have no path',()=>{
 const twoShells={positions:[0,0,0, 1,0,0, 0,1,0, 3,0,0, 4,0,0, 3,1,0],index:[0,1,2, 3,4,5]};
 assert.throws(()=>shortestPath(twoShells,0,5),/No path between the vertices/);
 assert.deepEqual(shortestPath(twoShells,0,2),['0,0,0','0,1000000,0']);
});
