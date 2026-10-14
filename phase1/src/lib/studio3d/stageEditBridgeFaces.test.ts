import test from 'node:test';
import assert from 'node:assert/strict';
import {Stage} from './stage';
import {bridgeFacesSelected} from './editMesh';

const CAPS=[0,1,2,3]; // +X and -X caps of the primitive cube

test('stage editBridgeFaces: sews the borders of two opposite cube caps, undo restores',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelect('face',CAPS);
 st.editBridgeFaces(0);
 assert.equal(o.geometry.getIndex()!.array.length/3,16);
 assert.equal(o.geometry.getAttribute('position').count,24);
 assert.deepEqual(st.editSelection(),{verts:[],edges:[],faces:[]});
 st.undo();
 assert.equal(o.geometry.getIndex()!.array.length/3,12);
 st.redo();
 assert.equal(o.geometry.getIndex()!.array.length/3,16);
});

test('stage editBridgeFaces: twist shifts the strip start',()=>{
 const mk=(twist:number)=>{const st=new Stage();const o=st.addPrimitive('cube') as import('three').Mesh;st.editStart(o.id);st.editSelect('face',CAPS);st.editBridgeFaces(twist);return JSON.stringify(Array.from(o.geometry.getIndex()!.array));};
 assert.notEqual(mk(0),mk(1));
});

test('stage editBridgeFaces: two leftover caps become an open band',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 st.editSelect('face',[4,5,6,7,8,9,10,11]);
 st.editDelete('face');
 st.editSelectAll('all','face');
 st.editBridgeFaces(0);
 assert.equal(o.geometry.getIndex()!.array.length/3,8);
});

test('stage editBridgeFaces: needs two separate face groups',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 assert.throws(()=>st.editBridgeFaces(0),/Select two groups of faces to bridge/);
 st.editSelectAll('all','face');
 assert.throws(()=>st.editBridgeFaces(0),/Select exactly two separate groups of faces to bridge/);
});

test('bridgeFacesSelected: rejects an unknown face',()=>{
 const st=new Stage();
 const o=st.addPrimitive('cube') as import('three').Mesh;
 st.editStart(o.id);
 const g=o.geometry;
 const m={positions:Array.from(g.getAttribute('position').array as Float32Array),index:Array.from(g.getIndex()!.array),uvs:Array.from(g.getAttribute('uv')!.array as Float32Array)};
 assert.throws(()=>bridgeFacesSelected(m,[99],0),/A selected face does not exist/);
});
