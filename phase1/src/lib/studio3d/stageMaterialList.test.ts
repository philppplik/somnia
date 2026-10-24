import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Stage} from './stage';

test('materialUsage groups meshes by shared material instance',()=>{
 const s=new Stage();
 const a=s.addPrimitive('cube'),b=s.addPrimitive('sphere'),c=s.addPrimitive('cone');
 const shared=new THREE.MeshStandardMaterial({color:0x336699});shared.name='Steel';
 (s.find(a.id) as THREE.Mesh).material=shared;
 (s.find(b.id) as THREE.Mesh).material=shared;
 const list=s.materialUsage();
 assert.equal(list.length,2);
 assert.equal(list[0].name,'Steel');
 assert.equal(list[0].count,2);
 assert.deepEqual(list[0].ids.sort(),[a.id,b.id].sort());
 assert.equal(list[0].color,'#336699');
 assert.equal(list[1].count,1);
 assert.deepEqual(list[1].ids,[c.id]);
});
test('unnamed materials are numbered after collection and sorted by usage',()=>{
 const s=new Stage();
 const a=s.addPrimitive('cube'),b=s.addPrimitive('sphere');s.addPrimitive('cone');
 const shared=new THREE.MeshStandardMaterial();
 (s.find(a.id) as THREE.Mesh).material=shared;
 (s.find(b.id) as THREE.Mesh).material=shared;
 const list=s.materialUsage();
 assert.equal(list[0].name,'Material 1');
 assert.equal(list[0].count,2);
 assert.equal(list[1].name,'Material 2');
});
test('a mesh with a material array counts toward each slot material',()=>{
 const s=new Stage();
 const a=s.addPrimitive('cube');
 (s.find(a.id) as THREE.Mesh).material=[new THREE.MeshStandardMaterial({color:0xff0000}),new THREE.MeshStandardMaterial({color:0x00ff00})];
 const list=s.materialUsage();
 assert.equal(list.length,2);
 assert.deepEqual(list.map(u=>u.count),[1,1]);
 assert.deepEqual(list.map(u=>u.color).sort(),['#00ff00','#ff0000']);
});
