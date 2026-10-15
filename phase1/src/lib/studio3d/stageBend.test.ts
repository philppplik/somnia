import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';

test('stage bend: arcs the mesh sideways on concentric arcs, anchor end stays, undo restores',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 assert.equal(st.bend('y',45,[o.id]),1);
 const pos=o.geometry.getAttribute('position');
 assert.equal(pos.count,24);
 // R=4/pi over span 1; the tip section (y=0.5) reaches theta=45deg, radius R+x per bend-direction coordinate
 const near=(a:number,b:number)=>Math.abs(a-b)<1e-6;
 const R=4/Math.PI,c=Math.cos(Math.PI/4),s=Math.sin(Math.PI/4);
 let anchor=0,tipNear=0,tipFar=0;
 for(let v=0;v<pos.count;v++){
  const y=pos.getY(v),z=pos.getZ(v);
  if(near(y,-0.5)){assert.ok(near(z,-0.5)||near(z,0.5),'anchor keeps its spread');anchor++;continue;}
  if(near(y,-0.5+(R-0.5)*s)){assert.ok(near(z,(R-0.5)*c-R));tipNear++;continue;}
  if(near(y,-0.5+(R+0.5)*s)){assert.ok(near(z,(R+0.5)*c-R));tipFar++;continue;}
  assert.fail(`vertex off the arc: ${y},${z}`);
 }
 assert.equal(anchor,12);
 assert.equal(tipNear+tipFar,12);
 st.undo();
 const p2=o.geometry.getAttribute('position');
 let mx=-Infinity;for(let v=0;v<p2.count;v++)mx=Math.max(mx,p2.getY(v));
 assert.equal(mx,0.5);
});

test('stage bend: bends several meshes in one undo step',()=>{
 const st=new Stage();
 const a=st.addPrimitive('cube') as import('three').Mesh;
 const b=st.addPrimitive('cube') as import('three').Mesh;
 assert.equal(st.bend('y',30,[a.id,b.id]),2);
 st.undo();
 assert.equal((a.geometry.getAttribute('position').getY(0)),(b.geometry.getAttribute('position').getY(0)));
});

test('stage bend: validates the angle, edit mode and mesh type',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 assert.throws(()=>st.bend('y',0,[o.id]),/non-zero number of degrees/);
 assert.throws(()=>st.bend('y',400,[o.id]),/between -360 and 360/);
 st.editStart(o.id);
 assert.throws(()=>st.bend('y',30,[o.id]),/Leave edit mode/);
});
