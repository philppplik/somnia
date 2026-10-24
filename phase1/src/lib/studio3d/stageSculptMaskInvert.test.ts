import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Stage} from './stage';

test('stage sculptMaskInvert: masked becomes unmasked and back, undo restores',()=>{
 const st=new Stage();
 const m=st.addPrimitive('cube');
 const n=m.geometry.getAttribute('position').count;
 const mask=new Float32Array(n);mask[0]=1;mask[1]=0.25;
 m.geometry.setAttribute('somniaMask',new THREE.BufferAttribute(mask,1));
 st.sculptMaskInvert(m.id);
 const a=m.geometry.getAttribute('somniaMask') as THREE.BufferAttribute;
 assert.equal(a.getX(0),0);
 assert.equal(a.getX(1),0.75);
 assert.equal(a.getX(2),1);
 st.undo();
 const b=m.geometry.getAttribute('somniaMask') as THREE.BufferAttribute;
 assert.equal(b.getX(0),1);
 assert.equal(b.getX(1),0.25);
 st.redo();
 assert.equal((m.geometry.getAttribute('somniaMask') as THREE.BufferAttribute).getX(2),1);
});

test('stage sculptMaskInvert: a mesh without a mask ends fully masked, undo removes the attribute',()=>{
 const st=new Stage();
 const m=st.addPrimitive('cube');
 st.sculptMaskInvert(m.id);
 const a=m.geometry.getAttribute('somniaMask') as THREE.BufferAttribute;
 assert.ok(a,'mask created');
 assert.ok(Array.from(a.array as Float32Array).every(v=>v===1),'fully masked');
 st.undo();
 assert.equal(m.geometry.getAttribute('somniaMask'),undefined,'attribute removed again');
});
