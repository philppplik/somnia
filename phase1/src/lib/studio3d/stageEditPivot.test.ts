import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';

const near=(a:number,b:number)=>Math.abs(a-b)<1e-6;
const setup=()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelectAll('all','face');
 st.editSubdivide();
 st.editSelectAll('none','vertex');
 return {st,o,pos:()=>o.geometry.getAttribute('position')};
};
// subdivided cube: 35=(0,.5,0) top centre, 26=(.5,.5,0), 40=(0,-.5,0), 6=(-.5,-.5,-.5)

test('stage edit rotate orbits the 3D cursor pivot instead of the selection median',()=>{
 const {st,o,pos}=setup();
 st.editSelect('vertex',[35]);
 st.editRotate('y',90,undefined,[0.5,0.5,0]);
 const p=pos();
 assert.ok(near(p.getX(35),0.5)&&near(p.getY(35),0.5)&&near(p.getZ(35),0.5),`v35 swung to the cursor side ${p.getX(35)},${p.getZ(35)}`);
 assert.ok(near(p.getX(26),0.5)&&near(p.getZ(26),0),'unselected stays');
});

test('stage edit rotate without pivot keeps the selection median',()=>{
 const {st,o,pos}=setup();
 st.editSelect('vertex',[35]);
 st.editRotate('y',90);
 const p=pos();
 assert.ok(near(p.getX(35),0)&&near(p.getZ(35),0),'single vertex rotates in place');
});

test('stage edit scale grows from the world origin pivot',()=>{
 const {st,o,pos}=setup();
 st.editSelect('vertex',[35]);
 st.editScale([2,2,2],undefined,[0,0,0]);
 const p=pos();
 assert.ok(near(p.getY(35),1),'origin pivot doubles the height');
 assert.ok(near(p.getY(26),0.5),'unselected stays');
});

test('stage edit shear references the pivot plane',()=>{
 const {st,o,pos}=setup();
 st.editSelect('vertex',[35]);
 st.editShear('x','y',1,undefined,[0,-0.5,0]);
 const p=pos();
 assert.ok(near(p.getX(35),1),`shear against the low pivot ${p.getX(35)}`);
 const st2=new Stage();
 const o2=st2.addPrimitive('cube') as import('three').Mesh;
 st2.editStart(o2.id);
 st2.editSelectAll('all','face');
 st2.editSubdivide();
 st2.editSelectAll('none','vertex');
 st2.editSelect('vertex',[35]);
 st2.editShear('x','y',1);
 assert.ok(near((o2.geometry.getAttribute('position') as import('three').BufferAttribute).getX(35),0),'median pivot shears a single vertex in place');
});

test('stage edit pivot rejects non-finite points',()=>{
 const {st}=setup();
 st.editSelect('vertex',[35]);
 assert.throws(()=>st.editRotate('y',90,undefined,[Number.NaN,0,0]),/pivot point must be finite/);
 assert.throws(()=>st.editScale([2,2,2],undefined,[0,Infinity,0]),/pivot point must be finite/);
 assert.throws(()=>st.editShear('x','y',1,undefined,[0,0,Number.NaN]),/pivot point must be finite/);
});
