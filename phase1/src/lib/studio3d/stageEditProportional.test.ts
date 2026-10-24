import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';
import {moveSelected} from './editMesh';

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
// subdivided cube: 35=(0,.5,0) top centre, 26=(.5,.5,0) d=.5, 0=(.5,.5,.5) d=.7071, 40=(0,-.5,0) d=1, 6=(-.5,-.5,-.5) d=1.2247

test('stage proportional move: smooth falloff pulls nearby vertices and leaves far ones',()=>{
 const {st,o,pos}=setup();
 st.editSelect('vertex',[35]);
 st.editMove([0,0.5,0],{radius:1.2,falloff:'smooth'});
 const p=pos();
 assert.ok(near(p.getY(35),1),'selected moves fully');
 assert.ok(near(p.getY(26),0.5+0.5*0.6829193),`d=0.5 ${p.getY(26)}`);
 assert.ok(near(p.getY(0),0.5+0.5*0.4261188),`d=0.7071 ${p.getY(0)}`);
 assert.ok(near(p.getY(40),-0.5+0.5*0.0933642),`d=1 ${p.getY(40)}`);
 assert.ok(near(p.getY(6),-0.5),'d=1.2247 beyond radius stays');
});

test('stage proportional move: linear and constant falloff shapes differ',()=>{
 const {st,o,pos}=setup();
 st.editSelect('vertex',[35]);
 st.editMove([0,0.5,0],{radius:1,falloff:'linear'});
 assert.ok(near(pos().getY(26),0.75),'linear d=0.5');
 const st2=new Stage();
 const o2=st2.addPrimitive('cube') as import('three').Mesh;
 st2.editStart(o2.id);
 st2.editSelectAll('all','face');
 st2.editSubdivide();
 st2.editSelectAll('none','vertex');
 st2.editSelect('vertex',[35]);
 st2.editMove([0,0.5,0],{radius:1,falloff:'constant'});
 const p2=o2.geometry.getAttribute('position');
 assert.ok(near(p2.getY(26),1),'constant pulls fully inside radius');
 assert.ok(near(p2.getY(40),-0.5),'constant stops at the radius');
});

test('stage proportional scale: partial scale around the selection centroid',()=>{
 const {st,o,pos}=setup();
 st.editSelect('vertex',[35]);
 st.editScale([2,2,2],{radius:1,falloff:'smooth'});
 const p=pos();
 assert.ok(near(p.getX(26),0.5+0.5*0.5625),`scale d=0.5 ${p.getX(26)}`);
 assert.ok(near(p.getX(6),-0.5),'far stays');
 assert.ok(near(p.getY(35),0.5),'selected vertex on the pivot height keeps y');
});

test('stage proportional rotate: partial rotation around the selection centroid',()=>{
 const {st,o,pos}=setup();
 st.editSelect('vertex',[35]);
 st.editRotate('y',90,{radius:1,falloff:'smooth'});
 const p=pos();
 assert.ok(near(p.getX(26),0.5-0.5*0.5625)&&near(p.getZ(26),0-0.5*0.5625),`rotate d=0.5 ${p.getX(26)},${p.getZ(26)}`);
 assert.ok(near(p.getX(35),0)&&near(p.getZ(35),0),'selected vertex on the pivot keeps x/z');
});

test('stage proportional shear: partial shear by falloff',()=>{
 const {st,o,pos}=setup();
 st.editSelect('vertex',[40]);
 st.editShear('x','y',1,{radius:1.2,falloff:'smooth'});
 const p=pos();
 assert.ok(near(p.getX(35),0.0933642),`shear d=1 ${p.getX(35)}`);
 assert.ok(p.getX(26)>0.5&&p.getX(26)<0.53,`shear d=1.118 ${p.getX(26)}`);
 assert.ok(near(p.getX(0),0.5),'far stays');
});

test('stage proportional move: a tiny radius moves only the selection',()=>{
 const {st,o,pos}=setup();
 st.editSelect('vertex',[35]);
 st.editMove([0,0.5,0],{radius:0.1,falloff:'smooth'});
 assert.ok(near(pos().getY(26),0.5),'neighbour outside radius');
});

test('stage edit move without proportional leaves neighbours untouched',()=>{
 const {st,o,pos}=setup();
 st.editSelect('vertex',[35]);
 st.editMove([0,0.5,0]);
 assert.ok(near(pos().getY(35),1)&&near(pos().getY(26),0.5),'uniform move');
});

test('proportional connected: geodesic distance leaves unconnected islands still',()=>{
 // Two disconnected triangles: A at z=0 around the origin, B shifted +0.5y (inside the radius, no shared edges).
 const m={positions:[0,0,0, 1,0,0, 0,0,1, 0,0.5,0, 1,0.5,0, 0,0.5,1],index:[0,1,2,3,4,5]};
 const moved=moveSelected(m,[0],[0,0.5,0],{radius:1,falloff:'constant',connected:true});
 assert.ok(near(moved.positions[3*3+1],0.5),`island stays put, got y=${moved.positions[3*3+1]}`);
 assert.ok(near(moved.positions[1],0.5),'selected vertex moves');
 const movedFree=moveSelected(m,[0],[0,0.5,0],{radius:1,falloff:'constant'});
 assert.ok(near(movedFree.positions[3*3+1],1),'island follows when connected is off');
});
