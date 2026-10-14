import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';
import {remeshMesh,type MeshData} from './editMesh';

const vol=(m:MeshData)=>{let v=0;for(let f=0;f<m.index.length;f+=3){const a=m.index[f]*3,b=m.index[f+1]*3,c=m.index[f+2]*3;const ax=m.positions[a],ay=m.positions[a+1],az=m.positions[a+2],bx=m.positions[b],by=m.positions[b+1],bz=m.positions[b+2],cx=m.positions[c],cy=m.positions[c+1],cz=m.positions[c+2];v+=(ax*(by*cz-bz*cy)-ay*(bx*cz-bz*cx)+az*(bx*cy-by*cx))/6;}return v;};
const borderCount=(m:MeshData)=>{const pk=(v:number)=>`${Math.round(m.positions[v*3]*1e5)},${Math.round(m.positions[v*3+1]*1e5)},${Math.round(m.positions[v*3+2]*1e5)}`;const u=new Map<string,number>();for(let f=0;f<m.index.length;f+=3)for(let e=0;e<3;e++){const a=pk(m.index[f+e]),b=pk(m.index[f+(e+1)%3]);const k=a<b?`${a}|${b}`:`${b}|${a}`;u.set(k,(u.get(k)||0)+1);}return[...u.values()].filter(n=>n===1).length;};
const cube=(s:number):MeshData=>({positions:[0,0,0, s,0,0, s,s,0, 0,s,0, 0,0,s, s,0,s, s,s,s, 0,s,s],index:[0,2,1,0,3,2, 4,5,6,4,6,7, 0,1,5,0,5,4, 2,3,7,2,7,6, 1,2,6,1,6,5, 0,4,7,0,7,3]});
const sphere=(r:number,nu:number,nv:number):MeshData=>{
 const p:number[]=[];const idx:number[]=[];
 for(let v=0;v<=nv;v++){const th=Math.PI*v/nv;for(let u=0;u<nu;u++){const ph=2*Math.PI*u/nu;p.push(r*Math.sin(th)*Math.cos(ph),r*Math.cos(th),r*Math.sin(th)*Math.sin(ph));}}
 for(let v=0;v<nv;v++)for(let u=0;u<nu;u++){const a=v*nu+u,b=v*nu+(u+1)%nu,c=(v+1)*nu+u,d=(v+1)*nu+(u+1)%nu;if(v>0)idx.push(a,c,b);if(v<nv-1)idx.push(b,c,d);}
 return{positions:p,index:idx};
};

test('remeshMesh rebuilds a cube watertight with its volume and corners intact',()=>{
 const out=remeshMesh(cube(1),16);
 assert.equal(borderCount(out),0,'watertight');
 assert.ok(Math.abs(vol(out)-1)<0.02,`unit cube keeps its volume (got ${vol(out)})`);
 let mn=[9,9,9],mx=[-9,-9,-9];
 for(let i=0;i<out.positions.length;i+=3)for(let a=0;a<3;a++){mn[a]=Math.min(mn[a],out.positions[i+a]);mx[a]=Math.max(mx[a],out.positions[i+a]);}
 assert.deepEqual(mn.map(v=>Math.round(v*1000)/1000),[0,0,0],'min corner exact');
 assert.deepEqual(mx.map(v=>Math.round(v*1000)/1000),[1,1,1],'max corner exact');
});

test('remeshMesh approximates a sphere closely and validates its input',()=>{
 const out=remeshMesh(sphere(1,32,24),32);
 assert.equal(borderCount(out),0,'watertight');
 const exact=4*Math.PI/3;
 assert.ok(vol(out)>exact*0.95&&vol(out)<exact*1.02,`sphere volume within 5% (got ${vol(out)} vs ${exact})`);
 assert.throws(()=>remeshMesh({positions:[0,0,0,1,0,0,0,1,0],index:[0,1,2]},16),/closed solid/);
 assert.throws(()=>remeshMesh(cube(1),4),/between 8 and 128/);
 assert.throws(()=>remeshMesh(cube(1),256),/between 8 and 128/);
});

test('stage remesh: in-place geometry swap, primitive params dropped, one undo restores everything',()=>{
 const st=new Stage();
 const a=st.addPrimitive('cube');
 const before=a.geometry;
 const tris=(g:import("three").BufferGeometry)=>(g.getIndex()?g.getIndex()!.count:g.getAttribute('position').count)/3;
 const t0=tris(before);
 assert.equal(st.remesh(24,[a.id]),1);
 assert.notEqual(a.geometry,before,'geometry swapped');
 assert.ok(tris(a.geometry)>t0*10,`voxel grid is denser than 12 tris (got ${tris(a.geometry)})`);
 assert.equal(a.userData.somniaPrimitive,undefined,'primitive params dropped');
 st.undo();
 assert.equal(a.geometry,before,'undo restores the original geometry object');
 st.redo();
 assert.notEqual(a.geometry,before,'redo reapplies');
 const l=st.addLight('directional');
 assert.throws(()=>st.remesh(24,[l.id]),/not a mesh/);
});
