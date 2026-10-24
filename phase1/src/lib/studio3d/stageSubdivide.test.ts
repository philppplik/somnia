import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';
import {subdivideLoop} from './editMesh';

// Closed tetrahedron: every edge is shared by exactly two triangles.
const tetra=()=>({positions:[1,1,1, 1,-1,-1, -1,1,-1, -1,-1,1],index:[0,2,1, 0,1,3, 0,3,2, 1,2,3]});
// Open square of two triangles: the four outer edges are boundaries, the diagonal is interior.
const square=()=>({positions:[0,0,0, 1,0,0, 1,1,0, 0,1,0],index:[0,1,2, 0,2,3]});

test('subdivideLoop splits every triangle into four and keeps a closed mesh closed',()=>{
 const out=subdivideLoop(tetra(),1);
 assert.equal(out.index.length,tetra().index.length*4);
 const edges=new Map<string,number>();
 for(let f=0;f<out.index.length;f+=3){
  const a=out.index[f],b=out.index[f+1],c=out.index[f+2];
  for(const [x,y] of [[a,b],[b,c],[c,a]]){const k=x<y?`${x}_${y}`:`${y}_${x}`;edges.set(k,(edges.get(k)??0)+1);}
 }
 for(const c of edges.values())assert.equal(c,2,'every edge shared by exactly two triangles');
});

test('subdivideLoop smooths interior vertices and moves boundary vertices only along the boundary',()=>{
 const out=subdivideLoop(tetra(),1);
 const v0=[out.positions[0],out.positions[1],out.positions[2]];
 assert.notDeepEqual(v0,[1,1,1],'tetra corner is pulled towards its neighbours');
 const sq=subdivideLoop(square(),1);
 // corner 0 has boundary neighbours 1 and 3: 3/4*(0,0,0) + 1/8*((1,0,0)+(0,1,0))
 assert.ok(Math.abs(sq.positions[0]-0.125)<1e-12&&Math.abs(sq.positions[1]-0.125)<1e-12&&Math.abs(sq.positions[2])<1e-12,'boundary corner slides along the outline');
 // the midpoint of the straight boundary edge 0-1 stays exactly on that edge
 let found=false;
 for(let i=4;i<sq.positions.length/3;i++){
  const x=sq.positions[i*3],y=sq.positions[i*3+1],z=sq.positions[i*3+2];
  if(Math.abs(x-0.5)<1e-12&&Math.abs(y)<1e-12&&Math.abs(z)<1e-12)found=true;
 }
 assert.ok(found,'boundary edge midpoint stays on the straight edge');
 // everything stays in the boundary plane z=0
 for(let i=2;i<sq.positions.length;i+=3)assert.ok(Math.abs(sq.positions[i])<1e-12);
});

test('subdivideLoop iterations multiply triangles and validate the range',()=>{
 assert.equal(subdivideLoop(tetra(),2).index.length,tetra().index.length*16);
 assert.equal(subdivideLoop(tetra(),3).index.length,tetra().index.length*64);
 assert.throws(()=>subdivideLoop(tetra(),4),/between 1 and 3/);
 assert.throws(()=>subdivideLoop(tetra(),1.5),/between 1 and 3/);
 assert.throws(()=>subdivideLoop(tetra(),0),/between 1 and 3/);
});

test('stage subdivide bakes all meshes in one undo step and restores them exactly',()=>{
 const st=new Stage();
 const a=st.addPrimitive('cube');const b=st.addPrimitive('sphere');
 const ga=a.geometry,gb=b.geometry;const ta=ga.getIndex()!.count;
 const entries=st.historyLabels().undo.length;
 const n=st.subdivide(1,[a.id,b.id]);
 assert.equal(n,2);
 assert.equal(st.historyLabels().undo.length,entries+1,'one undo entry for the whole batch');
 assert.deepEqual(st.undoLabel,{key:'studio3d.hist.subdivide',params:{count:2,name:a.name}});
 assert.equal(a.geometry.getIndex()!.count,ta*4,'triangles quadrupled');
 assert.equal(a.userData.somniaPrimitive,undefined,'primitive params cleared');
 st.undo();
 assert.equal(a.geometry,ga);assert.equal(b.geometry,gb,'undo restores both geometry objects');
 assert.ok(a.userData.somniaPrimitive,'primitive params restored');
 st.redo();
 assert.equal(a.geometry.getIndex()!.count,ta*4);
});

test('stage subdivide validates targets, mode and iterations',()=>{
 const st=new Stage();
 const light=st.addLight('point');
 assert.throws(()=>st.subdivide(1,[light.id]),/not a mesh/);
 const cube=st.addPrimitive('cube');
 st.editStart(cube.id);
 assert.throws(()=>st.subdivide(1,[cube.id]),/edit mode/);
 st.editEnd();
 assert.throws(()=>st.subdivide(0,[cube.id]),/between 1 and 3/);
 assert.throws(()=>st.subdivide(2.5,[cube.id]),/between 1 and 3/);
});
