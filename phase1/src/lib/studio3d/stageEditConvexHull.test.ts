import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';

test('stage editConvexHull: hull of a subdivided cube is the sharp cube again, undo restores',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelectAll('all','face');
 st.editSubdivide();
 st.editSelectAll('all','vertex');
 st.editConvexHull();
 assert.equal(o.geometry.getAttribute('position').count,8);
 assert.equal(o.geometry.getIndex()!.array.length/3,12);
 assert.deepEqual(st.editSelection(),{verts:[],edges:[],faces:[]});
 st.undo();
 assert.equal(o.geometry.getAttribute('position').count,54);
});

test('stage editConvexHull: an inward-slid corner rejoins the hull',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelect('vertex',[8]);
 st.editVertSlide([8,10],0.5);
 st.editSelectAll('all','vertex');
 st.editConvexHull();
 assert.equal(o.geometry.getAttribute('position').count,8);
 assert.equal(o.geometry.getIndex()!.array.length/3,12);
});

test('stage editConvexHull: needs a volume of selected vertices',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 assert.throws(()=>st.editConvexHull(),/Select vertices for the convex hull/);
 st.editSelect('vertex',[0,1,2]);
 assert.throws(()=>st.editConvexHull(),/at least four selected vertices/);
 const p=st.addPrimitive('plane') as import('three').Mesh;
 st.editStart(p.id);
 st.editSelectAll('all','vertex');
 assert.throws(()=>st.editConvexHull(),/non-flat volume/);
});
