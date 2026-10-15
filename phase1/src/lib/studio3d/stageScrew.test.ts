import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';
import {spinMesh,type MeshData} from './editMesh';

// Rectangle x in [1,2], y in [0,1] at z=0: the spin profile; the screw adds a rise per ring along the axis.
const rect=():MeshData=>({positions:[1,0,0,2,0,0,1,1,0,2,1,0],index:[0,1,2,1,3,2]});

test('spinMesh rise: rings climb linearly along the axis (helix)',()=>{
 const r=spinMesh(rect(),'y',180,8,[0,0,0],2);
 const nv=4;
 assert.equal(r.positions.length/3,9*nv,'partial turn keeps steps+1 rings');
 assert.ok(Math.abs(r.positions[1]-0)<1e-9,'first ring keeps its height');
 assert.ok(Math.abs(r.positions[(4*nv)*3+1]-1)<1e-9,`half-way ring at half the rise, got ${r.positions[(4*nv)*3+1]}`);
 assert.ok(Math.abs(r.positions[(8*nv)*3+1]-2)<1e-9,`last ring rose by the full rise, got ${r.positions[(8*nv)*3+1]}`);
 assert.ok(Math.abs(r.positions[(8*nv)*3+4]-2)<1e-9,'every vertex of the last ring climbs the same rise');
});

test('spinMesh rise on a full turn: no seam weld, end caps close the coil',()=>{
 const r=spinMesh(rect(),'y',360,16,[0,0,0],1.5);
 assert.equal(r.positions.length/3,17*4,'a rising full turn keeps steps+1 rings');
 assert.ok(Math.abs(r.positions[(16*4)*3+1]-1.5)<1e-9,'last ring rose the full turn rise');
 const flat=spinMesh(rect(),'y',360,16,[0,0,0]);
 assert.equal(flat.positions.length/3,16*4,'a flat full turn still welds the seam');
});

test('spinMesh rise validates finite and stays optional',()=>{
 assert.throws(()=>spinMesh(rect(),'y',90,8,[0,0,0],Number.NaN),/finite/);
 assert.throws(()=>spinMesh(rect(),'y',90,8,[0,0,0],Infinity),/finite/);
 const plain=spinMesh(rect(),'y',90,8,[0,0,0]);
 assert.ok(Math.abs(plain.positions[(8*4)*3+1]-0)<1e-9,'omitted rise keeps the profile heights');
});

test('stage screw: helix bakes and one undo restores the profile exactly',()=>{
 const st=new Stage();
 const m=st.addPrimitive('plane');
 const g=m.geometry;
 assert.equal(st.screw('y',360,16,[0,0,0],3,[m.id]),1);
 st.undo();
 assert.equal(m.geometry,g);
 st.redo();
 assert.ok(m.geometry!==g);
});
