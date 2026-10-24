import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Stage,StageError,collectNodeExtras,applyNodeExtras} from './stage';
test('an ambient light is added, read and edited, with one undo per edit',()=>{
 const st=new Stage();const l=st.addLight('ambient');
 assert.ok((l as THREE.AmbientLight).isAmbientLight);assert.equal(l.name,'Ambient light');
 const info=st.info(l.id)!.light!;
 assert.equal(info.intensity,0.6);assert.equal(info.color,'#ffffff');assert.equal(info.shadow,undefined,'ambient lights have no shadow toggle');
 st.setLight(l.id,{color:'#334455',intensity:1.2});
 assert.equal(st.info(l.id)!.light!.color,'#334455');
 st.undo();assert.equal(st.info(l.id)!.light!.color,'#ffffff','one undo restores the previous edit');
 st.redo();assert.equal(st.info(l.id)!.light!.intensity,1.2);
});
test('ambient and area lights refuse shadow edits',()=>{
 const st=new Stage();const am=st.addLight('ambient');const ar=st.addLight('area');
 assert.throws(()=>st.setLight(am.id,{shadow:true}),(e:Error)=>e instanceof StageError&&/Ambient lights cannot cast shadows/.test(e.message));
 assert.throws(()=>st.setLight(ar.id,{shadow:true}),/Area lights cannot cast shadows/);
 assert.throws(()=>st.setLight(am.id,{angle:30}),/Only spot lights have a cone angle/);
});
test('ambient lights travel through node extras like area lights',()=>{
 const st=new Stage();
 st.addLight('directional');
 const am=st.addLight('ambient') as THREE.AmbientLight;am.color.set('#445566');am.intensity=0.9;am.name='Soft fill';
 const extras=collectNodeExtras(st.root);
 const entry=extras.find(e=>e.ambient);
 assert.ok(entry,'ambient light is recorded');assert.deepEqual(entry.ambient,{color:'#445566',intensity:0.9,name:'Soft fill'});
 // Simulate a reload: plain empty nodes where the exporter could not write the light.
 const root=new THREE.Group();
 for(let i=0;i<3;i++)root.add(new THREE.Group());
 const r=applyNodeExtras(root,extras);
 assert.equal(r.skipped,0);
 const restored=root.children.filter(o=>(o as THREE.AmbientLight).isAmbientLight);
 assert.equal(restored.length,1);
 assert.equal((restored[0] as THREE.AmbientLight).color.getHexString(),'445566');
 // A node that already is a light does not get replaced.
 const bad=new THREE.Group();bad.add(new THREE.AmbientLight());
 assert.equal(applyNodeExtras(bad,[entry]).skipped,1);
});
