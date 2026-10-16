import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';
import {textFont,missingGlyphs} from './text3d';

test('addText: extruded mesh on the ground, centred, depth and bevel parameters work, one undo step',()=>{
 const st=new Stage();
 const{mesh}=st.addText({text:'Hallo',size:1,depth:0.25,bevel:true});
 assert.ok(mesh.geometry.getAttribute('position').count>100);
 mesh.geometry.computeBoundingBox();
 const b=mesh.geometry.boundingBox!;
 assert.ok(Math.abs(b.min.y)<1e-6,'sits on y=0');
 assert.ok(Math.abs(b.min.z+b.max.z)<1e-6,'z centred');
 assert.ok(b.max.z-b.min.z>0.25,'bevel adds to the depth');
 const before=st.measure().stats.meshes;
 st.undo();assert.equal(st.measure().stats.meshes,before-1);
 st.redo();assert.equal(st.measure().stats.meshes,before);
});

test('addText: bevel off gives exactly the requested depth',()=>{
 const st=new Stage();
 const{mesh}=st.addText({text:'Hi',size:1,depth:0.5,bevel:false});
 mesh.geometry.computeBoundingBox();
 const b=mesh.geometry.boundingBox!;
 assert.ok(Math.abs(b.max.z-b.min.z-0.5)<1e-6,`depth ${b.max.z-b.min.z}`);
});

test('addText: size scales the outlines',()=>{
 const st=new Stage();
 const a=st.addText({text:'Hi',size:1,bevel:false}).mesh;
 const b2=st.addText({text:'Hi',size:2,bevel:false}).mesh;
 a.geometry.computeBoundingBox();b2.geometry.computeBoundingBox();
 const ha=a.geometry.boundingBox!.max.y-a.geometry.boundingBox!.min.y;
 const hb=b2.geometry.boundingBox!.max.y-b2.geometry.boundingBox!.min.y;
 assert.ok(Math.abs(hb/ha-2)<0.01,`size ratio ${hb/ha}`);
});

test('addText: uncovered characters are reported and skipped, empty and overlong text throw',()=>{
 const st=new Stage();
 const r=st.addText({text:'a€b'});
 assert.deepEqual(r.missing,['€']);
 assert.ok(r.mesh.geometry.getAttribute('position').count>0);
 assert.throws(()=>st.addText({text:'   '}),/empty/);
 assert.throws(()=>st.addText({text:'x'.repeat(201)}),/200/);
});

test('missingGlyphs: space is fine, dedupe works',()=>{
 assert.deepEqual(missingGlyphs(textFont(),'a b€€c'),['€']);
 assert.deepEqual(missingGlyphs(textFont(),'Hello'),[]);
});
