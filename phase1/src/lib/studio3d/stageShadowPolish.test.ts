import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Stage} from './stage';
import {shadowMapSize,isShadowQuality,isShadowType,defaultShadows} from './model';
test('shadow quality map: off, low, medium, high sizes and guards',()=>{
 // 'off' is handled by the enabled toggle, not by the map size.
 assert.equal(shadowMapSize('low'),512);
 assert.equal(shadowMapSize('medium'),1024);
 assert.equal(shadowMapSize('high'),2048);
 assert.equal(shadowMapSize('bogus' as never),2048,'unknown values fall back to high');
 assert.ok(['off','low','medium','high'].every(isShadowQuality));
 assert.ok(!isShadowQuality('bogus'));
 assert.ok(isShadowType('vsm')&&isShadowType('pcf')&&!isShadowType('basic'));
 assert.deepEqual(defaultShadows(),{quality:'high',type:'vsm'});
});
test('the outdoor rig adds a shadow-casting sun and a sky fill, one undo step',()=>{
 const st=new Stage();
 st.addPrimitive('cube');
 const lights=st.addLightRig('outdoor');
 assert.equal(lights.length,2);
 const[sun,sky]=lights as [THREE.DirectionalLight,THREE.AmbientLight];
 assert.equal(sun.name,'Outdoor sun');assert.equal(sky.name,'Outdoor sky');
 assert.ok(sun.isDirectionalLight&&sky.isAmbientLight);
 assert.equal(sun.castShadow,true,'the sun casts shadows');
 assert.equal(sky.castShadow,false);
 assert.ok(sun.intensity>sky.intensity,'the sun is the strongest');
 assert.ok(sun.position.y>0,'the sun is high');
 assert.ok(sun.target.parent===st.root,'the sun is aimed at the bounds centre');
 let nodes=0;st.root.traverse(()=>{nodes++;});
 assert.equal(nodes,5,'root + cube + sun + target + sky');
 st.undo();nodes=0;st.root.traverse(()=>{nodes++;});
 assert.equal(nodes,2,'one undo removes the whole rig (root and cube stay)');
 st.redo();nodes=0;st.root.traverse(()=>{nodes++;});
 assert.equal(nodes,5,'redo restores it');
});
test('the outdoor rig still combines with a second rig into single undo steps',()=>{
 const st=new Stage();
 st.addLightRig('outdoor');
 st.addLightRig('three-point');
 st.undo();st.undo();
 let lights=0;st.root.traverse(o=>{if((o as THREE.Light).isLight)lights++;});
 assert.equal(lights,0);
});
