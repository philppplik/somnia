import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {Stage} from './stage';

test('stage sculptMaskFromSelection: selected vertices mask with their position twins, undo removes a fresh mask',()=>{
 const st=new Stage();
 const m=st.addPrimitive('cube');
 st.editStart(m.id);
 st.editSelect('vertex',[0]);
 st.sculptMaskFromSelection();
 const a=m.geometry.getAttribute('somniaMask') as THREE.BufferAttribute;
 assert.ok(a,'mask created');
 assert.equal(a.getX(0),1);
 assert.equal(a.getX(11),1,'position twin masked');
 assert.equal(a.getX(17),1,'position twin masked');
 assert.equal(a.getX(1),0,'everything else untouched');
 st.undo();
 assert.equal(m.geometry.getAttribute('somniaMask'),undefined,'fresh mask removed again');
 st.redo();
 assert.equal((m.geometry.getAttribute('somniaMask') as THREE.BufferAttribute).getX(0),1);
});

test('stage sculptMaskFromSelection: existing values survive outside the selection, undo restores them',()=>{
 const st=new Stage();
 const m=st.addPrimitive('cube');
 const n=m.geometry.getAttribute('position').count;
 const mask=new Float32Array(n);mask[5]=0.5;
 m.geometry.setAttribute('somniaMask',new THREE.BufferAttribute(mask,1));
 st.editStart(m.id);
 st.editSelect('vertex',[0]);
 st.sculptMaskFromSelection();
 const a=m.geometry.getAttribute('somniaMask') as THREE.BufferAttribute;
 assert.equal(a.getX(0),1);
 assert.equal(a.getX(5),0.5,'previous value kept');
 st.undo();
 const b=m.geometry.getAttribute('somniaMask') as THREE.BufferAttribute;
 assert.equal(b.getX(0),0);
 assert.equal(b.getX(5),0.5);
});

test('stage sculptMaskFromSelection: needs an edit session and a vertex selection',()=>{
 const st=new Stage();
 const m=st.addPrimitive('cube');
 st.editStart(m.id);
 assert.throws(()=>st.sculptMaskFromSelection(),/Select vertices/);
});
