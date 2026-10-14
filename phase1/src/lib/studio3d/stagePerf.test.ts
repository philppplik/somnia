import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Stage} from './stage';
import {formatPerf} from './model';
test('formatPerf rounds fps and formats counts with units',()=>{
 assert.equal(formatPerf(59.6,12,843),'60 fps · 12 draws · 843 tris');
 assert.equal(formatPerf(0,3,25_000),'0 fps · 3 draws · 25.0 k tris');
 assert.equal(formatPerf(120.4,1000,2_500_000),'120 fps · 1000 draws · 2.5 M tris');
});
test('measure counts meshes that share one geometry and one material as instancing candidates',()=>{
 const st=new Stage();
 st.addPrimitive('cube');
 const geo=new THREE.BoxGeometry();const mat=new THREE.MeshStandardMaterial();
 for(let i=0;i<5;i++){const m=new THREE.Mesh(geo,mat);st.root.add(m);}
 const stats=st.measure().stats;
 assert.equal(stats.instancingCandidates,4,'five identical meshes: the first is not a candidate');
 const other=new THREE.Mesh(geo,new THREE.MeshStandardMaterial());st.root.add(other);
 assert.equal(st.measure().stats.instancingCandidates,4,'a different material starts a new group');
 const multi=new THREE.Mesh(geo,[mat,mat]);st.root.add(multi);
 assert.equal(st.measure().stats.instancingCandidates,4,'multi-material meshes are not instancing candidates');
 st.clear();
});
