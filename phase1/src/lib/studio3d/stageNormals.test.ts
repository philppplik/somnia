import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';
import {flipMesh,outsideMesh,smoothMesh} from './editMesh';

const tetra=()=>({positions:[1,1,1, 1,-1,-1, -1,1,-1, -1,-1,1],index:[0,1,2, 0,3,1, 0,2,3, 1,3,2]}); // outward winding (positive signed volume)
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

test('flipMesh reverses the winding and negates explicit normals',()=>{
 const m={...tetra(),normals:[0,0,1, 0,1,0, 1,0,0, 0.5,0.5,0]};
 const out=flipMesh(m);
 assert.ok(Math.abs(volume(out.positions,out.index)+volume(m.positions,m.index))<1e-12,'volume sign inverts');
 assert.equal(out.normals![2],-1);
 assert.equal(out.normals![4],-1);
 assert.equal(out.positions.length,m.positions.length);
});

test('outsideMesh flips inside-out closed parts and keeps correct ones',()=>{
 const bad=tetra();for(let f=0;f<bad.index.length;f+=3){const t=bad.index[f+1];bad.index[f+1]=bad.index[f+2];bad.index[f+2]=t;}
 const r=outsideMesh(bad);
 assert.equal(r.flipped,1);
 assert.ok(volume(r.mesh.positions,r.mesh.index)>0);
 assert.equal(outsideMesh(tetra()).flipped,0);
});

test('smoothMesh splits everything at angle 0 (flat) and merges per vertex at 180 (smooth)',()=>{
 const m=tetra();
 const flat=smoothMesh(m,0);
 assert.equal(flat.positions.length/3,m.index.length,'every face corner its own vertex');
 assert.ok(flat.normals);
 const smooth=smoothMesh(m,180);
 assert.equal(smooth.positions.length/3,4,'corners merged back per vertex');
 assert.ok(smooth.normals);
 // smoothed tetra vertex normals point away from the centroid (origin here)
 for(let i=0;i<4;i++){
  const d:number=smooth.positions[i*3]*smooth.normals![i*3]+smooth.positions[i*3+1]*smooth.normals![i*3+1]+smooth.positions[i*3+2]*smooth.normals![i*3+2];
  assert.ok(d>0,`vertex ${i} normal points outward`);
 }
});

test('stage normals smooth blends across UV seams and keeps the seam UVs',()=>{
 const st=new Stage();
 const c=st.addPrimitive('cube');
 st.cleanup(0.0001,[c.id]); // 20 verts: 4 welded doubles, UV-seam twins stay (step 65's guard)
 st.normalsOp('smooth',30,[c.id]);
 const pos=c.geometry.getAttribute('position'),no=c.geometry.getAttribute('normal'),uv=c.geometry.getAttribute('uv');
 assert.equal(pos.count,20,'twins stay split for their UVs, only the normals blend');
 assert.equal(uv.count,20,'UVs preserved');
 assert.ok(no);
 const s=1/Math.sqrt(3);
 for(let i=0;i<no.count;i++){
  for(const v of [no.getX(i),no.getY(i),no.getZ(i)])assert.ok(Math.abs(Math.abs(v)-s)<1e-3,`corner normal ${i} fully smoothed diagonal`);
 }
});

test('stage normals angle restores hard edges on a welded cube',()=>{
 const st=new Stage();
 const c=st.addPrimitive('cube');
 st.cleanup(0.0001,[c.id]); // welds the 4 true position+UV doubles; UV-seam twins stay (step 65's guard)
 assert.equal(c.geometry.getAttribute('position').count,20);
 st.normalsOp('angle',30,[c.id]);
 const pos=c.geometry.getAttribute('position'),no=c.geometry.getAttribute('normal');
 assert.equal(pos.count,24,'each face corner split back out');
 assert.ok(no);
 for(let i=0;i<no.count;i++){
  const x=Math.abs(no.getX(i)),y=Math.abs(no.getY(i)),z=Math.abs(no.getZ(i));
  assert.ok(Math.max(x,y,z)===1&&x+y+z===1,`normal ${i} axis-aligned (face normal)`);
 }
});

test('stage normals batch: one undo step, exact restore, flip keeps the shading style',()=>{
 const st=new Stage();
 const a=st.addPrimitive('cube');const b=st.addPrimitive('sphere');
 const ga=a.geometry,gb=b.geometry;
 const entries=st.historyLabels().undo.length;
 assert.equal(st.normalsOp('flat',0,[a.id,b.id]),2);
 assert.equal(st.historyLabels().undo.length,entries+1,'one undo entry for the whole batch');
 assert.deepEqual(st.undoLabel,{key:'studio3d.hist.normals',params:{count:2,name:a.name}});
 st.undo();
 assert.equal(a.geometry,ga);assert.equal(b.geometry,gb,'undo restores both geometry objects');
 st.redo();
 st.normalsOp('flip',30,[a.id]); // after flat: faceted normals must survive, just negated
 assert.equal(a.geometry.getAttribute('normal').count,24,'flat split survived the flip');
 assert.equal(a.geometry.getIndex()!.count,36);
});

test('stage normals validates targets, mode and angle',()=>{
 const st=new Stage();
 const light=st.addLight('point');
 assert.throws(()=>st.normalsOp('smooth',180,[light.id]),/not a mesh/);
 const cube=st.addPrimitive('cube');
 st.editStart(cube.id);
 assert.throws(()=>st.normalsOp('smooth',180,[cube.id]),/edit mode/);
 st.editEnd();
 assert.throws(()=>st.normalsOp('angle',190,[cube.id]),/between 0 and 180/);
 assert.throws(()=>st.normalsOp('angle',Number.NaN,[cube.id]),/between 0 and 180/);
});
