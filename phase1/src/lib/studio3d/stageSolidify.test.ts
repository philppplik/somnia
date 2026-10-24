import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';
import {solidifyMesh,separateMesh,faceNormal} from './editMesh';

const quad=()=>({positions:[0,0,0, 1,0,0, 1,0,1, 0,0,1],index:[0,2,1, 0,3,2],uvs:[0,0, 1,0, 1,1, 0,1]}); // xz-plane, normal +y
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

test('solidifyMesh closes an open plane into a shell with outward walls and exact volume',()=>{
 const out=solidifyMesh(quad(),0.2,0);
 assert.equal(out.positions.length/3,8);
 assert.equal(out.index.length/3,12,'2 outer + 2 inner + 8 wall triangles');
 assert.ok(Math.abs(volume(out.positions,out.index)-0.2)<1e-9,'signed volume of the slab');
 assert.equal(separateMesh(out).length,1,'one connected shell');
 for(let f=4;f<12;f++){
  const n=faceNormal(out,f);
  const cx=(out.positions[out.index[f*3]*3]+out.positions[out.index[f*3+1]*3]+out.positions[out.index[f*3+2]*3])/3-0.5;
  const cz=(out.positions[out.index[f*3]*3+2]+out.positions[out.index[f*3+1]*3+2]+out.positions[out.index[f*3+2]*3+2])/3-0.5;
  assert.ok(n[0]*cx+n[2]*cz>0,`wall ${f} points outward`);
 }
 assert.equal(out.uvs!.length,16,'UVs carried to both skins');
});

test('solidifyMesh honors the offset: -1 keeps the original skin in place, 1 the inner',()=>{
 const inside=solidifyMesh(quad(),0.2,-1);
 assert.equal(inside.positions[1],0,'original stays');
 assert.ok(Math.abs(inside.positions[4*3+1]+0.2)<1e-12,'copy sinks');
 const outside=solidifyMesh(quad(),0.2,1);
 assert.ok(Math.abs(outside.positions[1]-0.2)<1e-12,'original rises');
 assert.equal(outside.positions[4*3+1],0,'copy stays');
 assert.throws(()=>solidifyMesh(quad(),0,0),/positive number/);
 assert.throws(()=>solidifyMesh(quad(),0.2,2),/between -1 and 1/);
});

test('solidifyMesh on a closed cube makes nested shells and the inner one faces the cavity',()=>{
 const st=new Stage();
 const c=st.addPrimitive('cube');
 const d=(st as unknown as {meshDataOf:(m:typeof c)=>Parameters<typeof solidifyMesh>[0]}).meshDataOf(c);
 const out=solidifyMesh(d,0.1,-1);
 const parts=separateMesh(out);
 assert.equal(parts.length,2,'outer and inner shells, seams do not rip');
 const vols=parts.map(p=>volume(p.positions,p.index)).sort((a,b)=>b-a);
 assert.ok(vols[0]>0.9,'outer shell outward');
 assert.ok(vols[1]<0,'inner shell faces the cavity');
});

test('stage solidify: batch undo restores geometry exactly',()=>{
 const st=new Stage();
 const p=st.addPrimitive('plane');
 const sp=st.addPrimitive('sphere');
 const gp=p.geometry,gs=sp.geometry;
 const before=p.geometry.getAttribute('position').count;
 assert.equal(st.solidify(0.1,0,[p.id,sp.id]),2);
 assert.ok(p.geometry.getAttribute('position').count>before);
 st.undo();
 assert.equal(p.geometry,gp,'plane geometry restored');
 assert.equal(sp.geometry,gs,'sphere geometry restored');
 st.redo();
 assert.ok(p.geometry!==gp);
});
