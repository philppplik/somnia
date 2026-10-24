import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';
import {bisectMesh,type MeshData} from './editMesh';

const meshDataOf=(st:Stage,m:{geometry:unknown})=>(st as unknown as {meshDataOf:(x:unknown)=>MeshData}).meshDataOf(m);
const vol=(m:MeshData)=>{let v=0;for(let f=0;f<m.index.length;f+=3){const a=m.index[f]*3,b=m.index[f+1]*3,c=m.index[f+2]*3;const ax=m.positions[a],ay=m.positions[a+1],az=m.positions[a+2];const bx=m.positions[b],by=m.positions[b+1],bz=m.positions[b+2];const cx=m.positions[c],cy=m.positions[c+1],cz=m.positions[c+2];v+=(ax*(by*cz-bz*cy)-ay*(bx*cz-bz*cx)+az*(bx*cy-by*cx))/6;}return v;};
const borderCount=(m:MeshData)=>{const pk=(v:number)=>`${Math.round(m.positions[v*3]*1e6)},${Math.round(m.positions[v*3+1]*1e6)},${Math.round(m.positions[v*3+2]*1e6)}`;const u=new Map<string,number>();for(let f=0;f<m.index.length;f+=3)for(let e=0;e<3;e++){const a=pk(m.index[f+e]),b=pk(m.index[f+(e+1)%3]);const k=a<b?`${a}|${b}`:`${b}|${a}`;u.set(k,(u.get(k)||0)+1);}return[...u.values()].filter(n=>n===1).length;};

test('bisectMesh splits a cube into two closed halves of equal volume',()=>{
 const st=new Stage();
 const c=st.addPrimitive('cube');
 const r=bisectMesh(meshDataOf(st,c),'x',0,true);
 assert.ok(Math.abs(vol(r.neg)-0.5)<1e-6,'negative half is half the cube');
 assert.ok(Math.abs(vol(r.pos)-0.5)<1e-6,'positive half is half the cube');
 assert.equal(borderCount(r.neg),0,'filled cut leaves no border');
 assert.equal(borderCount(r.pos),0,'filled cut leaves no border');
 assert.equal(Math.max(...r.neg.positions.filter((_,i)=>i%3===0)),0,'negative half stops at the plane');
 assert.equal(Math.min(...r.pos.positions.filter((_,i)=>i%3===0)),0,'positive half starts at the plane');
});

test('bisectMesh without fill keeps the cut open and carries UVs',()=>{
 const st=new Stage();
 const s=st.addPrimitive('sphere');
 const r=bisectMesh(meshDataOf(st,s),'z',0,false);
 assert.ok(borderCount(r.neg)>0&&borderCount(r.pos)>0,'open cut has borders');
 assert.equal(r.neg.uvs!.length,r.neg.positions.length/3*2,'UVs carried');
 assert.equal(r.neg.mask,undefined,'mask dropped (topology changed)');
 const off=bisectMesh(meshDataOf(st,s),'y',0.25,true);
 assert.ok(Math.abs(vol(off.neg)+vol(off.pos)-vol(meshDataOf(st,s)))<0.02,'volumes sum to the original');
});

test('bisectMesh validates the plane',()=>{
 const st=new Stage();
 const c=st.addPrimitive('cube');
 const d=meshDataOf(st,c);
 assert.throws(()=>bisectMesh(d,'x',5,true),/does not cut/);
 assert.throws(()=>bisectMesh(d,'x',Number.NaN,true),/offset/);
});

test('stage bisect: two objects from one, one undo restores the original exactly',()=>{
 const st=new Stage();
 const c=st.addPrimitive('cube');
 const g=c.geometry;
 assert.equal(st.bisect('x',0,true,[c.id]),2,'returns both halves');
 assert.equal((st as unknown as {root:{children:unknown[]}}).root.children.length,2,'two objects now');
 st.undo();
 assert.equal((st as unknown as {root:{children:unknown[]}}).root.children.length,1,'clone removed');
 assert.equal(c.geometry,g,'original geometry restored');
 st.redo();
 assert.equal((st as unknown as {root:{children:unknown[]}}).root.children.length,2);
});
