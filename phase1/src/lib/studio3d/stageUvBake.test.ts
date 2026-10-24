import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';
import {bisectClip,mirrorCombine,symmetrizeMesh,subdivideLoop} from './editMesh';

// Square on both sides of the x=0 plane with a simple 0..1 UV layout.
const uvSquare=()=>({positions:[-1,0,0, 1,0,0, 1,2,0, -1,2,0],index:[0,1,2, 0,2,3],uvs:[0,0, 1,0, 1,1, 0,1]});
// One triangle on the +x side with distinctive UVs.
const uvTri=()=>({positions:[1,0,0, 2,0,0, 1,1,0],index:[0,1,2],uvs:[0.1,0.2, 0.3,0.4, 0.5,0.6]});

test('bisectClip interpolates UVs at the cut with the same t as the position',()=>{
 const out=bisectClip(uvSquare(),'x');
 assert.ok(out.uvs,'uvs carried');
 assert.equal(out.uvs!.length,out.positions.length/3*2,'one uv pair per vertex');
 // cut points on edges 0-1 and 2-3 sit at t=0.5: uv (0.5,0) and (0.5,1)
 const pairs=out.uvs!.reduce((acc:number[][],_,i)=>{if(i%2===0)acc.push([out.uvs![i],out.uvs![i+1]]);return acc;},[]);
 assert.ok(pairs.some(([u,v])=>Math.abs(u-0.5)<1e-9&&Math.abs(v)<1e-9),'cut uv on the lower edge');
 assert.ok(pairs.some(([u,v])=>Math.abs(u-0.5)<1e-9&&Math.abs(v-1)<1e-9),'cut uv on the upper edge');
});

test('mirrorCombine gives the mirrored twin the source UVs',()=>{
 const out=mirrorCombine(uvTri(),'x',0);
 assert.ok(out.uvs);
 assert.equal(out.positions.length/3,6,'original plus mirror');
 assert.deepEqual(out.uvs!.slice(6),[0.1,0.2,0.3,0.4,0.5,0.6],'mirrored vertices reuse the source UVs');
 assert.deepEqual(out.uvs!.slice(0,6),[0.1,0.2,0.3,0.4,0.5,0.6]);
});

test('symmetrizeMesh keeps UVs through the flip helper as well',()=>{
 const neg=uvTri();for(let i=0;i<neg.positions.length;i+=3)neg.positions[i]=-neg.positions[i]; // same triangle on -x
 for(const side of ['positive','negative'] as const){
  const out=symmetrizeMesh(side==='positive'?uvTri():neg,'x',side,0);
  assert.ok(out.uvs,side);
  assert.equal(out.uvs!.length,out.positions.length/3*2);
 }
});

test('subdivideLoop smooths UVs with the position weights',()=>{
 const sq={positions:[0,0,0, 1,0,0, 1,1,0, 0,1,0],index:[0,1,2, 0,2,3],uvs:[0,0, 1,0, 1,1, 0,1]};
 const out=subdivideLoop(sq,1);
 assert.ok(out.uvs);
 assert.equal(out.uvs!.length,out.positions.length/3*2);
 // boundary corner 0: 3/4*(0,0) + 1/8*((1,0)+(0,1)) = (0.125,0.125)
 assert.ok(Math.abs(out.uvs![0]-0.125)<1e-12&&Math.abs(out.uvs![1]-0.125)<1e-12,'corner uv follows the boundary rule');
 // boundary midpoint of edge 0-1 lands at uv (0.5,0)
 let found=false;
 for(let i=4;i<out.uvs!.length/2;i++)if(Math.abs(out.uvs![i*2]-0.5)<1e-12&&Math.abs(out.uvs![i*2+1])<1e-12)found=true;
 assert.ok(found,'boundary edge midpoint uv averaged');
});

test('stage subdivide and symmetrize keep the uv attribute and undo restores the original geometry',()=>{
 const st=new Stage();
 const s=st.addPrimitive('sphere');
 assert.ok(s.geometry.getAttribute('uv'),'primitive has uvs');
 const g0=s.geometry;
 st.subdivide(1,[s.id]);
 const uv1=s.geometry.getAttribute('uv');
 assert.ok(uv1,'uv attribute survives subdivide');
 assert.equal(uv1.count,s.geometry.getAttribute('position').count,'one uv per vertex');
 st.undo();
 assert.equal(s.geometry,g0,'undo restores the exact original geometry');
 const c=st.addPrimitive('cube');
 st.symmetrize('x','positive',0.001,[c.id]);
 const uv2=c.geometry.getAttribute('uv');
 assert.ok(uv2,'uv attribute survives symmetrize');
 assert.equal(uv2.count,c.geometry.getAttribute('position').count);
});

test('stage mirror modifier keeps UVs on the combined preview mesh',()=>{
 const st=new Stage();
 const c=st.addPrimitive('cube');
 st.mirrorMod(c.id,'x',0.001,true);
 const uv=c.geometry.getAttribute('uv');
 assert.ok(uv,'combined preview keeps uvs');
 assert.equal(uv.count,c.geometry.getAttribute('position').count);
 st.mirrorMod(c.id,'x',0.001,false);
 assert.ok(c.geometry.getAttribute('uv'),'base geometry back after turning the modifier off');
});
