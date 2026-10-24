import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Stage} from './stage';

const masked=(m:THREE.Mesh)=>{const a=m.geometry.getAttribute('somniaMask') as THREE.BufferAttribute;let c=0;for(let i=0;i<a.count;i++)if(a.getX(i)>0.5)c++;return c;};

test('stage sculptMaskGrow: one ring grows across position twins, undo and redo restore',()=>{
 const st=new Stage();
 const m=st.addPrimitive('cube');
 const n=m.geometry.getAttribute('position').count;
 const mask=new Float32Array(n);
 mask[0]=1;mask[11]=1;mask[17]=1; // the (+.5,+.5,+.5) corner, UV-split into three verts
 m.geometry.setAttribute('somniaMask',new THREE.BufferAttribute(mask,1));
 st.sculptMaskGrow(m.id,1);
 assert.equal(masked(m),15,'seed corner plus its four neighbouring corners, three verts each');
 st.undo();
 assert.equal(masked(m),3);
 st.redo();
 assert.equal(masked(m),15);
});

test('stage sculptMaskGrow: negative steps shrink the mask back',()=>{
 const st=new Stage();
 const m=st.addPrimitive('cube');
 const n=m.geometry.getAttribute('position').count;
 const mask=new Float32Array(n);
 mask[0]=1;mask[11]=1;mask[17]=1;
 m.geometry.setAttribute('somniaMask',new THREE.BufferAttribute(mask,1));
 st.sculptMaskGrow(m.id,2);
 assert.equal(masked(m),24,'two rings cover the whole cube');
 st.sculptMaskGrow(m.id,-1);
 assert.equal(masked(m),24,'a full mask has no unmasked neighbour, so nothing shrinks');
 st.undo();
 assert.equal(masked(m),24);
 st.undo();
 assert.equal(masked(m),3);
 st.sculptMaskGrow(m.id,1);
 st.sculptMaskGrow(m.id,-1);
 assert.equal(masked(m),3,'only the fully surrounded seed corner survives a shrink');
});

test('stage sculptMaskGrow: needs a mask and nonzero steps',()=>{
 const st=new Stage();
 const m=st.addPrimitive('cube');
 assert.throws(()=>st.sculptMaskGrow(m.id,1),/no sculpt mask/);
 const n=m.geometry.getAttribute('position').count;
 m.geometry.setAttribute('somniaMask',new THREE.BufferAttribute(new Float32Array(n),1));
 assert.throws(()=>st.sculptMaskGrow(m.id,0),/nonzero/);
});
