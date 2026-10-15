import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Stage} from './stage';

test('stage editMaskToSelection: masked vertices become the vertex selection',()=>{
 const st=new Stage();
 const m=st.addPrimitive('cube');
 const n=m.geometry.getAttribute('position').count;
 const mask=new Float32Array(n);
 mask[0]=1;mask[11]=1;mask[17]=1;mask[5]=0.4;
 m.geometry.setAttribute('somniaMask',new THREE.BufferAttribute(mask,1));
 st.editStart(m.id);
 st.editMaskToSelection();
 assert.deepEqual([...(st as unknown as {editSel:{verts:Iterable<number>}}).editSel.verts].sort((a,b)=>a-b),[0,11,17],'0.4 stays under the default threshold');
 st.editMaskToSelection(0.3);
 assert.deepEqual([...(st as unknown as {editSel:{verts:Iterable<number>}}).editSel.verts].sort((a,b)=>a-b),[0,5,11,17],'lower threshold admits 0.4');
});

test('stage editMaskToSelection: needs a mask and a threshold between 0 and 1',()=>{
 const st=new Stage();
 const m=st.addPrimitive('cube');
 st.editStart(m.id);
 assert.throws(()=>st.editMaskToSelection(),/no sculpt mask/);
 const n=m.geometry.getAttribute('position').count;
 m.geometry.setAttribute('somniaMask',new THREE.BufferAttribute(new Float32Array(n),1));
 assert.throws(()=>st.editMaskToSelection(2),/between 0 and 1/);
});
