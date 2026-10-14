import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';

test('stage editSelectSimilar: selects faces within the normal threshold of the seed',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelect('face',[4]);
 st.editSelectSimilar(15);
 assert.deepEqual(st.editSelection().faces,[4,5]);
 st.editSelect('face',[4]);
 st.editSelectSimilar(95);
 assert.equal(st.editSelection().faces.length,10);
 st.editSelect('face',[4]);
 st.editSelectSimilar(180);
 assert.equal(st.editSelection().faces.length,12);
});

test('stage editSelectSimilar: needs a face selection and a valid angle',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 assert.throws(()=>st.editSelectSimilar(15),/Select faces first/);
 st.editSelect('face',[0]);
 assert.throws(()=>st.editSelectSimilar(-1),/between 0 and 180/);
 assert.throws(()=>st.editSelectSimilar(Number.NaN),/between 0 and 180/);
});

test('stage editSelectSimilar: coplanar seeds and duplicated shells select by direction, not position',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelect('face',[4,5]);
 st.editDuplicate();
 st.editSelectAll({op:'none',kind:'face'});
 st.editSelect('face',[4]);
 st.editSelectSimilar(15);
 assert.deepEqual(st.editSelection().faces,[4,5,12,13]);
});
