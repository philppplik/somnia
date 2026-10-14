import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';

test('stage editSeparate: splits selected faces into a new sibling object, one undo step',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelect('face',[4,5]);
 const parent=o.parent!;
 const kids=parent.children.length;
 st.editSeparate();
 assert.equal(o.geometry.getIndex()!.array.length/3,10);
 assert.equal(parent.children.length,kids+1);
 const part=parent.children[kids] as import('three').Mesh;
 assert.equal(part.geometry.getIndex()!.array.length/3,2);
 assert.equal(part.geometry.getAttribute('position').count,4);
 assert.notEqual(part.material,o.material);
 assert.ok(part.geometry.getAttribute('uv'));
 st.undo();
 assert.equal(o.geometry.getIndex()!.array.length/3,12);
 assert.equal(parent.children.length,kids);
 st.redo();
 assert.equal(parent.children.length,kids+1);
 assert.equal(o.geometry.getIndex()!.array.length/3,10);
});

test('stage editSeparate: needs a face selection smaller than the whole mesh',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 assert.throws(()=>st.editSeparate(),/Select faces to separate/);
 st.editSelect('face',Array.from({length:12},(_,i)=>i));
 assert.throws(()=>st.editSeparate(),/empty mesh/);
});
