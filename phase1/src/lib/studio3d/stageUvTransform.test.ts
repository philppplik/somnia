import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';

const uvsOf=(o:import('three').Mesh)=>{const a=o.geometry.getAttribute('uv');const out:[number,number][]=[];for(let i=0;i<a.count;i++)out.push([a.getX(i),a.getY(i)]);return out;};

test('stage editUvTransform: translate shifts every selected UV and leaves positions untouched',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 const before=uvsOf(o);
 const posBefore=[...(o.geometry.getAttribute('position').array as Float32Array)];
 st.editSelectAll('all','face');
 st.editUvTransform(0.25,0.1,0,1);
 const after=uvsOf(o);
 assert.equal(after.length,before.length);
 for(let i=0;i<after.length;i++){
  assert.ok(Math.abs(after[i][0]-(before[i][0]+0.25))<1e-6,`u ${i}`);
  assert.ok(Math.abs(after[i][1]-(before[i][1]+0.1))<1e-6,`v ${i}`);
 }
 assert.deepEqual([...(o.geometry.getAttribute('position').array as Float32Array)],posBefore);
});

test('stage editUvTransform: rotate 90 degrees around the UV centroid',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 const before=uvsOf(o);
 let cu=0,cv=0;for(const [u,v] of before){cu+=u;cv+=v;}
 cu/=before.length;cv/=before.length;
 st.editSelectAll('all','face');
 st.editUvTransform(0,0,90,1);
 const after=uvsOf(o);
 for(let i=0;i<after.length;i++){
  assert.ok(Math.abs(after[i][0]-(-(before[i][1]-cv)+cu))<1e-6,`u ${i}`);
  assert.ok(Math.abs(after[i][1]-((before[i][0]-cu)+cv))<1e-6,`v ${i}`);
 }
});

test('stage editUvTransform: scale only touches the selected faces UVs',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 const before=uvsOf(o);
 st.editSelectFacing('+y',45);
 const nSel=st.editSelection().faces.length;
 assert.equal(nSel,2);
 const selVerts=new Set<number>();
 const idx=o.geometry.getIndex()!;
 for(const f of st.editSelection().faces)for(let k=0;k<3;k++)selVerts.add(idx.getX(f*3+k));
 let cu=0,cv=0;for(const v of selVerts){cu+=before[v][0];cv+=before[v][1];}
 cu/=selVerts.size;cv/=selVerts.size;
 st.editUvTransform(0,0,0,2);
 const after=uvsOf(o);
 for(let i=0;i<after.length;i++){
  if(selVerts.has(i)){
   assert.ok(Math.abs(after[i][0]-((before[i][0]-cu)*2+cu))<1e-6,`u ${i}`);
   assert.ok(Math.abs(after[i][1]-((before[i][1]-cv)*2+cv))<1e-6,`v ${i}`);
  }else{
   assert.ok(Math.abs(after[i][0]-before[i][0])<1e-6&&Math.abs(after[i][1]-before[i][1])<1e-6,`untouched ${i}`);
  }
 }
});

test('stage editUvTransform: needs a face selection',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 assert.throws(()=>st.editUvTransform(0.1,0,0,1),/Select faces to transform their UVs/);
});
