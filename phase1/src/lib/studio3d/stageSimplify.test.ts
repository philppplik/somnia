import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Stage} from './stage';

const withMesh=(verts:()=>THREE.BufferGeometry)=>{const st=new Stage();const m=new THREE.Mesh(verts(),new THREE.MeshStandardMaterial());m.name='blob';st.loadUndoable([m],{key:'studio3d.hist.open',params:{name:'blob'}});return{st,m};};

test('simplify removes vertices, keeps the uv attribute and undoes to the exact geometry',async()=>{
 const{st,m}=withMesh(()=>new THREE.SphereGeometry(1,16,12));
 const before=m.geometry;const beforeVerts=before.getAttribute('position').count;const beforeTris=before.getIndex()!.count/3;
 const r=await st.simplify(m.id,0.5);
 assert.equal(r.before,beforeVerts);
 assert.ok(r.after<beforeVerts,'fewer vertices after simplifying');
 assert.ok(r.tris<beforeTris,'fewer triangles after simplifying');
 const after=m.geometry;
 assert.ok(after.getAttribute('uv'),'uv attribute survives');
 assert.equal(after.getAttribute('uv').count,after.getAttribute('position').count,'one uv per vertex');
 assert.ok(after.getAttribute('normal'),'normal attribute survives');
 assert.deepEqual(st.undoLabel,{key:'studio3d.hist.simplify',params:{name:'blob'}});
 st.undo();
 assert.equal(m.geometry,before,'undo restores the exact geometry object');
 assert.equal(m.geometry.getAttribute('position').count,beforeVerts);
 st.redo();
 assert.equal(m.geometry,after,'redo restores the simplified geometry object');
});

test('simplify clears primitive params so a param rebuild cannot resurrect the old shape',async()=>{
 const st=new Stage();
 const cube=st.addPrimitive('cube');
 assert.ok(cube.userData.somniaPrimitive,'primitive params present before');
 await st.simplify(cube.id,0.5);
 assert.equal(cube.userData.somniaPrimitive,undefined,'params cleared on the simplified mesh');
 st.undo();
 assert.ok(cube.userData.somniaPrimitive,'undo restores the primitive params');
});

test('simplify validates its input and refuses no-op ratios',async()=>{
 const{st,m}=withMesh(()=>new THREE.BoxGeometry());
 await assert.rejects(()=>st.simplify(m.id,0),/between 0 and 1/);
 await assert.rejects(()=>st.simplify(m.id,1),/between 0 and 1/);
 await assert.rejects(()=>st.simplify(m.id,Number.NaN),/finite/);
 await assert.rejects(()=>st.simplify(m.id,0.999),/removes nothing/);
 const light=st.addLight('point');
 await assert.rejects(()=>st.simplify(light.id,0.5),/Only meshes/);
 await assert.rejects(()=>st.simplify(9999,0.5),/No object/);
});

test('simplify is blocked while mesh edit mode is open',async()=>{
 const st=new Stage();
 const cube=st.addPrimitive('cube');
 st.editStart(cube.id);
 await assert.rejects(()=>st.simplify(cube.id,0.5),/edit mode/);
});
