import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';

const setup=()=>{
 const st=new Stage();
 const a=st.addPrimitive('cube');
 const b=st.addPrimitive('cube');
 st.setTransform(b.id,{position:{x:2,y:0.5,z:0}});
 return{st,a,b};
};
const snap=(...os:{position:{x:number;y:number;z:number};scale:{x:number}}[])=>os.map(o=>[o.position.x,o.position.y,o.position.z,o.scale.x]);

test('stage randomizeTransform: same seed reproduces the same scatter, another seed differs',()=>{
 const s1=setup(),s2=setup(),s3=setup();
 s1.st.randomizeTransform([s1.a.id,s1.b.id],7,0.5,30,0.2);
 s2.st.randomizeTransform([s2.a.id,s2.b.id],7,0.5,30,0.2);
 s3.st.randomizeTransform([s3.a.id,s3.b.id],8,0.5,30,0.2);
 assert.deepEqual(snap(s1.a,s1.b),snap(s2.a,s2.b),'same seed, same scatter');
 assert.notDeepEqual(snap(s1.a,s1.b),snap(s3.a,s3.b),'another seed scatters differently');
 assert.ok(Math.abs(s1.a.position.x)<0.5+1e-9,'move range respected');
});

test('stage randomizeTransform: one undo restores every transform exactly',()=>{
 const{st,a,b}=setup();
 const before=snap(a,b);
 st.randomizeTransform([a.id,b.id],3,0.5,30,0.2);
 assert.notDeepEqual(snap(a,b),before);
 st.undo();
 assert.deepEqual(snap(a,b),before);
 st.redo();
 assert.notDeepEqual(snap(a,b),before);
});

test('stage randomizeTransform: validates seed and ranges',()=>{
 const{st,a}=setup();
 assert.throws(()=>st.randomizeTransform([a.id],1.5,0.5,0,0),/whole number/);
 assert.throws(()=>st.randomizeTransform([a.id],1,-0.5,0,0),/non-negative/);
 assert.throws(()=>st.randomizeTransform([a.id],1,0,0,0),/above zero/);
 assert.throws(()=>st.randomizeTransform([],1,0.5,0,0),/Select at least 1/);
});
