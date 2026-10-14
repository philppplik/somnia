import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';
import {cleanupMesh} from './editMesh';

const volume=(positions:number[],index:number[])=>{
 let v=0;
 for(let f=0;f<index.length;f+=3){
  const a=index[f]*3,b=index[f+1]*3,c=index[f+2]*3;
  v+=positions[a]*(positions[b+1]*positions[c+2]-positions[b+2]*positions[c+1])
   +positions[a+1]*(positions[b+2]*positions[c]-positions[b]*positions[c+2])
   +positions[a+2]*(positions[b]*positions[c+1]-positions[b+1]*positions[c]);
 }
 return v/6;
};
const tetra=()=>({positions:[1,1,1, 1,-1,-1, -1,1,-1, -1,-1,1],index:[0,2,1, 0,1,3, 0,3,2, 1,2,3]});

test('cleanupMesh welds exact doubles and drops their duplicate faces',()=>{
 // the same triangle twice, as separate vertices (what merging two identical meshes produces)
 const m={positions:[0,0,0, 1,0,0, 0,1,0, 0,0,0, 1,0,0, 0,1,0],index:[0,1,2, 3,4,5]};
 const r=cleanupMesh(m,0.0001);
 assert.equal(r.welded,3);
 assert.equal(r.facesDropped,1,'duplicate face removed');
 assert.equal(r.vertsDropped,3);
 assert.equal(r.mesh.positions.length/3,3);
 assert.equal(r.mesh.index.length,3);
});

test('cleanupMesh keeps same-position vertices with different UVs (UV seams survive)',()=>{
 // two triangles sharing a positional edge, but the shared positions carry different UVs
 const m={positions:[0,0,0, 1,0,0, 0,1,0, 0,0,0, 1,0,0, 1,1,0],index:[0,1,2, 3,4,5],
  uvs:[0,0, 1,0, 0,1, 0.5,0.5, 1,0.5, 1,1]};
 const r=cleanupMesh(m,0.0001);
 assert.equal(r.welded,0,'no welding across a UV seam');
 assert.equal(r.mesh.positions.length/3,6);
 assert.ok(r.mesh.uvs);
});

test('cleanupMesh removes collapsed faces and unreferenced vertices',()=>{
 // a degenerate face (repeated corner) and a stray vertex
 const m={positions:[0,0,0, 1,0,0, 0,1,0, 5,5,5],index:[0,1,2, 0,0,1]};
 const r=cleanupMesh(m,0);
 assert.equal(r.welded,0,'weld 0 skips welding');
 assert.equal(r.facesDropped,1);
 assert.equal(r.vertsDropped,1,'stray vertex removed');
 assert.equal(r.mesh.positions.length/3,3);
 assert.equal(r.mesh.index.length,3);
});

test('cleanupMesh unifies winding across a shared edge and never volume-flips open parts',()=>{
 // two adjacent triangles, the second wound inconsistently (shared edge run the same way)
 const m={positions:[0,0,0, 1,0,0, 0,1,0, 1,1,0],index:[0,1,2, 2,1,3]};
 const before=volume(m.positions,m.index);
 const r=cleanupMesh(m,0);
 // after the fix the shared edge 1-2 is traversed in opposite directions by the two faces
 const runs=(f:number[],u:number,v:number)=>{for(let e=0;e<3;e++)if(f[e]===u&&f[(e+1)%3]===v)return true;return false;};
 const f0=r.mesh.index.slice(0,3),f1=r.mesh.index.slice(3,6);
 assert.notEqual(runs(f0,1,2),runs(f1,1,2),'shared edge traversed opposite ways');
 assert.equal(Math.sign(volume(r.mesh.positions,r.mesh.index)),Math.sign(before),'open part keeps its overall orientation');
 assert.equal(r.flipped,0);
});

test('cleanupMesh flips closed inside-out parts outward',()=>{
 const good=tetra();
 const bad=tetra();for(let f=0;f<bad.index.length;f+=3){const t=bad.index[f+1];bad.index[f+1]=bad.index[f+2];bad.index[f+2]=t;}
 assert.ok(volume(good.positions,good.index)*volume(bad.positions,bad.index)<0,'opposite orientations');
 const r1=cleanupMesh(good,0),r2=cleanupMesh(bad,0);
 assert.ok(volume(r1.mesh.positions,r1.mesh.index)>0);
 assert.ok(volume(r2.mesh.positions,r2.mesh.index)>0);
 assert.equal(r1.flipped+r2.flipped,1,'exactly one of the two needed a flip');
});

test('stage cleanup bakes all meshes in one undo step, returns totals and restores exactly',()=>{
 const st=new Stage();
 const a=st.addPrimitive('cube');const b=st.addPrimitive('sphere');
 const ga=a.geometry,gb=b.geometry;
 const entries=st.historyLabels().undo.length;
 const total=st.cleanup(0.0001,[a.id,b.id]);
 // three's box grid carries 4 real position+UV doubles and the sphere grid 2 unreferenced vertices; nothing is collapsed or flipped.
 assert.deepEqual(total,{welded:4,facesDropped:0,vertsDropped:6,flipped:0},'only true doubles and stray vertices are touched');
 assert.equal(a.geometry.getIndex()!.count,36,'all cube faces survive');
 assert.equal(st.historyLabels().undo.length,entries+1);
 assert.deepEqual(st.undoLabel,{key:'studio3d.hist.cleanup',params:{count:2,name:a.name}});
 assert.equal(a.userData.somniaPrimitive,undefined);
 st.undo();
 assert.equal(a.geometry,ga);assert.equal(b.geometry,gb);
 assert.ok(a.userData.somniaPrimitive);
 st.redo();
 assert.equal(a.userData.somniaPrimitive,undefined);
});

test('stage cleanup with weld 0 changes nothing on a clean primitive',()=>{
 const st=new Stage();
 const cube=st.addPrimitive('cube');
 const v0=cube.geometry.getAttribute('position').count;
 const total=st.cleanup(0,[cube.id]);
 assert.deepEqual(total,{welded:0,facesDropped:0,vertsDropped:0,flipped:0});
 assert.equal(cube.geometry.getAttribute('position').count,v0);
});

test('stage cleanup validates targets, mode and distance',()=>{
 const st=new Stage();
 const light=st.addLight('point');
 assert.throws(()=>st.cleanup(0.0001,[light.id]),/not a mesh/);
 const cube=st.addPrimitive('cube');
 st.editStart(cube.id);
 assert.throws(()=>st.cleanup(0.0001,[cube.id]),/edit mode/);
 st.editEnd();
 assert.throws(()=>st.cleanup(-1,[cube.id]),/weld distance/);
 assert.throws(()=>st.cleanup(Number.NaN,[cube.id]),/finite|weld distance/);
});
