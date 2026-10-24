import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';

test('stage editSelectionCenter: centroid of touched vertices in world space',()=>{
 const st=new Stage();
 const m=st.addPrimitive('cube');
 st.editStart(m.id);
 st.editSelect('vertex',[0]);
 assert.deepEqual(st.editSelectionCenter(),[0.5,1,0.5],'corner vertex world position (cube rests at y=0.5)');
 st.editSelectAll('none','vertex');
 st.editSelect('face',[0,1]);
 const c=st.editSelectionCenter();
 assert.ok(Math.abs(c[0]-0.5)<1e-9&&Math.abs(c[1]-0.5)<1e-9&&Math.abs(c[2])<1e-9,`face pair centre sits on the +x side, got ${c}`);
});

test('stage editSelectionCenter throws on an empty selection',()=>{
 const st=new Stage();
 const m=st.addPrimitive('cube');
 st.editStart(m.id);
 assert.throws(()=>st.editSelectionCenter(),/Select something first/);
});

test('stage objectsCenter: average of world positions',()=>{
 const st=new Stage();
 const a=st.addPrimitive('cube');
 const b=st.addPrimitive('cube');
 st.setTransform(b.id,{position:{x:2,y:1,z:-2}});
 assert.deepEqual(st.objectsCenter([a.id,b.id]),[1,0.75,-1],'midpoint of (0,0.5,0) and (2,1,-2)');
 assert.throws(()=>st.objectsCenter([]),/Select at least 1/);
});
