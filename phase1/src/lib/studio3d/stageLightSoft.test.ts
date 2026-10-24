import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Stage,StageError,collectNodeExtras,applyNodeExtras} from './stage';
import {parseDocument,DOC_FORMAT} from './document';
import {defaultEnv,defaultSnap} from './model';

test('shadow softness: radius patches a shadow-capable light in one undo step',()=>{
 const st=new Stage();
 const sun=st.addLight('directional') as THREE.DirectionalLight;
 st.setLight(sun.id,{shadow:true,radius:6});
 assert.equal(sun.castShadow,true);
 assert.equal(sun.shadow!.radius,6);
 const info=st.info(sun.id)!.light!;
 assert.equal(info.shadow,true);
 assert.equal(info.radius,6);
 st.undo();
 assert.equal(sun.shadow!.radius,1);
 assert.equal(sun.castShadow,false);
 st.redo();
 assert.equal(sun.shadow!.radius,6);
});
test('shadow softness refuses area and ambient lights and out-of-range values',()=>{
 const st=new Stage();
 const area=st.addLight('area');
 assert.throws(()=>st.setLight(area.id,{radius:2}),StageError);
 const amb=st.addLight('ambient');
 assert.throws(()=>st.setLight(amb.id,{radius:2}),StageError);
 const sun=st.addLight('directional');
 assert.throws(()=>st.setLight(sun.id,{radius:-1}),/between 0 and 50/);
});
test('shadow radius survives the document extras round trip, legacy entries stay valid',()=>{
 const st=new Stage();
 st.addPrimitive('cube');
 const sun=st.addLight('directional');
 st.setLight(sun.id,{shadow:true,radius:8});
 const extras=collectNodeExtras(st.root);
 const entry=extras.find(e=>e.shadow);
 assert.ok(entry&&entry.radius===8,'radius saved next to the shadow flag');
 // Re-apply onto a fresh tree of the same shape.
 const st2=new Stage();
 st2.addPrimitive('cube');
 const sun2=st2.addLight('directional') as THREE.DirectionalLight;
 const {skipped}=applyNodeExtras(st2.root,extras);
 assert.equal(skipped,0);
 assert.equal(sun2.castShadow,true);
 assert.equal(sun2.shadow!.radius,8);
 // A legacy entry without radius still validates and applies.
 const doc=parseDocument(JSON.stringify({format:DOC_FORMAT,version:1,app:'somnia',unit:'m',env:defaultEnv(),snap:defaultSnap(),view:null,views:[],extras:[{i:1,shadow:true}],scene:{encoding:'base64',data:''},envMap:null}));
 assert.equal(doc.extras[0].radius,undefined);
 const st3=new Stage();st3.addPrimitive('cube');const sun3=st3.addLight('directional') as THREE.DirectionalLight;
 assert.equal(applyNodeExtras(st3.root,doc.extras).skipped,0);
 assert.equal(sun3.castShadow,true);
 assert.equal(sun3.shadow!.radius,1);
});
test('studio rig: softbox pair plus a shadow-casting top light, one undo',()=>{
 const st=new Stage();
 st.addPrimitive('cube');
 const lights=st.addLightRig('studio');
 assert.equal(lights.length,3);
 const areas=lights.filter(l=>(l as THREE.RectAreaLight).isRectAreaLight);
 const tops=lights.filter(l=>(l as THREE.DirectionalLight).isDirectionalLight);
 assert.equal(areas.length,2,'two area softboxes');
 assert.equal(tops.length,1);
 assert.equal(tops[0].castShadow,true);
 // Softboxes face the scene centre.
 // A rect area light emits along its local -Z: the world +Z axis must point AWAY from the subject.
 const key=areas[0] as THREE.RectAreaLight;
 st.root.updateMatrixWorld(true);
 const plus=new THREE.Vector3();key.getWorldDirection(plus);
 const away=key.position.clone().sub(new THREE.Vector3(0,0.5,0)).normalize();
 assert.ok(plus.dot(away)>0.9,'key faces the subject');
 st.undo();
 let n=0;st.root.traverse(o=>{if((o as THREE.Light).isLight)n++;});
 assert.equal(n,0,'one undo removes the whole rig');
 st.redo();
 n=0;st.root.traverse(o=>{if((o as THREE.Light).isLight)n++;});
 assert.equal(n,3);
});
test('sunset rig: warm low sun plus cool ambient, default preset unchanged',()=>{
 const st=new Stage();
 const lights=st.addLightRig('sunset');
 assert.equal(lights.length,2);
 const sun=lights.find(l=>(l as THREE.DirectionalLight).isDirectionalLight) as THREE.DirectionalLight;
 const sky=lights.find(l=>(l as THREE.AmbientLight).isAmbientLight) as THREE.AmbientLight;
 assert.ok(sun&&sky);
 assert.equal(sun.castShadow,true);
 assert.equal('#'+sun.color.getHexString(),'#ffb36b','warm sun');
 assert.equal('#'+sky.color.getHexString(),'#5a6b8c','cool sky fill');
 assert.ok(sun.position.y<sun.position.x,'the sun sits low');
 const classic=st.addLightRig();
 assert.equal(classic.length,3);
 assert.equal(classic[0].name.startsWith('Key light'),true,'default is still the three-point rig');
});
