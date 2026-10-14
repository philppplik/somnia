import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';
import {spinMesh,type MeshData} from './editMesh';

const vol=(m:MeshData)=>{let v=0;for(let f=0;f<m.index.length;f+=3){const a=m.index[f]*3,b=m.index[f+1]*3,c=m.index[f+2]*3;const ax=m.positions[a],ay=m.positions[a+1],az=m.positions[a+2];const bx=m.positions[b],by=m.positions[b+1],bz=m.positions[b+2];const cx=m.positions[c],cy=m.positions[c+1],cz=m.positions[c+2];v+=(ax*(by*cz-bz*cy)-ay*(bx*cz-bz*cx)+az*(bx*cy-by*cx))/6;}return v;};
const borderCount=(m:MeshData)=>{const pk=(v:number)=>`${Math.round(m.positions[v*3]*1e6)},${Math.round(m.positions[v*3+1]*1e6)},${Math.round(m.positions[v*3+2]*1e6)}`;const u=new Map<string,number>();for(let f=0;f<m.index.length;f+=3)for(let e=0;e<3;e++){const a=pk(m.index[f+e]),b=pk(m.index[f+(e+1)%3]);const k=a<b?`${a}|${b}`:`${b}|${a}`;u.set(k,(u.get(k)||0)+1);}return[...u.values()].filter(n=>n===1).length;};
// Rectangle x in [1,2], y in [0,1] at z=0, revolved around the y axis: annular solid, ideal volume pi*(2^2-1^2)*1.
const rect=():MeshData=>({positions:[1,0,0,2,0,0,1,1,0,2,1,0],index:[0,1,2,1,3,2]});

test('spinMesh full turn: watertight welded seam, outward normals, polygon volume',()=>{
 const r=spinMesh(rect(),'y',360,32,[0,0,0]);
 assert.equal(r.positions.length/3,32*4,'full turn welds the seam ring (steps rings, not steps+1)');
 assert.equal(borderCount(r),0,'watertight');
 assert.ok(vol(r)>9.2&&vol(r)<9.43,`outward volume near pi*3 (32-gon), got ${vol(r)}`);
 const neg=spinMesh(rect(),'y',-360,32,[0,0,0]);
 assert.ok(vol(neg)>9.2,'negative sweep also points outward');
});

test('spinMesh partial turn: start and end caps close the solid, UVs copied per ring',()=>{
 const r=spinMesh({...rect(),uvs:[0,0,1,0,0,1,1,1]},'y',90,8,[0,0,0]);
 assert.equal(r.positions.length/3,9*4,'steps+1 rings');
 assert.equal(borderCount(r),0,'capped and watertight');
 assert.ok(vol(r)>2.3&&vol(r)<2.36,`quarter annulus volume, got ${vol(r)}`);
 assert.equal(r.uvs!.length,r.positions.length/3*2,'UVs carried');
 assert.equal(r.uvs![0],r.uvs![8],'ring copies share the profile UVs');
 assert.equal(r.mask,undefined,'mask dropped (topology changed)');
});

test('spinMesh validates input and refuses closed meshes',()=>{
 assert.throws(()=>spinMesh(rect(),'y',0,8,[0,0,0]),/non-zero/);
 assert.throws(()=>spinMesh(rect(),'y',400,8,[0,0,0]),/non-zero/);
 assert.throws(()=>spinMesh(rect(),'y',90,0,[0,0,0]),/whole number/);
 assert.throws(()=>spinMesh(rect(),'y',90,8,[0,0,Number.NaN]),/three numbers/);
 assert.throws(()=>spinMesh({positions:[0,0,0,1,0,0,0.5,1,0,0.5,0.5,1],index:[0,2,1,0,1,3,1,2,3,2,0,3]},'y',90,4,[0,0,0]),/no open border/);
});

test('stage spin: one undo restores the profile exactly',()=>{
 const st=new Stage();
 const m=st.addPrimitive('plane');
 const g=m.geometry;
 assert.equal(st.spin('y',270,8,[0,0,0],[m.id]),1);
 st.undo();
 assert.equal(m.geometry,g);
 st.redo();
 assert.ok(m.geometry!==g);
});
