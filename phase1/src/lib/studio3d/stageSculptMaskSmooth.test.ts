import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Stage} from './stage';

const expect=(m:THREE.Mesh,want:(pos:[number,number,number])=>number)=>{
 const a=m.geometry.getAttribute('somniaMask') as THREE.BufferAttribute;
 const p=m.geometry.getAttribute('position') as THREE.BufferAttribute;
 for(let i=0;i<p.count;i++)assert.ok(Math.abs(a.getX(i)-want([p.getX(i),p.getY(i),p.getZ(i)]))<1e-6,`vert ${i}`);
};

test('stage sculptMaskSmooth: values blur towards the neighbourhood mean, twins together, undo restores',()=>{
 const st=new Stage();
 const m=st.addPrimitive('cube');
 const n=m.geometry.getAttribute('position').count;
 const mask=new Float32Array(n);
 mask[0]=1;mask[11]=1;mask[17]=1; // the (+.5,+.5,+.5) corner
 m.geometry.setAttribute('somniaMask',new THREE.BufferAttribute(mask,1));
 st.sculptMaskSmooth(m.id,0.5);
 expect(m,([x,y,z])=>{
  const k=`${x},${y},${z}`;
  if(k==='0.5,0.5,0.5')return 0.5; // degree 4: half of 1
  if(k==='0.5,-0.5,0.5'||k==='0.5,0.5,-0.5'||k==='-0.5,0.5,0.5')return 0.1; // degree 5: half of 1/5
  if(k==='-0.5,-0.5,0.5')return 0.125; // degree 4: half of 1/4
  return 0;
 });
 st.undo();
 expect(m,([x,y,z])=>(x===0.5&&y===0.5&&z===0.5?1:0));
 st.redo();
 expect(m,([x,y,z])=>{
  const k=`${x},${y},${z}`;
  if(k==='0.5,0.5,0.5')return 0.5;
  if(k==='0.5,-0.5,0.5'||k==='0.5,0.5,-0.5'||k==='-0.5,0.5,0.5')return 0.1;
  if(k==='-0.5,-0.5,0.5')return 0.125;
  return 0;
 });
});

test('stage sculptMaskSmooth: needs a mask and an amount between 0 and 1',()=>{
 const st=new Stage();
 const m=st.addPrimitive('cube');
 assert.throws(()=>st.sculptMaskSmooth(m.id,0.5),/no sculpt mask/);
 const n=m.geometry.getAttribute('position').count;
 m.geometry.setAttribute('somniaMask',new THREE.BufferAttribute(new Float32Array(n),1));
 assert.throws(()=>st.sculptMaskSmooth(m.id,0),/between 0 and 1/);
 assert.throws(()=>st.sculptMaskSmooth(m.id,1.5),/between 0 and 1/);
});
