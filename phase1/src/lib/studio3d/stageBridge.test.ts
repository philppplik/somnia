import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';
import {bridgeMesh,type MeshData} from './editMesh';

const vol=(m:MeshData)=>{let v=0;for(let f=0;f<m.index.length;f+=3){const a=m.index[f]*3,b=m.index[f+1]*3,c=m.index[f+2]*3;const ax=m.positions[a],ay=m.positions[a+1],az=m.positions[a+2];const bx=m.positions[b],by=m.positions[b+1],bz=m.positions[b+2];const cx=m.positions[c],cy=m.positions[c+1],cz=m.positions[c+2];v+=(ax*(by*cz-bz*cy)-ay*(bx*cz-bz*cx)+az*(bx*cy-by*cx))/6;}return v;};
const borderCount=(m:MeshData)=>{const pk=(v:number)=>`${Math.round(m.positions[v*3]*1e6)},${Math.round(m.positions[v*3+1]*1e6)},${Math.round(m.positions[v*3+2]*1e6)}`;const u=new Map<string,number>();for(let f=0;f<m.index.length;f+=3)for(let e=0;e<3;e++){const a=pk(m.index[f+e]),b=pk(m.index[f+(e+1)%3]);const k=a<b?`${a}|${b}`:`${b}|${a}`;u.set(k,(u.get(k)||0)+1);}return[...u.values()].filter(n=>n===1).length;};
const sq=(z:number):MeshData=>({positions:[0,0,z,1,0,z,1,1,z,0,1,z],index:[0,1,2,0,2,3]});

test('bridgeMesh sews two squares into a closed box with outward volume',()=>{
 const r=bridgeMesh(sq(0),sq(2),0);
 assert.equal(borderCount(r),0,'watertight');
 assert.ok(Math.abs(vol(r)-2)<1e-9,`unit square x height 2, got ${vol(r)}`);
});

test('bridgeMesh handles uneven loop sizes and refuses closed meshes',()=>{
 const oct=(z:number):MeshData=>{const p:number[]=[];const idx:number[]=[];for(let k=0;k<8;k++){const a=Math.PI*2*k/8;p.push(Math.cos(a)+3,Math.sin(a),z);}for(let k=1;k<7;k++)idx.push(0,k,k+1);return{positions:p,index:idx};};
 const r=bridgeMesh(sq(0),oct(2),0);
 assert.equal(borderCount(r),0,'square to octagon sews watertight');
 assert.ok(vol(r)>0,'unified winding points outward');
 assert.throws(()=>bridgeMesh({positions:[0,0,0,1,0,0,0.5,1,0,0.5,0.5,1],index:[0,2,1,0,1,3,1,2,3,2,0,3]},sq(1),0),/open border/);
 assert.throws(()=>bridgeMesh(sq(0),sq(1),100),/twist/);
});

test('bridgeMesh keeps UVs only when both meshes carry them',()=>{
 const wu=(z:number):MeshData=>({...sq(z),uvs:[0,0,1,0,1,1,0,1]});
 assert.equal(bridgeMesh(wu(0),wu(2),0).uvs!.length,8*2,'both carry: kept');
 assert.equal(bridgeMesh(wu(0),sq(2),0).uvs,undefined,'one missing: dropped');
});

test('stage bridge: two meshes become one at the root, transforms baked, one undo restores both exactly',()=>{
 const st=new Stage();
 const a=st.addPrimitive('plane');
 const b=st.addPrimitive('plane');
 b.position.z=2;b.updateMatrixWorld(true);
 const ga=a.geometry,gb=b.geometry;
 const root=(st as unknown as {root:{children:unknown[]}}).root;
 assert.equal(root.children.length,2);
 assert.equal(st.bridge([a.id,b.id],0),1);
 assert.equal(root.children.length,1,'both originals removed');
 const result=root.children[0] as {geometry:{getAttribute:(n:string)=>{getZ:(i:number)=>number;count:number}}};
 const zs=new Set<number>();
 const pos=result.geometry.getAttribute('position');
 for(let i=0;i<pos.count;i++)zs.add(Math.round(pos.getZ(i)*1000)/1000);
 assert.ok(zs.has(-1)&&zs.has(3),`both originals present, world transform baked: flat plane A spans z -1..1, B spans 1..3 (got ${[...zs]})`);
 st.undo();
 assert.equal(root.children.length,2,'both restored');
 assert.equal(a.geometry,ga);
 assert.equal(b.geometry,gb);
 st.redo();
 assert.equal(root.children.length,1);
});
